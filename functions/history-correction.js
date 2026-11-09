'use strict';
const H=require('./hcp-rules');
const {inspectRound,hash,roundDigest}=require('./round-close');
const {readDocumentState}=require('./score-operations-v2');
const {historyState}=require('./history-lock');
const FIELDS=['strokes','puts','lady','maxscore'],BATCH=400,MAX_WRITES=480;
function check(ok,code){if(!ok){const error=new Error(code);error.code=code;throw error;}}
function id(x){return typeof x==='string'&&/^[A-Za-z0-9][A-Za-z0-9_-]{0,199}$/.test(x);}
function date(x){try{return typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&new Date(x).toISOString().slice(0,10)===x;}catch(_){return false;}}
function reference(db,path){const [collection,...rest]=path.split('/');check(rest.length===1&&id(rest[0]),'invalid-plan-path');return db.collection(collection).doc(rest[0]);}
async function authorize(tx,db,auth){
    check(auth&&auth.uid===auth.token?.playerId&&auth.token.role==='Admin'&&auth.token.mustChangePin===false,'admin-required');
    const actor=await tx.get(db.collection('spieler').doc(auth.uid));check(actor.exists&&actor.data().role==='Admin'&&!actor.data().mustChangePin&&!actor.data().pinChangePending&&!actor.data().istGeloescht,'admin-required');
}
function publicStatus(run){return {runId:run.runId,phase:run.phase,staged:Math.min(run.nextBatch*BATCH,run.plan.length),writeCount:run.plan.length,planHash:run.planHash,basisHash:run.basisHash,summary:run.summary||[],change:run.change,result:run.result||null};}
function ranked(rows){let last=null,rank=0;return rows.slice().sort((a,b)=>b.totalNetto-a.totalNetto||a.playerId.localeCompare(b.playerId)).map((r,i)=>{if(r.totalNetto!==last){last=r.totalNetto;rank=i+1;}return {...r,rank};});}
async function planCorrection(tx,db,auth,change,mutationOwner=auth.uid){
    check(change&&Object.keys(change).every(k=>['documentId','field','operation','value','baseFieldRevision','baseDocumentGeneration','changeId'].includes(k))&&id(change.documentId)&&id(change.changeId)&&FIELDS.includes(change.field)&&['set','delete'].includes(change.operation),'invalid-change');
    check(change.operation==='delete'?change.value===null:['strokes','puts'].includes(change.field)?Number.isSafeInteger(change.value)&&change.value>=(change.field==='strokes'?1:0):typeof change.value==='boolean','invalid-value');
    const control=await historyState(tx,db),target=await tx.get(db.collection('scorecards').doc(change.documentId));check(target.exists,'score-missing');
    check(!(await tx.get(db.collection('scoreSyncV2Mutations').doc(hash([mutationOwner,change.changeId])))).exists,'mutation-id-reused');
    check(Number.isSafeInteger(control.revision||0)&&(control.revision||0)>=0&&(control.revision||0)<Number.MAX_SAFE_INTEGER,'publication-revision-invalid');
    const raw=target.data(),state=readDocumentState(target);check(state.generation===change.baseDocumentGeneration&&state.revisions[change.field]===change.baseFieldRevision&&change.baseFieldRevision<Number.MAX_SAFE_INTEGER,'stale-score-cas');
    const configSnap=await tx.get(db.collection('config').doc('saison'));check(configSnap.exists,'season-missing');const config=configSnap.data();check(date(config.saisonStartDatum),'season-invalid');
    const closed=await tx.get(db.collection('spieltage').where('status','==','Beendet')),active=await tx.get(db.collection('spieltage').where('status','==','Aktiv'));
    const all=closed.docs.map(d=>({...d.data(),id:d.id})),first=all.find(r=>r.id===raw.spieltagId);check(first&&!first.istGeloescht,'published-round-required');
    const members=r=>String(r.teilnehmerCsv||'').split(',').filter(Boolean),family=new Set(members(first)),rounds=[];let grew=true;
    while(grew){grew=false;for(const r of all){if(!members(r).some(p=>family.has(p)))continue;check(date(r.date),'historical-date-invalid');if(r.date<config.saisonStartDatum)continue;check(!r.istGeloescht,'deleted-history-blocked');if(!rounds.some(x=>x.id===r.id)){rounds.push(r);grew=true;members(r).forEach(p=>family.add(p));}}}
    check(family.size>0&&family.size<=12&&rounds.length<=12&&rounds.some(r=>r.id===first.id),'bounded-family-required');
    check(!active.docs.some(d=>members(d.data()).some(p=>family.has(p))),'active-following-round-blocks-correction');
    rounds.sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));check(rounds.every(r=>r._roundStart?.version===1&&/^[a-f0-9]{64}$/.test(r._roundStart.fingerprint)&&r._roundClose?.version===1&&r.closure?.phase==='published'&&Number.isSafeInteger(r._roundClose.revision)&&r._roundClose.revision>0&&Number.isSafeInteger(r.hcpSnapshotRevision??1)&&(r.hcpSnapshotRevision??1)>0),'legacy-closure-blocked');
    const bases=[];for(const round of rounds){const view=await inspectRound(tx,db,round.id,round,true),expected=ranked(view.results);check(view.complete&&round._roundClose.scoreDigest===view.scoreDigest&&round._roundClose.scoreRevision===view.scoreRevision&&round.closure.scoreDigest===view.scoreDigest&&round.closure.scoreRevision===view.scoreRevision&&round.closure.id===round._roundClose.closeId&&hash(round._roundClose.results)===hash(expected)&&hash(round.hcpEnd)===hash(round._roundClose.hcpEnd)&&hash(round._roundClose.nettoWinners)===hash(expected.filter(p=>p.rank===1).map(p=>p.playerId)),'published-basis-mismatch');bases.push({round,view});}
    const cards=bases.flatMap(b=>b.view.cards);check(cards.length<=1000,'source-too-large');
    const initial=Object.fromEntries([...family].map(p=>[p,Object.hasOwn(config.seasonStartHcpByPlayer||{},p)?H.normalizeHcp(config.seasonStartHcpByPlayer[p]):26]));
    const before=H.plan(rounds,cards,initial,r=>r.hcpHoleData,r=>r.hcpCourseTable||[]);
    check(before.entries.every(e=>e.complete&&rounds.find(r=>r.id===e.roundId).hcpStart[e.playerId]===e.startHcp&&rounds.find(r=>r.id===e.roundId)._roundClose.hcpEnd[e.playerId]===e.endHcp),'historical-chain-invalid');
    const projections=[];for(const p of family){const a=await tx.get(db.collection('spieler').doc(p)),b=await tx.get(db.collection('spieler_public').doc(p)),latest=rounds.slice().reverse().find(r=>members(r).includes(p));check(a.exists&&b.exists&&!a.data().istGeloescht&&a.data().hcpLIE===before.currentHcp[p]&&b.data().hcpLIE===before.currentHcp[p]&&hash(a.data().hcpClosure)===hash(b.data().hcpClosure)&&a.data().hcpClosure?.roundId===latest.id&&a.data().hcpClosure?.closeId===latest._roundClose.closeId&&a.data().hcpClosure?.revision===latest._roundClose.revision&&a.data().hcpClosure?.scoreDigest===latest._roundClose.scoreDigest,'projection-chain-invalid');projections.push({id:p,hcpLIE:a.data().hcpLIE,hcpClosure:a.data().hcpClosure});}
    const changed=structuredClone(cards),card=changed.find(c=>c.id===change.documentId);check(card&&card.spieltagId===first.id,'target-not-in-chain');
    if(change.operation==='delete')delete card[change.field];else card[change.field]=change.value;
    card._sync.fields[change.field]={revision:change.baseFieldRevision+1,lastMutationId:change.changeId};
    const after=H.plan(rounds,changed,initial,r=>r.hcpHoleData,r=>r.hcpCourseTable||[]);check(after.entries.every(e=>e.complete),'correction-would-be-incomplete');
    const affected=bases.slice(rounds.findIndex(r=>r.id===first.id));const plan=[],changes=[];
    for(const {round,view} of affected){
        const entries=after.entries.filter(e=>e.roundId===round.id),next={...round,hcpSnapshotRevision:(round.hcpSnapshotRevision??1)+1,hcpStart:Object.fromEntries(entries.map(e=>[e.playerId,e.startHcp])),holeAllowances:Object.fromEntries(entries.map(e=>[e.playerId,e.holeAllowances])),hcpEnd:Object.fromEntries(entries.map(e=>[e.playerId,e.endHcp]))};
        const nextCards=changed.filter(c=>c.spieltagId===round.id).map(c=>({...c,hcpSnapshotRevision:next.hcpSnapshotRevision,hcpStart:next.hcpStart[c.spielerId],strokesGiven:next.holeAllowances[c.spielerId][c.hole]}));
        for(const c of nextCards)plan.push({path:'scorecards/'+c.id,data:c});
        const results=ranked(entries.map(({roundId,holeAllowances,...e})=>e)),revision=round._roundClose.revision+1,scoreRevision=view.scoreRevision+1,scoreDigest=roundDigest(next,view.flights,nextCards);
        check(Number.isSafeInteger(revision)&&Number.isSafeInteger(scoreRevision)&&Number.isSafeInteger(next.hcpSnapshotRevision),'revision-exhausted');
        next.scoreRevision=scoreRevision;next.nettoSieger=results.filter(r=>r.rank===1).map(r=>r.playerId).join(',');
        next._roundClose={...round._roundClose,revision,scoreRevision,scoreDigest,hcpEnd:next.hcpEnd,results,nettoWinners:results.filter(r=>r.rank===1).map(r=>r.playerId),brutto:{status:'not-rated'}};
        next.closure={...round.closure,phase:'published',scoreRevision,scoreDigest};
        plan.push({path:'spieltage/'+round.id,data:next});changes.push({id:round.id,before:{hcpStart:round.hcpStart,hcpEnd:round.hcpEnd,revision:round._roundClose.revision,scoreDigest:round._roundClose.scoreDigest},hcpStart:next.hcpStart,hcpEnd:next.hcpEnd,results});
    }
    for(const p of family){const latest=affected.slice().reverse().find(b=>members(b.round).includes(p));if(!latest)continue;const round=plan.find(w=>w.path==='spieltage/'+latest.round.id).data;const data={hcpLIE:after.currentHcp[p],hcpClosure:{roundId:round.id,closeId:round._roundClose.closeId,revision:round._roundClose.revision,scoreDigest:round._roundClose.scoreDigest}};for(const collection of ['spieler','spieler_public'])plan.push({path:collection+'/'+p,data,merge:true});}
    check(plan.length<=MAX_WRITES&&Buffer.byteLength(JSON.stringify(plan))<=600*1024,'publication-bound-exceeded');
    // Approval binds the exact requested mutation AND complete deterministic
    // logical plan, not just the source version shown before confirmation.
    const sourceHash=hash({config,rounds,cards,projections,revision:control.revision||0}),basisHash=hash({sourceHash,change,plan}),op={ownerUid:auth.uid,playerId:auth.uid,spieltagId:raw.spieltagId,flightId:bases.find(b=>b.round.id===raw.spieltagId).view.flights.find(f=>f.members.includes(raw.spielerId)).id,spielerId:raw.spielerId,hole:raw.hole,...change};
    return {basisHash,plan,changes,op,sourceTarget:target.data(),controlRevision:control.revision||0};
}
function createHistoryCorrection(db){return async function(auth,input){
    const r=structuredClone(input||{});check(['preview','prepare','status','stage','publish','cancel'].includes(r.action)&&Object.keys(r).every(k=>['action','change','runId','expectedBasis'].includes(k)),'invalid-request');if(r.action!=='preview')check(id(r.runId),'invalid-run-id');
    const runRef=r.runId?db.collection('historyCorrectionRuns').doc(r.runId):null,controlRef=db.collection('historyPublication').doc('current');
    if(r.action==='stage'){
        const run=await db.runTransaction(async tx=>{await authorize(tx,db,auth);const s=await tx.get(runRef),c=await historyState(tx,db);check(s.exists&&c.activeRun===r.runId,'run-not-locked');return s.data();});
        if(run.phase==='ready')return publicStatus(run);check(run.phase==='staging','run-not-stageable');
        const index=run.nextBatch,items=run.plan.slice(index*BATCH,(index+1)*BATCH),batch=db.batch();
        items.forEach((item,j)=>batch.set(db.collection('historyCorrectionStages').doc(r.runId+'-'+(index*BATCH+j)),{planHash:run.planHash,index:index*BATCH+j,payload:item}));await batch.commit();
        return db.runTransaction(async tx=>{await authorize(tx,db,auth);const s=await tx.get(runRef),c=await historyState(tx,db);check(c.activeRun===r.runId,'run-not-locked');const current=s.data();if(current.nextBatch!==index)return publicStatus(current);
            const staged=await Promise.all(items.map((_,j)=>tx.get(db.collection('historyCorrectionStages').doc(r.runId+'-'+(index*BATCH+j)))));check(staged.every((s,j)=>s.exists&&s.data().planHash===run.planHash&&hash(s.data().payload)===hash(items[j])),'staging-incomplete');
            current.nextBatch++;current.phase=current.nextBatch*BATCH>=current.plan.length?'ready':'staging';tx.set(runRef,current);return publicStatus(current);
        });
    }
    return db.runTransaction(async tx=>{
        await authorize(tx,db,auth);
        if(r.action==='preview'){const p=await planCorrection(tx,db,auth,r.change);return {basisHash:p.basisHash,writeCount:p.plan.length,changes:p.changes};}
        const stored=await tx.get(runRef),control=await historyState(tx,db);
        if(r.action==='status'){check(stored.exists,'run-missing');return publicStatus(stored.data());}
        if(r.action==='prepare'){
            if(stored.exists){check(stored.data().requestHash===hash([r.change,r.expectedBasis]),'run-id-reused');check(stored.data().phase!=='cancelled','run-cancelled');return publicStatus(stored.data());}
            check(!control.activeRun,'competing-correction');const p=await planCorrection(tx,db,auth,r.change);check(p.basisHash===r.expectedBasis,'stale-preview');
            const publication={runId:r.runId,revision:p.controlRevision+1};
            for(const item of p.plan){item.data={...item.data,historyPublication:publication};if(item.path.startsWith('spieltage/')){item.data._roundClose={...item.data._roundClose,historyCorrection:publication};item.data.closure={...item.data.closure,historyCorrection:publication};}if(item.data.hcpClosure)item.data.hcpClosure={...item.data.hcpClosure,historyPublication:publication};}
            // Digest includes the final metadata that readers will see.
            for(const item of p.plan.filter(w=>w.path.startsWith('spieltage/'))){const round=item.data,flights=(await tx.get(db.collection('flights').where('spieltagId','==',round.id))).docs.map(d=>({id:d.id,members:String(d.data().spielerIdsCsv).split(',')})).sort((a,b)=>a.id.localeCompare(b.id)),cards=p.plan.filter(w=>w.path.startsWith('scorecards/')&&w.data.spieltagId===round.id).map(w=>w.data).sort((a,b)=>a.id.localeCompare(b.id));round._roundClose.scoreDigest=roundDigest(round,flights,cards);round.closure.scoreDigest=round._roundClose.scoreDigest;for(const w of p.plan.filter(w=>w.data.hcpClosure?.roundId===round.id))w.data.hcpClosure.scoreDigest=round._roundClose.scoreDigest;}
            const run={runId:r.runId,phase:'staging',createdAt:Date.now(),requestHash:hash([r.change,r.expectedBasis]),basisHash:p.basisHash,plan:p.plan,planHash:hash(p.plan),summary:p.changes,sourceTarget:p.sourceTarget,nextBatch:0,change:r.change,op:p.op,revision:publication.revision,actorUid:auth.uid};
            check(Buffer.byteLength(JSON.stringify(run))<=700*1024,'plan-document-too-large');tx.set(runRef,run);tx.set(controlRef,{...control,activeRun:r.runId});return publicStatus(run);
        }
        check(stored.exists,'run-missing');const run=stored.data();
        if(r.action==='publish'&&run.phase==='published')return run.result;
        check(control.activeRun===r.runId,'run-not-locked');
        if(r.action==='cancel'){check(run.phase!=='published','already-published');run.phase='cancelled';tx.set(runRef,run);tx.set(controlRef,{...control,activeRun:null});return publicStatus(run);}
        check(run.phase==='ready'&&hash(run.plan)===run.planHash,'run-not-ready');const current=await planCorrection(tx,db,auth,run.change,run.actorUid);check(current.basisHash===run.basisHash,'source-changed-repair-required');
        const staged=await Promise.all(run.plan.map((w,i)=>tx.get(db.collection('historyCorrectionStages').doc(r.runId+'-'+i))));check(staged.every((s,i)=>s.exists&&s.data().index===i&&s.data().planHash===run.planHash&&hash(s.data().payload)===hash(run.plan[i])),'stage-integrity-failed');
        const receiptRef=db.collection('scoreSyncV2Mutations').doc(hash([run.actorUid,run.change.changeId])),receipt=await tx.get(receiptRef);check(!receipt.exists,'mutation-id-reused');
        for(const w of run.plan)tx.set(reference(db,w.path),w.data,w.merge?{merge:true}:undefined);
        const result={runId:r.runId,phase:'published',publishedBy:auth.uid,publishedAt:Date.now(),revision:run.revision,planHash:run.planHash,writeCount:run.plan.length,rounds:run.plan.filter(w=>w.path.startsWith('spieltage/')).map(w=>({id:w.data.id,hcpStart:w.data.hcpStart,hcpEnd:w.data.hcpEnd,revision:w.data._roundClose.revision,scoreDigest:w.data._roundClose.scoreDigest}))};
        tx.set(receiptRef,{fingerprint:hash(run.op),requestId:'history-'+r.runId,appliedRevision:run.change.baseFieldRevision+1,generation:run.change.baseDocumentGeneration,historyCorrection:r.runId});
        tx.set(runRef,{...run,phase:'published',result});tx.set(controlRef,{revision:run.revision,activeRun:null,lastRunId:r.runId});return result;
    });
};}
module.exports={createHistoryCorrection};
