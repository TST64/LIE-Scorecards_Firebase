'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {memoryDatabase,fieldValue}=require('./memory-score-database');
const {createRoundStart}=require('../round-start'),{createRoundClosure}=require('../round-close'),{createScoreOperationsV2,readDocumentState}=require('../score-operations-v2');
const golden=require('../../tests/fixtures/hcp-s06-golden.json');
async function fixture(){
    assert.ok(fs.existsSync('functions/history-correction.js'),'versioned staged history correction required');
    const db=memoryDatabase(),collection=db.collection.bind(db);db.collection=name=>({...collection(name),query:{collection:name,field:'__all__',value:undefined}});
    let batches=0;db.batch=()=>{const writes=[];return {set(ref,data,options){writes.push([ref,data,options]);},async commit(){batches++;if(db.failBatch===batches)throw new Error('synthetic second batch failure');return db.runTransaction(tx=>{for(const w of writes)tx.set(...w);});}};};
    const players=golden.players.map(p=>p.id),auth={uid:'MS01',token:{playerId:'MS01',role:'Admin',mustChangePin:false}};
    for(const p of players){const data={role:p==='MS01'?'Admin':'Spieler',mustChangePin:false,hcpLIE:26};await db.collection('spieler').doc(p).set(data);await db.collection('spieler_public').doc(p).set({hcpLIE:26});}
    await db.collection('config').doc('saison').set({saisonStartDatum:'2026-01-01'});await db.collection('kurse').doc('K').set({name:'Synthetic'});
    for(let nr=1;nr<=18;nr++)await db.collection('bahnen').doc('H'+nr).set({kursId:'K',nr,par:4,si:nr});
    const start=createRoundStart(db),close=createRoundClosure(db),writer=createScoreOperationsV2(db,fieldValue);let seq=0;
    for(const [i,type] of ['9-Front','9-Back','18'].entries()){
        const id=['F','B','E'][i],round={id,kursId:'K',date:['2026-01-03','2026-01-10','2026-01-17'][i],rundenTyp:type,bahnAnzahl:i===2?18:9,status:'Aktiv',teilnehmerCsv:players.join(',')},flights=Array.from({length:3},(_,f)=>({id:'FL-'+id+'-'+(f+1),spieltagId:id,spielerIdsCsv:players.slice(f*4,f*4+4).join(',')}));
        await start(auth,{spieltagObj:round,flightsPayload:flights});
        for(let f=0;f<3;f++){
            const context={ownerUid:'MS01',playerId:'MS01',spieltagId:id,flightId:flights[f].id},operations=[];
            for(const p of golden.players.slice(f*4,f*4+4))for(let j=0;j<round.bahnAnzahl;j++)operations.push({...context,spielerId:p.id,hole:j+(i===1?10:1),documentId:'SC-'+id+'-'+p.id+'-'+(j+(i===1?10:1)),field:'strokes',operation:'set',value:4+Math.floor(p.rawAllowances[i]/round.bahnAnzahl)+(j<p.rawAllowances[i]%round.bahnAnzahl?1:0)+2-Math.min(4,Math.max(0,p.netto[i]-4*j)),baseFieldRevision:0,baseDocumentGeneration:'absent',changeId:'initial-'+(++seq)});
            assert.ok((await writer(auth,{...context,mode:'selectedFlight',requestId:'initial-'+seq,operations})).results.every(r=>r.status==='acknowledged'));
        }
        const v=await close(auth,{action:'inspect',spieltagId:id}),basis={spieltagId:id,closeId:'C-'+id,expectedRevision:v.scoreRevision,expectedDigest:v.scoreDigest};await close(auth,{action:'begin',...basis});for(const f of flights)await close(auth,{action:'release',...basis,flightId:f.id,reviewedFlightWriters:true});await close(auth,{action:'commit',...basis});
    }
    const target=await db.collection('scorecards').doc('SC-F-MS02-6').get(),s=readDocumentState(target),change={documentId:'SC-F-MS02-6',field:'strokes',operation:'set',value:3,baseFieldRevision:s.revisions.strokes,baseDocumentGeneration:s.generation,changeId:'correct-MS02'};
    const run=require('../history-correction').createHistoryCorrection(db),call=(action,extra={})=>run(auth,{action,...extra});
    async function prepare(runId='RUN1'){const p=await call('preview',{change});await call('prepare',{runId,change,expectedBasis:p.basisHash});return p;}
    return {db,auth,change,call,run,prepare,start,writer,players,batches:()=>batches};
}
test('preview is read-only, includes all 459 projections and exact independent MS02 chain',async()=>{
    const f=await fixture(),p=await f.call('preview',{change:f.change});assert.equal(p.writeCount,459);assert.deepEqual(p.changes.map(r=>[r.id,r.hcpStart.MS02,r.hcpEnd.MS02,r.results.find(x=>x.playerId==='MS02').totalNetto]),[['F',26,23,24],['B',23,23.1,17],['E',23.1,23.1,36]]);
    assert.equal((await f.db.collection('scorecards').doc(f.change.documentId).get()).data().strokes,7);assert.equal((await f.db.collection('historyPublication').doc('current').get()).exists,false);
});
test('second batch fails after 400 staged entries: publication unchanged; fresh worker resumes and publishes once',async()=>{
    const f=await fixture();await f.prepare();await f.call('stage',{runId:'RUN1'});f.db.failBatch=2;await assert.rejects(f.call('stage',{runId:'RUN1'}));
    assert.equal((await f.call('status',{runId:'RUN1'})).staged,400);assert.equal((await f.db.collection('scorecards').doc(f.change.documentId).get()).data().strokes,7);assert.equal((await f.db.collection('spieler').doc('MS02').get()).data().hcpLIE,24);
    const fresh=require('../history-correction').createHistoryCorrection(f.db);await fresh(f.auth,{action:'stage',runId:'RUN1'});const a=await fresh(f.auth,{action:'publish',runId:'RUN1'}),b=await f.call('publish',{runId:'RUN1'});assert.deepEqual(a,b);assert.equal(a.phase,'published');
    assert.equal((await f.db.collection('scorecards').doc(f.change.documentId).get()).data().strokes,3);for(const name of ['spieler','spieler_public'])assert.equal((await f.db.collection(name).doc('MS02').get()).data().hcpLIE,23.1);
});
test('publication preserves all other raw values and advances correction field, closures and HCP provenance',async()=>{
    const f=await fixture();await f.prepare();await f.call('stage',{runId:'RUN1'});await f.call('stage',{runId:'RUN1'});await f.call('publish',{runId:'RUN1'});
    for(const id of ['F','B','E']){const r=(await f.db.collection('spieltage').doc(id).get()).data();assert.equal(r._roundClose.revision,2);assert.equal(r.historyPublication.runId,'RUN1');for(const p of golden.players)if(p.id!=='MS02')assert.equal(r.hcpEnd[p.id],p.ends[['F','B','E'].indexOf(id)]);}
    const card=(await f.db.collection('scorecards').doc(f.change.documentId).get()).data();assert.equal(card._sync.fields.strokes.revision,f.change.baseFieldRevision+1);assert.equal(card._sync.generation,f.change.baseDocumentGeneration);
    assert.equal((await f.db.collection('scorecards').doc('SC-B-MS02-10').get()).data().strokes,4);assert.equal((await f.db.collection('scorecards').doc('SC-E-MS02-1').get()).data().strokes,4);
});
test('only actual Admin with unchanged PIN/claims may plan or mutate; stale CAS rejected',async()=>{
    const f=await fixture();for(const auth of [{uid:'MS02',token:{playerId:'MS02',role:'Admin',mustChangePin:false}},{uid:'MS01',token:{playerId:'MS01',role:'Admin',mustChangePin:true}}])await assert.rejects(f.run(auth,{action:'preview',change:f.change}));
    for(const patch of [{baseFieldRevision:99},{baseDocumentGeneration:'absent'}])await assert.rejects(f.call('preview',{change:{...f.change,...patch}}));
});
test('competing correction, new round and V2 writer are blocked by durable publication barrier',async()=>{
    const f=await fixture(),p=await f.prepare();await assert.rejects(f.call('prepare',{runId:'OTHER',change:f.change,expectedBasis:p.basisHash}));
    await assert.rejects(f.start(f.auth,{spieltagObj:{id:'N',date:'2026-01-24',kursId:'K',rundenTyp:'9-Front',bahnAnzahl:9,status:'Aktiv',teilnehmerCsv:f.players.join(',')},flightsPayload:[0,1,2].map(i=>({id:'FL-N-'+(i+1),spieltagId:'N',spielerIdsCsv:f.players.slice(i*4,i*4+4).join(',')}))}));
    const c={ownerUid:'MS01',playerId:'MS01',spieltagId:'F',flightId:'FL-F-1'},r=await f.writer(f.auth,{...c,mode:'selectedFlight',requestId:'stale',operations:[{...c,...f.change,spielerId:'MS02',hole:6,changeId:'stale'}]});assert.equal(r.results[0].status,'rejected');
});
test('unverified history, incomplete staging and tampered staged payload cannot publish',async()=>{
    const f=await fixture();await f.prepare();await assert.rejects(f.call('publish',{runId:'RUN1'}));await f.call('stage',{runId:'RUN1'});await f.call('stage',{runId:'RUN1'});
    const stageRef=f.db.collection('historyCorrectionStages').doc('RUN1-0');await stageRef.set({tampered:true});await assert.rejects(f.call('publish',{runId:'RUN1'}));assert.equal((await f.db.collection('spieler').doc('MS02').get()).data().hcpLIE,24);
});
test('cancel never rolls back live data, releases lock and permanently rejects run-ID reuse',async()=>{
    const f=await fixture(),p=await f.prepare();await f.call('stage',{runId:'RUN1'});await f.call('cancel',{runId:'RUN1'});assert.equal((await f.db.collection('scorecards').doc(f.change.documentId).get()).data().strokes,7);await assert.rejects(f.call('prepare',{runId:'RUN1',change:f.change,expectedBasis:p.basisHash}));
});
test('after correction fourth round starts from all three recomputed closes and old close retry cannot restore old HCP',async()=>{
    const f=await fixture(),before=(await f.db.collection('spieltage').doc('F').get()).data();await f.prepare();await f.call('stage',{runId:'RUN1'});await f.call('stage',{runId:'RUN1'});await f.call('publish',{runId:'RUN1'});
    const replay=await createRoundClosure(f.db)(f.auth,{action:'commit',spieltagId:'F',closeId:'C-F',expectedRevision:before._roundClose.scoreRevision,expectedDigest:before._roundClose.scoreDigest});assert.equal(replay.hcpEnd.MS02,23);
    const next=await f.start(f.auth,{spieltagObj:{id:'N',date:'2026-01-24',kursId:'K',rundenTyp:'9-Front',bahnAnzahl:9,status:'Aktiv',teilnehmerCsv:f.players.join(',')},flightsPayload:[0,1,2].map(i=>({id:'FL-N-'+(i+1),spieltagId:'N',spielerIdsCsv:f.players.slice(i*4,i*4+4).join(',')}))});assert.equal(next.spieltag.hcpStart.MS02,23.1);
});
