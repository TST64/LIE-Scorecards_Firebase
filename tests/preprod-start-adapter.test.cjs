'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const example=require('../config/preprod/runtime.example.json');
function config(){return {...structuredClone(example),firebase:{...example.firebase,apiKey:'AIza'+'x'.repeat(35),appId:'1:123456789:web:abcdef123456',messagingSenderId:'123456789'}};}
function browser(){
    assert.ok(fs.existsSync('App_PreprodEnvironment.js'));
    const events=[],c=config(),auth={},db={},functions={httpsCallable:name=>async data=>(events.push(name),{data})};
    const instance={options:c.firebase,auth:()=>auth,firestore:()=>db,functions:region=>(assert.equal(region,'europe-west1'),functions)};
    const sdk={apps:[],app:()=>instance,initializeApp:cfg=>(events.push('initialize'),sdk.apps.push(instance),instance)};
    const sandbox={navigator:{onLine:true},module:{exports:{}},console};vm.runInNewContext(fs.readFileSync('App_PreprodEnvironment.js','utf8'),sandbox);
    return {api:sandbox.module.exports,c,sdk,events,sandbox,location:{origin:c.origin,hostname:'lie-scorecards-preprod.web.app',protocol:'https:'}};
}
test('preprod browser connects existing Auth/Firestore/callables without emulators or local probe',async()=>{
    const f=browser(),profile={mode:'preprod',projectId:f.c.projectId,origin:f.c.origin,region:f.c.region};
    const e=f.api.create(profile,f.c.firebase,f.location,f.sdk,()=>assert.fail('local readiness'));
    await e.start();assert.equal(e.mode,'preprod');assert.match(e.storageName('scores'),/preprod:lie-scorecards-preprod/);
    for(const name of ['getLoginPlayers','verifyPlayerPin','getPlayerSessionState','updatePlayerPin','readOwnFlightScoresV2','saveScoreOperationsV2','readPublishedSeasonV1','roundClosureV1','createRoundStart'])await e.callable(name)({});
    assert.equal(f.events.filter(x=>x==='initialize').length,1);
    assert.throws(()=>e.callable('requestTempPin'));f.sdk.app=()=>({options:f.c.firebase});assert.throws(()=>e.assertReady());
});
test('browser rejects wrong origins, mixed modes/projects, prior SDK and service worker before initialize',async()=>{
    for(const kind of ['http','wrong-origin','production','local','emulators','prior-sdk','service-worker']){
        const f=browser(),p={mode:'preprod',projectId:f.c.projectId,origin:f.c.origin,region:f.c.region};
        if(kind==='http')f.location.protocol='http:';if(kind==='wrong-origin')f.location.origin='https://other.web.app';
        if(kind==='production')f.c.firebase.projectId='liescorecard-70c5e';if(kind==='local')p.mode='local';if(kind==='emulators')p.emulators={};
        if(kind==='prior-sdk')f.sdk.apps.push({});if(kind==='service-worker')f.sandbox.navigator.serviceWorker={controller:{}};
        const start=async()=>{const e=f.api.create(p,f.c.firebase,f.location,f.sdk);await e.start();};await assert.rejects(start);assert.equal(f.events.length,0);
    }
});
test('preprod runtime refuses credentials, emulators and foreign projects before Admin SDK use',()=>{
    const {validate}=require('../functions/preprod-guard');const env={LIE_MODE:'preprod',GCLOUD_PROJECT:'lie-scorecards-preprod'};
    assert.equal(validate(env).projectId,'lie-scorecards-preprod');
    for(const patch of [{LIE_MODE:'local'},{GCLOUD_PROJECT:'liescorecard-70c5e'},{FIRESTORE_EMULATOR_HOST:'127.0.0.1:8088'},
        {FUNCTIONS_EMULATOR:'false'},{GOOGLE_APPLICATION_CREDENTIALS:'private.json'},{FIREBASE_TOKEN:'denied'},{FIREBASE_CONFIG:'{"projectId":"foreign"}'}])assert.throws(()=>validate({...env,...patch}));
});
test('preprod discovery initializes no Admin credentials; first runtime access requires Cloud Run identity',()=>{
    const {createRuntime}=require('../functions/runtime');let initialized=0;const env={LIE_MODE:'preprod',GCLOUD_PROJECT:'lie-scorecards-preprod'};
    const admin={initializeApp:()=>initialized++,credential:{applicationDefault:()=>assert.fail('not in discovery')},firestore:()=>({})};
    const r=createRuntime(env,false),db=r.database(admin);assert.equal(initialized,0);assert.throws(()=>db.collection('anything'));assert.equal(initialized,0);
});
test('preprod request guard restricts writers, requires hashes, filters login names and disables recovery/history',async()=>{
    const {createRuntime}=require('../functions/runtime'),r=createRuntime({LIE_MODE:'preprod',GCLOUD_PROJECT:'lie-scorecards-preprod'},false);
    const db={collection:()=>({doc:()=>({get:async()=>({exists:true,data:()=>({pinHash:'scrypt$salt$'+'a'.repeat(64)})})})})};
    await assert.rejects(r.request('verifyPlayerPin',db,{data:{spielerId:'MS02'}},()=>assert.fail()));
    await assert.rejects(r.request('requestTempPin',db,{auth:{uid:'MS01'}},()=>assert.fail()));
    await assert.rejects(r.request('historyCorrectionV1',db,{auth:{uid:'MS01'}},()=>assert.fail()));
    await assert.rejects(r.request('saveScoreOperationsV2',db,{auth:{uid:'MS02'}},()=>assert.fail()));
    const list=await r.request('getLoginPlayers',db,{},async()=>({spieler:[{id:'MS01'},{id:'MS02'},{id:'MS05'},{id:'MS09'}]}));assert.deepEqual(list.spieler.map(p=>p.id),['MS01','MS05','MS09']);
    for(const pin of ['1234','4227','123456'])await assert.rejects(r.request('verifyPlayerPin',db,{data:{spielerId:'MS01',pin}},()=>assert.fail()));
    await r.request('verifyPlayerPin',db,{data:{spielerId:'MS01',pin:'385927'}},async()=>true);
    await assert.rejects(r.request('updatePlayerPin',db,{auth:{uid:'MS01'},data:{newPin:'1234'}},()=>assert.fail()));
    db.collection=()=>({doc:()=>({get:async()=>({exists:true,data:()=>({})})})});await assert.rejects(r.request('verifyPlayerPin',db,{data:{spielerId:'MS01',pin:'385927'}},()=>assert.fail()));
});
test('offline build ships SDK/vendor assets, separate runtime, Rules and Functions but no local profile/credentials',async()=>{
    const {build}=require('../tools/preprod/build.cjs');const output=fs.mkdtempSync(path.resolve('.local-runtime/preprod-adapter-test-'));
    const result=await build(config(),output);assert.equal(result.cloudExecutionAuthorized,false);
    const html=fs.readFileSync(path.join(output,'hosting/index.html'),'utf8');assert.match(html,/PREPROD/);assert.doesNotMatch(html,/__local|127\.0\.0\.1/);
    assert.ok(fs.existsSync(path.join(output,'hosting/__sdk/firebase-functions-compat.js')));assert.ok(fs.existsSync(path.join(output,'hosting/__vendor/tailwind.js')));
    const source=fs.readFileSync('App_Logic_ScoreAutoSyncV2.js');assert.deepEqual(fs.readFileSync(path.join(output,'hosting/App_Logic_ScoreAutoSyncV2.js')),source);
    assert.deepEqual(fs.readFileSync(path.join(output,'firestore.rules')),fs.readFileSync('firestore.rules'));
    const firebase=JSON.parse(fs.readFileSync(path.join(output,'firebase.json')));assert.equal(firebase.hosting.site,'lie-scorecards-preprod');assert.equal(firebase.functions.source,'functions');
    assert.equal(fs.existsSync(path.join(output,'functions/node_modules')),false);assert.equal(fs.existsSync(path.join(output,'hosting/config/preprod/runtime.local.json')),false);
    const {check}=require('../tools/preprod/check-artifact.cjs');assert.equal(check(output).integrityVerified,true);
    fs.appendFileSync(path.join(output,'hosting/config.js'),'\n/* tamper */');assert.throws(()=>check(output));
});

