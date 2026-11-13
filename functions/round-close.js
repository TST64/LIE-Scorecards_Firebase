'use strict';
const {createHash}=require('node:crypto');
const H=require('./hcp-rules');
const {readDocumentState}=require('./score-operations-v2');
function check(ok,code){if(!ok){const e=new Error(code);e.code=code;throw e;}}
function id(x){return typeof x==='string'&&/^[A-Za-z0-9][A-Za-z0-9_-]{0,199}$/.test(x);}
function canonical(x){return Array.isArray(x)?x.map(canonical):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;}
function hash(x){return createHash('sha256').update(JSON.stringify(canonical(x))).digest('hex');}
function members(csv){const a=String(csv||'').split(',').map(x=>x.trim());check(a.length&&a.every(id)&&new Set(a).size===a.length,'invalid-members');return a;}

// A frozen window + three identity-bound manual flight attestations. No claim
// that the server can discover offline queues on another device.
function roundDigest(round,flights,cards){return hash({round:{hcpStart:round.hcpStart,holeAllowances:round.holeAllowances,hcpHoleData:round.hcpHoleData,hcpCourseTable:round.hcpCourseTable||[],type:round.rundenTyp},flights,cards});}
async function inspectRound(tx,db,roundId,round,includeCards=false){
        const players=members(round.teilnehmerCsv);check(players.length<=12&&!round.istGeloescht,'invalid-round');
        H.validateRoundSnapshot(round,players);
        check(['Aktiv','Beendet'].includes(round.status),'invalid-round-state');
        const flightDocs=await tx.get(db.collection('flights').where('spieltagId','==',roundId));
        const flights=flightDocs.docs.map(d=>({id:d.id,members:members(d.data().spielerIdsCsv)})).sort((a,b)=>a.id.localeCompare(b.id));
        const assigned=flights.flatMap(f=>f.members);
        check(flights.length>0&&flights.every(f=>f.members.length<=4)&&assigned.length===players.length&&new Set(assigned).size===players.length&&players.every(p=>assigned.includes(p)),'invalid-flight-partition');
        const docs=await tx.get(db.collection('scorecards').where('spieltagId','==',roundId));
        const holes=H.played(round,round.hcpHoleData),cards=[],keys=new Set();
        for(const doc of docs.docs){
            const c=doc.data(),key=c.spielerId+'_'+c.hole;
            check(players.includes(c.spielerId)&&holes.some(h=>h.nr===c.hole)&&doc.id==='SC-'+roundId+'-'+c.spielerId+'-'+c.hole&&(!c.id||c.id===doc.id)&&!keys.has(key),'invalid-score-identity');keys.add(key);
            check(c.hcpStart===round.hcpStart[c.spielerId]&&c.strokesGiven===round.holeAllowances[c.spielerId][c.hole],'invalid-card-start');
            const state=readDocumentState(doc);check(state.generation.startsWith('gen:'),'unverified-score-generation');
            const binding=await tx.get(db.collection('scoreSyncV2Generations').doc(hash([doc.id,state.generation])));
            check(binding.exists&&binding.data().documentId===doc.id&&binding.data().generation===state.generation&&binding.createTime.seconds===doc.createTime.seconds&&binding.createTime.nanoseconds===doc.createTime.nanoseconds,'invalid-score-generation');
            check(['strokes','puts','lady','maxscore'].every(f=>!Object.hasOwn(c,f)||state.revisions[f]>0),'unrevisioned-score');
            check((c.puts===undefined||Number.isSafeInteger(c.puts)&&c.puts>=0)&&(c.lady===undefined||typeof c.lady==='boolean'),'invalid-score-values');
            cards.push({id:doc.id,...c});
        }
        cards.sort((a,b)=>a.id.localeCompare(b.id));
        const results=players.map(playerId=>({playerId,...H.evaluate(round,round.hcpHoleData,round.hcpStart[playerId],cards.filter(c=>c.spielerId===playerId),round.holeAllowances[playerId])}));
        const scoreRevision=round.scoreRevision??0;check(Number.isSafeInteger(scoreRevision)&&scoreRevision>=0,'invalid-score-revision');
        const scoreDigest=roundDigest(round,flights,cards);
        const complete=results.every(p=>p.complete),closure=round.closure||null;
        const view={spieltagId:roundId,status:round.status,scoreRevision,scoreDigest,complete,results,flights,closure,published:round._roundClose||null};
        return includeCards?{...view,cards}:view;
}

