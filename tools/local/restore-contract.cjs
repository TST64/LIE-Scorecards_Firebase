'use strict';
const crypto=require('node:crypto'),H=require('../../functions/hcp-rules'),{hash,roundDigest}=require('../../functions/round-close');
const PROJECT='demo-lie-scorecards-local';
const COLLECTIONS=['spieler','spieler_public','spieltage','flights','scorecards','scoreSyncV2Generations','scoreSyncV2Mutations','scoreSyncV2Requests','roundClosureReceipts','historyCorrectionRuns','historyCorrectionStages','historyPublication','kurse','bahnen','handicaps','golfplaetze','kalender_termine','config','settings','scores','localMaintenance','localMaintenanceRequests'];
function check(ok,message){if(!ok)throw new Error(message);}
function canonical(x){return Array.isArray(x)?x.map(canonical):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;}
function digest(x){return crypto.createHash('sha256').update(JSON.stringify(canonical(x))).digest('hex');}
function time(x){return x&&Number.isSafeInteger(x.seconds)&&Number.isInteger(x.nanoseconds)&&x.nanoseconds>=0&&x.nanoseconds<1e9;}
function encode(x){
    if(x===null||typeof x==='string'||typeof x==='boolean')return x;
    if(typeof x==='number')return Number.isFinite(x)?x:{__s08Type:'number',value:String(x)};
    if(Buffer.isBuffer(x)||x instanceof Uint8Array)return {__s08Type:'bytes',value:Buffer.from(x).toString('base64')};
    if(x&&time(x)&&typeof x.toDate==='function')return {__s08Type:'timestamp',seconds:x.seconds,nanoseconds:x.nanoseconds};
    if(x&&typeof x.path==='string'&&x.firestore){check(x.firestore.projectId===PROJECT,'Foreign reference');return {__s08Type:'reference',path:x.path};}
    if(x?.constructor?.name==='GeoPoint'&&typeof x.isEqual==='function'&&typeof x.latitude==='number'&&typeof x.longitude==='number')return {__s08Type:'geopoint',latitude:x.latitude,longitude:x.longitude};
    if(Array.isArray(x))return x.map(encode);
    check(x&&typeof x==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(x))&&!Object.hasOwn(x,'__s08Type'),'Unsupported or reserved backup value');return Object.fromEntries(Object.entries(x).map(([k,v])=>[k,encode(v)]));
}
function decode(x,db,admin){
    if(Array.isArray(x))return x.map(v=>decode(v,db,admin));if(x===null||typeof x!=='object')return x;
    if(x.__s08Type){switch(x.__s08Type){case 'timestamp':check(time(x),'Bad timestamp');return new admin.firestore.Timestamp(x.seconds,x.nanoseconds);case 'bytes':return Buffer.from(x.value,'base64');case 'reference':check(/^[^/]+\/[^/]+$/.test(x.path),'Invalid reference');return db.doc(x.path);case 'geopoint':return new admin.firestore.GeoPoint(x.latitude,x.longitude);case 'number':check(['NaN','Infinity','-Infinity'].includes(x.value),'Bad number');return Number(x.value);default:throw new Error('Unknown backup type');}}
    return Object.fromEntries(Object.entries(x).map(([k,v])=>[k,decode(v,db,admin)]));
}
function validateSnapshot(s){
    check(s?.schema===1&&s.projectId===PROJECT&&s.synthetic===true,'Only versioned synthetic demo backups');
    check(s.cut?.state==='quiesced'&&s.cut.active===0&&typeof s.cut.instanceId==='string','Backup lacks quiescence');
    check(Array.isArray(s.documents)&&Array.isArray(s.users)&&s.users.length>0,'Incomplete inventory');
    const map=new Map();for(const d of s.documents){check(typeof d.path==='string'&&/^[A-Za-z0-9_]+\/[^/]+$/.test(d.path)&&COLLECTIONS.includes(d.path.split('/')[0])&&time(d.createTime)&&d.data&&typeof d.data==='object'&&!map.has(d.path),'Invalid document inventory');map.set(d.path,d);}
    const rows=c=>s.documents.filter(d=>d.path.startsWith(c+'/')),get=p=>map.get(p)?.data;
    check(!rows('spieltage').some(d=>d.data.closure?.phase==='collecting'),'Open closure backup refused');
    check(get('localMaintenance/current')?.state==='quiesced','Maintenance not frozen');check(!rows('localMaintenanceRequests').some(d=>d.data.active),'Active request in backup');
    const users=new Map(s.users.map(u=>[u.uid,u]));check(users.size===s.users.length,'Duplicate Auth UID');
    for(const d of rows('spieler')){const p=d.data,uid=d.path.split('/')[1],u=users.get(uid);check(u&&u.customClaims?.playerId===uid&&u.customClaims.role===p.role&&typeof u.customClaims.mustChangePin==='boolean','Auth claims missing or stale');check(p.pinChangePending?p.mustChangePin===true:u.customClaims.mustChangePin===(p.mustChangePin===true),'PIN/claims inconsistent');check(get('spieler_public/'+uid),'Player projection missing');}
    check(s.users.every(u=>get('spieler/'+u.uid)),'Orphan Auth UID');
    const allCards=rows('scorecards'),cards=allCards.map(d=>d.data);
    for(const d of allCards){const c=d.data,g=c._sync?.generation;check(typeof g==='string'&&g.startsWith('gen:'),'Legacy generation requires separate quarantine');check(c.id===d.path.split('/')[1]&&c.id==='SC-'+c.spieltagId+'-'+c.spielerId+'-'+c.hole,'Bad score identity');const binding=map.get('scoreSyncV2Generations/'+hash([c.id,g]));check(binding&&binding.data.documentId===c.id&&binding.data.generation===g&&digest(binding.createTime)===digest(d.createTime),'Missing or inconsistent source birth binding');
        for(const meta of Object.values(c._sync.fields||{})){check(Number.isSafeInteger(meta.revision)&&meta.revision>0&&typeof meta.lastMutationId==='string','Bad field revision');check(s.users.some(u=>{const r=get('scoreSyncV2Mutations/'+hash([u.uid,meta.lastMutationId]));return r?.generation===g&&r.appliedRevision===meta.revision;}),'Referenced mutation receipt missing');}
    }
    for(const d of rows('scoreSyncV2Generations'))check(allCards.some(c=>c.data.id===d.data.documentId&&c.data._sync.generation===d.data.generation),'Orphan generation binding');
    const rounds=rows('spieltage').map(d=>d.data).sort((a,b)=>String(a.date).localeCompare(String(b.date))||a.id.localeCompare(b.id));
    const closed=rounds.filter(r=>r.status==='Beendet'),config=get('config/saison');check(config?.saisonStartDatum,'Season missing');
    const initial=Object.fromEntries(rows('spieler').map(d=>{const id=d.path.split('/')[1];return[id,Object.hasOwn(config.seasonStartHcpByPlayer||{},id)?config.seasonStartHcpByPlayer[id]:26];}));
    const plan=H.plan(closed,cards,initial,r=>r.hcpHoleData,r=>r.hcpCourseTable||[]);check(plan.entries.every(e=>e.complete),'Incomplete closed season');
    for(const r of rounds){const ids=String(r.teilnehmerCsv||'').split(',').filter(Boolean);H.validateRoundSnapshot(r,ids);const flights=rows('flights').filter(d=>d.data.spieltagId===r.id).map(d=>({id:d.path.split('/')[1],members:String(d.data.spielerIdsCsv).split(',')})).sort((a,b)=>a.id.localeCompare(b.id)),assigned=flights.flatMap(f=>f.members);check(assigned.length===ids.length&&new Set(assigned).size===ids.length&&ids.every(p=>assigned.includes(p)),'Invalid flight partition');
        if(r.status!=='Beendet')continue;
        const raw=cards.filter(c=>c.spieltagId===r.id).sort((a,b)=>a.id.localeCompare(b.id)),expected=roundDigest(r,flights,raw);check(r._roundClose?.version===1&&r.closure?.phase==='published'&&r._roundClose.scoreDigest===expected&&r.closure.scoreDigest===expected,'Closure digest invalid');
        const receipt=get('roundClosureReceipts/'+hash([r.id,r._roundClose.closeId]));check(receipt?.state==='published','Closure receipt missing');
        if(r._roundClose.historyCorrection){const run=get('historyCorrectionRuns/'+r._roundClose.historyCorrection.runId),published=run?.result?.rounds?.find(x=>x.id===r.id);check(run?.phase==='published'&&published?.revision===r._roundClose.revision&&published.scoreDigest===r._roundClose.scoreDigest,'Historical closure revision inconsistent');}else check(receipt.result?.revision===r._roundClose.revision,'Closure revision inconsistent');
        for(const p of ids){const e=plan.entries.find(e=>e.roundId===r.id&&e.playerId===p),result=r._roundClose.results.find(e=>e.playerId===p);check(e&&e.startHcp===r.hcpStart[p]&&e.endHcp===r.hcpEnd[p]&&e.endHcp===r._roundClose.hcpEnd[p]&&result?.totalNetto===e.totalNetto,'HCP chain invalid');}
    }
    for(const d of rows('spieler')){const id=d.path.split('/')[1],p=d.data,q=get('spieler_public/'+id),last=closed.slice().reverse().find(r=>String(r.teilnehmerCsv).split(',').includes(id));check(last&&p.hcpLIE===plan.currentHcp[id]&&q.hcpLIE===p.hcpLIE&&digest(p.hcpClosure)===digest(q.hcpClosure)&&p.hcpClosure.revision===last._roundClose.revision&&p.hcpClosure.scoreDigest===last._roundClose.scoreDigest,'HCP projection invalid');}
    for(const d of rows('historyCorrectionRuns')){const r=d.data;check(Array.isArray(r.plan)&&hash(r.plan)===r.planHash&&r.plan.length<=480&&Number.isSafeInteger(r.nextBatch),'History plan invalid');const confirmed=Math.min(r.nextBatch*400,r.plan.length);for(let i=0;i<confirmed;i++){const stage=get('historyCorrectionStages/'+r.runId+'-'+i);check(stage&&stage.planHash===r.planHash&&stage.index===i&&hash(stage.payload)===hash(r.plan[i]),'Confirmed history stage missing');}if(r.phase==='published')check(r.result?.phase==='published'&&confirmed===r.plan.length,'Published history incomplete');}
    for(const d of rows('historyCorrectionStages')){const stage=d.data,run=rows('historyCorrectionRuns').find(r=>r.data.planHash===stage.planHash)?.data;check(run&&hash(stage.payload)===hash(run.plan[stage.index]),'Unknown/tampered history stage');}
    const pub=get('historyPublication/current');if(pub?.activeRun)check(get('historyCorrectionRuns/'+pub.activeRun)?.phase==='staging'||get('historyCorrectionRuns/'+pub.activeRun)?.phase==='ready','History lock invalid');if(pub?.revision>0)check(get('historyCorrectionRuns/'+pub.lastRunId)?.result?.revision===pub.revision,'Published history pointer invalid');
    return s;
}
function seal(payload){validateSnapshot(payload);const names=[...new Set(payload.documents.map(d=>d.path.split('/')[0]))].sort(),inventory=names.map(collection=>{const rows=payload.documents.filter(d=>d.path.startsWith(collection+'/')).sort((a,b)=>a.path.localeCompare(b.path));return {collection,count:rows.length,checksum:digest(rows)};});const body={schema:1,payload,inventory};return {...body,digest:digest(body)};}
function verify(artifact,expectedDigest){check(typeof expectedDigest==='string'&&/^[a-f0-9]{64}$/.test(expectedDigest),'Independent backup anchor required');const {digest:stored,...body}=artifact;check(stored===expectedDigest&&digest(body)===expectedDigest,'Backup checksum mismatch');const rebuilt=seal(artifact.payload);check(digest(rebuilt.inventory)===digest(artifact.inventory),'Inventory mismatch');return artifact.payload;}
function groups(snapshot){validateSnapshot(snapshot);const byPath=new Map(snapshot.documents.map(d=>[d.path,d])),done=new Set(['localMaintenance/current']),result=[];for(const card of snapshot.documents.filter(d=>d.path.startsWith('scorecards/')).sort((a,b)=>a.path.localeCompare(b.path))){const path='scoreSyncV2Generations/'+hash([card.data.id,card.data._sync.generation]);result.push([card,byPath.get(path)]);done.add(card.path);done.add(path);}for(const d of snapshot.documents.slice().sort((a,b)=>a.path.localeCompare(b.path)))if(!done.has(d.path))result.push([d]);return result;}
module.exports={PROJECT,COLLECTIONS,canonical,digest,encode,decode,validateSnapshot,seal,verify,groups};
