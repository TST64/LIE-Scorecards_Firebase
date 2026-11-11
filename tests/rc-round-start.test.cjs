'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {memoryDatabase}=require('../functions/test/memory-score-database');
const {seed,fixture}=require('../tools/local/rc-fixture.cjs'),{createRoundStart}=require('../functions/round-start');
const auth={uid:'MS01',token:{playerId:'MS01',role:'Admin',mustChangePin:false}};
function setup(t){
    const env={LIE_MODE:'local',FUNCTIONS_EMULATOR:'true',GCLOUD_PROJECT:'demo-lie-scorecards-local',
        GOOGLE_CLOUD_PROJECT:'demo-lie-scorecards-local',FIRESTORE_EMULATOR_HOST:'127.0.0.1:12088',FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:12099'};
    const keys=[...Object.keys(env),'GOOGLE_APPLICATION_CREDENTIALS','FIREBASE_TOKEN','FIREBASE_CONFIG'],old=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
    for(const k of keys)delete process.env[k];Object.assign(process.env,env);
    t.after(()=>{for(const k of keys){if(old[k]===undefined)delete process.env[k];else process.env[k]=old[k];}});
    const db=memoryDatabase(),collection=db.collection.bind(db);
    db.projectId='demo-lie-scorecards-local';
    db.collection=n=>({...collection(n),query:{collection:n,field:'__all__',value:undefined}});
    db.listCollections=async()=>(await db.collection('spieler').doc('MS01').get()).exists?[{id:'spieler'}]:[];
    db.batch=()=>{const writes=[];return {set(...args){writes.push(args);},commit(){return db.runTransaction(tx=>{for(const args of writes)tx.set(...args);});}};};
    return db;
}
function request(id='UI-ROUND'){
    const f=fixture();return {spieltagObj:{...f.round,id,date:'2026-11-12'},
        flightsPayload:f.flights.map((r,i)=>({...r,id:'FL-'+id+'-'+(i+1),spieltagId:id}))};
}
test('the actual RC seed allows the first user-created round without hidden active participants',async t=>{
    const db=setup(t);await seed(db);const r=await createRoundStart(db)(auth,request());
    assert.equal(r.success,true);assert.equal(r.spieltag.hcpSnapshotVersion,1);
    assert.equal(Object.keys(r.spieltag.hcpStart).length,12);
});
test('RC starts with twelve players/course but no pre-created rounds or scorecards',async t=>{
    const db=setup(t);await seed(db);
    assert.equal((await db.runTransaction(tx=>tx.get(db.collection('spieler')))).docs.length,12);
    assert.equal((await db.runTransaction(tx=>tx.get(db.collection('spieltage')))).docs.length,0);
    assert.equal((await db.runTransaction(tx=>tx.get(db.collection('scorecards')))).docs.length,0);
});
test('the original overlapping-active-round safety check still refuses a second round',async t=>{
    const db=setup(t);await seed(db);const f=fixture();
    await createRoundStart(db)(auth,{spieltagObj:f.round,flightsPayload:f.flights});
    await assert.rejects(createRoundStart(db)(auth,request()),/Participant already has active round; S05 required/);
    assert.equal((await db.collection('spieltage').doc('UI-ROUND').get()).exists,false);
});
test('seed refuses an existing database and preserves its original records',async t=>{
    const db=setup(t);await db.collection('spieler').doc('MS01').set({name:'Existing synthetic record'});
    await assert.rejects(seed(db),/empty local emulator/);
    assert.equal((await db.collection('spieler').doc('MS01').get()).data().name,'Existing synthetic record');
});