function createRoundClosure(db){return async function(auth,input){
    const r=structuredClone(input||{});
    check(auth&&auth.uid===auth.token?.playerId&&auth.token.mustChangePin===false,'invalid-identity');
    check(id(r.spieltagId)&&['inspect','begin','release','commit','cancel'].includes(r.action),'invalid-request');
    check(Object.keys(r).every(k=>['action','spieltagId','closeId','expectedRevision','expectedDigest','flightId','reviewedFlightWriters'].includes(k)),'untrusted-aggregates');
    if(r.action!=='inspect')check(id(r.closeId)&&Number.isSafeInteger(r.expectedRevision)&&r.expectedRevision>=0&&typeof r.expectedDigest==='string','invalid-basis');
    return db.runTransaction(async tx=>{
        if(r.action!=='inspect')await require('./history-lock').requireHistoryIdle(tx,db);
        const actor=await tx.get(db.collection('spieler').doc(auth.uid));
        check(actor.exists&&!actor.data().istGeloescht&&!actor.data().mustChangePin&&!actor.data().pinChangePending&&actor.data().role===auth.token.role,'invalid-actor');
        const privileged=['Admin','Spielleiter'].includes(actor.data().role);
        const ref=db.collection('spieltage').doc(r.spieltagId),snap=await tx.get(ref);check(snap.exists,'round-missing');
        const round=snap.data(),players=members(round.teilnehmerCsv);check(players.length<=12&&!round.istGeloescht,'invalid-round');
        check(privileged||players.includes(auth.uid),'round-not-authorized');
        if(['begin','commit','cancel'].includes(r.action))check(privileged,'privileged-role-required');
        const receiptRef=r.action==='inspect'?null:db.collection('roundClosureReceipts').doc(hash([r.spieltagId,r.closeId]));
        const receipt=receiptRef?await tx.get(receiptRef):null;
        if(r.action==='commit'&&receipt?.exists&&receipt.data().state==='published'){
            check(receipt.data().basis===hash([r.expectedRevision,r.expectedDigest]),'receipt-basis-mismatch');
            if(round._roundClose?.revision!==receipt.data().result.revision)return {...round._roundClose,replayedOriginalCloseId:r.closeId,supersededReceipt:true};
            return receipt.data().result;
        }
        const view=await inspectRound(tx,db,r.spieltagId,round);
        const {flights,results,scoreRevision,scoreDigest,complete,closure}=view;
        if(r.action==='inspect')return view;
        check(round.status==='Aktiv'&&!round._roundClose,'round-already-closed');
        check(r.expectedRevision===scoreRevision&&r.expectedDigest===scoreDigest,'stale-server-basis');
        if(r.action==='begin'){
            check(complete,'round-incomplete');check(!receipt?.exists,'close-id-already-used');
            if(closure?.phase==='collecting'){check(closure.id===r.closeId&&closure.scoreDigest===scoreDigest,'competing-closure');return view;}
            tx.set(ref,{closure:{id:r.closeId,phase:'collecting',scoreRevision,scoreDigest,openedBy:auth.uid,openedAt:Date.now(),approvals:{}}},{merge:true});return {...view,closure:{id:r.closeId,phase:'collecting',scoreRevision,scoreDigest,approvals:{}}};
        }
        check(closure?.phase==='collecting'&&closure.id===r.closeId&&closure.scoreRevision===scoreRevision&&closure.scoreDigest===scoreDigest,'closure-window-mismatch');
        if(r.action==='cancel'){
            tx.set(ref,{...round,closure:{...closure,phase:'cancelled',approvals:{}}});
            tx.set(receiptRef,{state:'cancelled',basis:hash([scoreRevision,scoreDigest])});return {...view,closure:{...closure,phase:'cancelled',approvals:{}}};
        }
        check(complete,'round-incomplete');
        if(r.action==='release'){
            const flight=flights.find(f=>f.id===r.flightId);check(flight&&(privileged||flight.members.includes(auth.uid))&&r.reviewedFlightWriters===true,'flight-review-required');
            const approval={actorUid:auth.uid,flightId:flight.id,scoreRevision,scoreDigest,reviewedFlightWriters:true,at:Date.now()};
            const next={...closure,approvals:{...closure.approvals,[flight.id]:approval}};tx.set(ref,{...round,closure:next});return {...view,closure:next};
        }
        check(flights.every(f=>{const a=closure.approvals?.[f.id];return a?.reviewedFlightWriters===true&&a.scoreRevision===scoreRevision&&a.scoreDigest===scoreDigest;}),'flight-releases-missing');
        // Read all participant docs before staging any publication write.
        const targets=[];for(const p of players){const privateRef=db.collection('spieler').doc(p),publicRef=db.collection('spieler_public').doc(p);const a=await tx.get(privateRef),b=await tx.get(publicRef);check(a.exists&&!a.data().istGeloescht&&b.exists,'participant-projection-missing');targets.push({p,privateRef,publicRef});}
        results.sort((a,b)=>b.totalNetto-a.totalNetto||a.playerId.localeCompare(b.playerId));let rank=0,last=null;
        const ranked=results.map((x,i)=>{if(x.totalNetto!==last){rank=i+1;last=x.totalNetto;}return {...x,rank};});
        const hcpEnd=Object.fromEntries(results.map(x=>[x.playerId,x.endHcp]));
        const published={version:1,revision:1,closeId:r.closeId,spieltagId:r.spieltagId,status:'Beendet',scoreRevision,scoreDigest,hcpEnd,results:ranked,nettoWinners:ranked.filter(x=>x.rank===1).map(x=>x.playerId),brutto:{status:'not-rated'},closedBy:auth.uid,closedAt:Date.now(),flightReleases:closure.approvals};
        tx.set(ref,{...round,status:'Beendet',hcpEnd,nettoSieger:published.nettoWinners.join(','),bruttoSieger:'Nicht gewertet',_roundClose:published,closure:{...closure,phase:'published'}});
        for(const t of targets){const patch={hcpLIE:hcpEnd[t.p],hcpClosure:{roundId:r.spieltagId,closeId:r.closeId,revision:1,scoreDigest,...(round.historyPublication?{historyPublication:round.historyPublication}:{})},...(round.historyPublication?{historyPublication:round.historyPublication}:{})};tx.set(t.privateRef,patch,{merge:true});tx.set(t.publicRef,patch,{merge:true});}
        tx.set(receiptRef,{state:'published',basis:hash([scoreRevision,scoreDigest]),result:published});return published;
    });
};}
module.exports={createRoundClosure,inspectRound,hash,roundDigest};
