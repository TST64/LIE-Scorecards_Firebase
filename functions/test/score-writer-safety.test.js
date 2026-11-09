'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const {randomUUID}=require('node:crypto');
const {memoryDatabase,fieldValue}=require('./memory-score-database');const {createScoreOperationsV2,readDocumentState}=require('../score-operations-v2');
async function fixture(metadata=true)
{
    const db=memoryDatabase(),auth={uid:'A',token:{playerId:'A',mustChangePin:false}},ctx={ownerUid:'A',playerId:'A',spieltagId:'ST',flightId:'F'};
    await db.collection('spieler').doc('A').set({role:'Spieler',hcpLIE:54});await db.collection('spieler').doc('ADMIN').set({role:'Admin'});
    await db.collection('spieltage').doc('ST').set({status:'Aktiv',rundenTyp:'18',bahnAnzahl:18,...(metadata?{hcpStart:{A:0},holeAllowances:{A:{1:0}}}:{})});
    await db.collection('flights').doc('F').set({spieltagId:'ST',spielerIdsCsv:'A'});
    const ref=db.collection('scorecards').doc('SC-ST-A-1'),run=createScoreOperationsV2(db,fieldValue);
    const request=(field='strokes',value=5,revision=0,generation='absent',actor=ctx)=>({...actor,requestId:randomUUID(),mode:actor.playerId==='ADMIN'?'selectedFlight':'ownFlight',operations:[{...actor,spielerId:'A',hole:1,documentId:'SC-ST-A-1',changeId:randomUUID(),field,operation:'set',value,baseFieldRevision:revision,baseDocumentGeneration:generation}]});
    return {db,auth,ctx,ref,run,request};
}
test('new card preserves explicit frozen HCP=0 and allowance=0, never todays player HCP',async()=>{
    const f=await fixture();const r=await f.run(f.auth,f.request());assert.equal(r.results[0].status,'acknowledged');const d=(await f.ref.get()).data();assert.equal(d.hcpStart,0);assert.equal(d.strokesGiven,0);
});
test('new card without authoritative round metadata is rejected, never invented',async()=>{
    const f=await fixture(false);const r=await f.run(f.auth,f.request());assert.equal(r.results[0].status,'rejected');assert.equal((await f.ref.get()).exists,false);
});
test('Admin correction wins, stale device conflicts, lost ACK replay cannot undo correction',async()=>{
    const f=await fixture();const original=f.request();await f.run(f.auth,original);const generation=readDocumentState(await f.ref.get()).generation;
    const admin={uid:'ADMIN',token:{playerId:'ADMIN',mustChangePin:false}},c={...f.ctx,ownerUid:'ADMIN',playerId:'ADMIN'};
    assert.equal((await f.run(admin,f.request('strokes',7,1,generation,c))).results[0].status,'acknowledged');
    assert.equal((await f.run(f.auth,f.request('strokes',6,1,generation))).results[0].status,'conflict');
    const replay=await f.run(f.auth,original);assert.equal(replay.results[0].currentServerValue,7);assert.equal((await f.ref.get()).data().strokes,7);
});
test('two devices share a base: exactly one ACK, while another field remains independent',async()=>{
    const f=await fixture();await f.run(f.auth,f.request());const g=readDocumentState(await f.ref.get()).generation;
    const results=await Promise.all([f.run(f.auth,f.request('strokes',6,1,g)),f.run(f.auth,f.request('strokes',7,1,g))]);assert.deepEqual(results.map(r=>r.results[0].status).sort(),['acknowledged','conflict']);
    assert.equal((await f.run(f.auth,f.request('puts',0,0,g))).results[0].status,'acknowledged');
});