test('PreProd bindings inject distinct V2 databases without editing sync logic or deleting old data',()=>{
    const names=[],contextNames=[],app={logic:{},createScoreSyncStore:n=>(names.push(n),{}),createScoreEntryContextStore:n=>(contextNames.push(n),{})};
    vm.runInNewContext(fs.readFileSync('App_PreprodBindings.js','utf8'),{app,LieEnvironment:{validate(){}},window:{location:{},LIE_PREPROD_PROFILE:{}},firebase:{apps:[]}});
    app.createScoreEntryContextStore();assert.deepEqual(names,['lie_score_sync_v2__preprod:lie-scorecards-preprod']);
    assert.deepEqual(contextNames,['lie_score_entry_context_v2__preprod:lie-scorecards-preprod']);assert.throws(()=>app.createScoreSyncStore('foreign'));
    assert.equal(app.logic.v1Environment,'preprod:lie-scorecards-preprod');
});

test('actual Functions entrypoint discovers PreProd exports with zero SDK/ADC initialization',async()=>{
    const {createRequire}=require('node:module'),localRequire=createRequire(path.resolve('functions/index.js'));
    const env={LIE_MODE:'preprod',GCLOUD_PROJECT:'lie-scorecards-preprod'},runtime=require('../functions/runtime').createRuntime(env,false);
    const exports={},options=[];let initialized=0;
    const admin={initializeApp:()=>initialized++,credential:{applicationDefault:()=>assert.fail('discovery ADC')},firestore:()=>assert.fail('discovery Firestore')};
    class HttpsError extends Error{constructor(code,message){super(message);this.code=code;}}
    vm.runInNewContext(fs.readFileSync('functions/index.js','utf8'),{exports,process:{env},console,Buffer,require:name=>{
        if(name==='./runtime')return {createRuntime:()=>runtime};
        if(name==='firebase-admin')return admin;
        if(name==='firebase-functions/v2/https')return {onCall:f=>f,HttpsError};
        if(name==='firebase-functions/v2')return {setGlobalOptions:o=>options.push(o)};
        return localRequire(name);
    }});
    assert.equal(initialized,0);assert.equal(options[0].serviceAccount,'fieldtest-runtime@lie-scorecards-preprod.iam.gserviceaccount.com');
    for(const name of ['readOwnFlightScoresV2','saveScoreOperationsV2','readPublishedSeasonV1','roundClosureV1','createRoundStart','verifyPlayerPin'])assert.equal(typeof exports[name],'function');
    await assert.rejects(exports.saveScoreOperationsV2({auth:{uid:'MS02'},data:{}}),e=>e.code==='permission-denied');
    assert.equal(initialized,0);
});

