'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const config=require('../config/production/runtime.json');
test('production adapter uses confirmed project and no fixed synthetic writer accounts',async()=>{
    const sandbox={module:{exports:{}},navigator:{onLine:true}};vm.runInNewContext(fs.readFileSync('App_ProductionEnvironment.js','utf8'),sandbox);
    const p={mode:'production',projectId:config.projectId,origin:config.origin,region:config.region},events=[];
    const fn={httpsCallable:name=>async data=>(events.push(name),{data})};const instance={options:config.firebase,auth:()=>({}),firestore:()=>({}),functions:region=>(assert.equal(region,config.region),fn)};
    const sdk={apps:[],app:()=>instance,initializeApp:()=>{sdk.apps.push(instance);return instance;}};
    const e=sandbox.module.exports.create(p,config.firebase,{origin:config.origin,protocol:'https:'},sdk);await e.start();await e.callable('verifyPlayerPin')({spielerId:'existing-real-id'});
    assert.equal(events[0],'verifyPlayerPin');assert.match(e.key,/^production:/);
    assert.throws(()=>sandbox.module.exports.create({...p,projectId:'lie-scorecards-preprod'},config.firebase,{origin:config.origin,protocol:'https:'},{apps:[]}));
});
test('production runtime accepts existing non-MS identities without a fixed allowlist and refuses legacy fallback PIN',async()=>{
    const r=require('../functions/production-runtime').createRuntime({LIE_MODE:'production',GCLOUD_PROJECT:config.projectId});let calls=0;
    const db={collection:()=>({doc:()=>({get:async()=>({exists:true,data:()=>({pinHash:'scrypt$salt$'+'a'.repeat(64)})})})})};
    await r.request('verifyPlayerPin',db,{data:{spielerId:'real-existing-id',pin:'594183'}},async()=>calls++);
    assert.equal(calls,1);await assert.rejects(r.request('verifyPlayerPin',db,{data:{spielerId:'real-existing-id',pin:'4227'}},()=>assert.fail()));
});
test('production artifact has no PreProd/test accounts, copies protected application files byte-for-byte and has verified inventory',async()=>{
    const output=fs.mkdtempSync(path.resolve('.local-runtime/production-release-test-'));
    const result=await require('../tools/production/build.cjs').build(config,output);assert.equal(result.releaseDecision,'NO-GO');
    const check=require('../tools/preprod/check-artifact.cjs').check(output);assert.equal(check.integrityVerified,true);
    assert.equal(Object.keys(result.files).length,Object.keys(JSON.parse(fs.readFileSync(path.join(output,'ARTIFACT.json'))).files).length);
    for(const name of ['App_Logic_ScoreAutoSyncV2.js','App_Logic_ScoreSyncV2.js','App_Storage_ScoreSync.js','Views_ScoreEingabe.js','Views_LiveScoreboard.js','Views_RoundClose.js'])assert.deepEqual(fs.readFileSync(path.join(output,'hosting',name)),fs.readFileSync(name));
    for(const name of ['hosting/config.js','hosting/production-profile.js','hosting/App_ProductionEnvironment.js','hosting/App_ProductionBindings.js','functions/runtime.js'])assert.doesNotMatch(fs.readFileSync(path.join(output,name),'utf8'),/lie-scorecards-preprod|MS0[159]|local-demo-key|FUNCTIONS_EMULATOR:.*true/);
    assert.equal(fs.existsSync(path.join(output,'functions/preprod-guard.js')),false);
});
test('actual production-shaped legacy active round is rejected by unchanged V2 reader: migration approval is a real blocker',async()=>{
    const {memoryDatabase}=require('../functions/test/memory-score-database'),db=memoryDatabase();
    await db.collection('spieler').doc('existing-player').set({role:'Spieler',mustChangePin:false});
    await db.collection('spieltage').doc('legacy-round').set({status:'Aktiv',kursId:'K',rundenTyp:'9-Front',bahnAnzahl:9,teilnehmerCsv:'existing-player'});
    await db.collection('flights').doc('F-1').set({spieltagId:'legacy-round',spielerIdsCsv:'existing-player',seq:1});
    const auth={uid:'existing-player',token:{playerId:'existing-player',role:'Spieler',mustChangePin:false}};
    await assert.rejects(require('../functions/score-read-v2').createScoreReadV2(db)(auth,{ownerUid:auth.uid,playerId:auth.uid,spieltagId:'legacy-round'}),/snapshots missing|unverified/i);
});
