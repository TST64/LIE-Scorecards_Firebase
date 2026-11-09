'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');
const {memoryDatabase,fieldValue}=require('./memory-score-database');
const {createScoreOperationsV2,readDocumentState}=require('../score-operations-v2');
const {metadata}=require('./hcp-fixture');
async function fixture(){
    assert.ok(fs.existsSync('functions/round-close.js'),'S05 requires authoritative closure protocol');
    const db=memoryDatabase(),auth={uid:'M',token:{playerId:'M',role:'Admin',mustChangePin:false}};
    for(const id of ['M','A','B']){await db.collection('spieler').doc(id).set({role:id==='M'?'Admin':'Spieler',mustChangePin:false,hcpLIE:54});await db.collection('spieler_public').doc(id).set({hcpLIE:54});}
    const round={id:'R',date:'2026-01-03',kursId:'K',rundenTyp:'9-Front',bahnAnzahl:9,status:'Aktiv',teilnehmerCsv:'A,B',...metadata({rundenTyp:'9-Front',bahnAnzahl:9},{A:26,B:26})};
    await db.collection('spieltage').doc('R').set(round);
    for(const [i,p] of ['A','B'].entries())await db.collection('flights').doc('F'+i).set({spieltagId:'R',seq:i+1,spielerIdsCsv:p});
    const writer=createScoreOperationsV2(db,fieldValue);let counter=0;
    async function write(p,hole,value,base){const documentId='SC-R-'+p+'-'+hole,snap=await db.collection('scorecards').doc(documentId).get(),state=readDocumentState(snap),c={ownerUid:'M',playerId:'M',spieltagId:'R',flightId:p==='A'?'F0':'F1'};
        const n=++counter;return writer(auth,{...c,requestId:'req'+n,mode:'selectedFlight',operations:[{...c,documentId,spielerId:p,hole,field:'strokes',operation:'set',value,baseDocumentGeneration:state.generation,baseFieldRevision:base??state.revisions.strokes,changeId:'change'+n}]});}
    for(const p of ['A','B'])for(let hole=1;hole<=9;hole++)await write(p,hole,4+round.holeAllowances[p][hole]);
    const run=require('../round-close').createRoundClosure(db);
    const call=(action,extra={})=>run(auth,{action,spieltagId:'R',...extra});
    async function open(){const s=await call('inspect');const input={closeId:'C1',expectedRevision:s.scoreRevision,expectedDigest:s.scoreDigest};await call('begin',input);return input;}
    async function release(input){for(const flightId of ['F0','F1'])await call('release',{...input,flightId,reviewedFlightWriters:true});}
    return {db,auth,round,run,call,write,open,release};
}
test('complete closure publishes exactly once from immutable starts, shared ranks and both HCP views',async()=>{
    const f=await fixture(),input=await f.open();await f.release(input);const result=await f.call('commit',input);
    assert.equal(result.status,'Beendet');assert.deepEqual(result.hcpEnd,{A:26,B:26});assert.deepEqual(result.nettoWinners,['A','B']);assert.equal(result.brutto.status,'not-rated');
    const again=await f.call('commit',input);assert.deepEqual(again,result);
    for(const p of ['A','B']){const a=(await f.db.collection('spieler').doc(p).get()).data(),b=(await f.db.collection('spieler_public').doc(p).get()).data();assert.equal(a.hcpLIE,26);assert.equal(b.hcpLIE,26);assert.deepEqual(a.hcpClosure,b.hcpClosure);}
});
test('last missing hole and one-hole participant cannot begin closure',async()=>{
    const f=await fixture();await f.db.collection('scorecards').doc('SC-R-A-9').delete();const s=await f.call('inspect');assert.equal(s.complete,false);await assert.rejects(f.open());assert.equal((await f.db.collection('spieltage').doc('R').get()).data().status,'Aktiv');
});
test('stale cached revision/digest cannot begin and no unconfirmed flight can commit',async()=>{
    const f=await fixture(),s=await f.call('inspect');await f.write('A',1,9);
    await assert.rejects(f.call('begin',{closeId:'C1',expectedRevision:s.scoreRevision,expectedDigest:s.scoreDigest}));
    const input=await f.open();await assert.rejects(f.call('commit',input));await f.call('release',{...input,flightId:'F0',reviewedFlightWriters:true});await assert.rejects(f.call('commit',input));
});
test('freeze rejects concurrent new score and closed round rejects even revisioned Admin writer',async()=>{
    const f=await fixture(),input=await f.open();assert.equal((await f.write('A',1,9)).results[0].status,'rejected');await f.release(input);await f.call('commit',input);assert.equal((await f.write('A',1,9)).results[0].status,'rejected');
});
test('two parallel closures/retries publish same receipt and never apply HCP twice',async()=>{
    const f=await fixture(),input=await f.open();await f.release(input);const [a,b]=await Promise.all([f.call('commit',input),f.call('commit',input)]);assert.deepEqual(a,b);await assert.rejects(f.call('commit',{...input,closeId:'different'}));
});
test('competing close ID, stale releases and missing manual writer attestation are denied',async()=>{
    const f=await fixture(),input=await f.open();await assert.rejects(f.call('begin',{...input,closeId:'C2'}));
    await assert.rejects(f.call('release',{...input,flightId:'F0',reviewedFlightWriters:false}));await assert.rejects(f.call('release',{...input,expectedDigest:'stale',flightId:'F0',reviewedFlightWriters:true}));
});
test('cancel reopens scoring, invalidates releases and forbids reusing closure ID',async()=>{
    const f=await fixture(),input=await f.open();await f.release(input);await f.call('cancel',input);assert.equal((await f.write('A',1,9)).results[0].status,'acknowledged');await assert.rejects(f.call('commit',input));await assert.rejects(f.call('begin',input));
});
test('PIN/role mismatch and foreign flight release cannot authorize closure',async()=>{
    const f=await fixture(),input=await f.open();for(const auth of [{uid:'M',token:{playerId:'M',role:'Admin',mustChangePin:true}},{uid:'A',token:{playerId:'A',role:'Admin',mustChangePin:false}}])await assert.rejects(f.run(auth,{action:'commit',spieltagId:'R',...input}));
    await assert.rejects(f.run({uid:'A',token:{playerId:'A',role:'Spieler',mustChangePin:false}},{action:'release',spieltagId:'R',...input,flightId:'F1',reviewedFlightWriters:true}));
});
test('injected failure between status and HCP staging leaves no partially published state',async()=>{
    const f=await fixture(),input=await f.open();await f.release(input);const run=f.db.runTransaction;f.db.runTransaction=work=>run(tx=>work({...tx,set(ref,...args){tx.set(ref,...args);if(ref.path==='spieler/A')throw new Error('synthetic-staged-write-failure');}}));
    await assert.rejects(f.call('commit',input));assert.equal((await f.db.collection('spieltage').doc('R').get()).data().status,'Aktiv');assert.equal((await f.db.collection('spieler').doc('A').get()).data().hcpLIE,54);
    f.db.runTransaction=run;assert.equal((await f.call('commit',input)).status,'Beendet');
});
test('legacy snapshot and injected client winners/HCPs fail closed',async()=>{
    const f=await fixture();await assert.rejects(f.call('begin',{closeId:'C1',expectedRevision:0,expectedDigest:'x',hcpEnd:{A:0}}));await f.db.collection('spieltage').doc('R').set({hcpSnapshotVersion:0},{merge:true});await assert.rejects(f.open());
});
test('concurrent score commit and window start cannot silently accept a stale closure basis',async()=>{
    const f=await fixture(),s=await f.call('inspect');const results=await Promise.allSettled([f.write('A',1,9),f.call('begin',{closeId:'C1',expectedRevision:s.scoreRevision,expectedDigest:s.scoreDigest})]);
    assert.ok(results[1].status==='rejected'||results[0].value.results[0].status==='rejected');
});