test('runtime initializes only the dedicated PreProd SDK instance on a real request',async()=>{
    const {createRuntime}=require('../functions/runtime');const options=[];let adc=0;
    const env={LIE_MODE:'preprod',GCLOUD_PROJECT:'lie-scorecards-preprod',K_SERVICE:'test-service',K_REVISION:'test-revision'};
    const expected={collection:()=>42},admin={credential:{applicationDefault:()=>{adc++;return 'stub-runtime-credential';}},initializeApp:o=>options.push(o),firestore:()=>expected};
    const db=createRuntime(env,false).database(admin);assert.equal(adc,0);assert.equal(db.collection('spieler'),42);assert.equal(db.collection('scorecards'),42);
    assert.equal(adc,1);assert.equal(options[0].projectId,'lie-scorecards-preprod');assert.equal(options[0].serviceAccountId,'fieldtest-runtime@lie-scorecards-preprod.iam.gserviceaccount.com');
});

test('actual browser startup selects PreProd, reaches login and never calls local readiness or service worker',async()=>{
    const f=browser(),p={mode:'preprod',projectId:f.c.projectId,origin:f.c.origin,region:f.c.region},views=[];
    f.sdk.auth=()=>({onAuthStateChanged:cb=>(cb(null),()=>{})});
    const app={state:{},logic:{loadLoginPlayers:async()=>{const result=await app.environment.callable('getLoginPlayers')({});assert.ok(result);}},router:{navigate:v=>views.push(v)}};
    const context={app,window:{location:f.location,firebaseConfig:f.c.firebase,LIE_PREPROD_PROFILE:p},navigator:{onLine:true},firebase:f.sdk,
        LieEnvironment:f.api,console,localStorage:{removeItem(){}},fetch:()=>assert.fail('local/Cloud fetch'),document:{getElementById:()=>({})}};
    vm.runInNewContext(fs.readFileSync('App_Start.js','utf8'),context);app.initCore=async()=>app.environment.start();
    await app.initStart();assert.deepEqual(views,['login']);assert.equal(app.environment.mode,'preprod');assert.ok(f.events.includes('getLoginPlayers'));
});

test('invalid public configuration and output targets are rejected without writing deployment artifacts',async()=>{
    const {build}=require('../tools/preprod/build.cjs'),{validate}=require('../tools/preprod/runtime-config.cjs');
    assert.throws(()=>validate(example));assert.throws(()=>validate({...config(),private_key:'not-allowed'}));
    assert.throws(()=>validate({...config(),projectId:'liescorecard-70c5e'}));
    await assert.rejects(build(config(),path.resolve('hosting-public')));
});

test('real Functions SDK discovery exposes PreProd identity with Cloud sockets and ADC initialization blocked',()=>{
    const script=`require('./functions/network-guard');const admin=require('./functions/node_modules/firebase-admin');admin.initializeApp=()=>{throw new Error('Discovery initialized Admin');};admin.credential.applicationDefault=()=>{throw new Error('Discovery loaded ADC');};const f=require('./functions/index');if(f.verifyPlayerPin.__endpoint.serviceAccountEmail!=='fieldtest-runtime@lie-scorecards-preprod.iam.gserviceaccount.com')throw new Error('Runtime identity missing');console.log(Object.keys(f).length);`;
    const env={...process.env,LIE_MODE:'preprod',GCLOUD_PROJECT:'lie-scorecards-preprod'};
    for(const k of ['GOOGLE_APPLICATION_CREDENTIALS','FIREBASE_TOKEN','FIREBASE_CONFIG','FUNCTIONS_EMULATOR','FIREBASE_EMULATOR_HUB',
        'FIRESTORE_EMULATOR_HOST','FIREBASE_AUTH_EMULATOR_HOST','GOOGLE_CLOUD_PROJECT','CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE','NODE_OPTIONS'])delete env[k];
    const output=require('node:child_process').execFileSync(process.execPath,['-e',script],{cwd:path.resolve('.'),env,encoding:'utf8',timeout:15000});assert.match(output,/11/);
});
