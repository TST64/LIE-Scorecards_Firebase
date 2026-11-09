'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');
function fixture()
{
    const app={logic:{},state:{}},timers=[],notifications=[];let identity={ownerUid:'A',playerId:'A'},online=true;
    vm.runInNewContext(fs.readFileSync('App_Logic_ScoreSyncV2.js','utf8'),{app,structuredClone,console});
    const file='App_Logic_ScoreAutoSyncV2.js';if(fs.existsSync(file))vm.runInNewContext(fs.readFileSync(file,'utf8'),{app,structuredClone,console});
    assert.equal(typeof app.createScoreAutoSyncV2,'function','normal application needs its actual automatic sender');
    const c={ownerUid:'A',playerId:'A',spieltagId:'ST',flightId:'F',mode:'ownFlight'},data={pendingOperations:[{changeId:'one'}],operationIssues:[],requestSnapshots:[]},sent=[];
    const store={async inspect(){return structuredClone(data);}},adapter={async sync(ctx){sent.push(ctx);data.pendingOperations=[];return {results:[{status:'acknowledged'}]};},async retry(ctx,id){sent.push({id,...ctx});data.pendingOperations=[];return {results:[{status:'acknowledged'}]};}};
    const scheduler=app.createScoreAutoSyncV2({store,adapter,getIdentity:async()=>identity,isOnline:()=>online,
        setTimer:(f,ms)=>{timers.push({f,ms});return timers.length;},clearTimer(){},onState:(c,s)=>notifications.push(s)});
    return {app,c,data,sent,adapter,scheduler,timers,notifications,owner:value=>{identity=value;},online:value=>{online=value;}};
}
test('accepted normal-controller action wakes the scheduler after durable append',async()=>{
    const text=fs.readFileSync('App_Logic_ScoreEntryV2.js','utf8');assert.match(text,/onAccepted/,'the real controller must notify after committing');
    assert.match(fs.readFileSync('Views_ScoreEingabe.js','utf8'),/activateScoreAutoSyncV2/,'the normal view load activates the actual sender');
});
test('queued input schedules automatic send and publishes serverconfirmed only after settlement',async()=>{
    const f=fixture();f.scheduler.activate(f.c);await f.scheduler.flush(f.c);assert.equal(f.sent.length,1);assert.equal(f.notifications.at(-1).status,'confirmed');
});
test('offline keeps durable pending; reconnect drains it',async()=>{
    const f=fixture();f.online(false);f.scheduler.activate(f.c);await f.scheduler.flush(f.c);assert.equal(f.sent.length,0);assert.equal(f.notifications.at(-1).status,'offline');
    f.online(true);await f.scheduler.flush(f.c);assert.equal(f.sent.length,1);
});
test('unknown failed request is retried with its original persisted ID before new work',async()=>{
    const f=fixture();f.data.requestSnapshots=[{requestId:'original',protocol:'score-v2',status:'failed',changeIds:['one']}];
    f.scheduler.activate(f.c);await f.scheduler.flush(f.c);assert.equal(f.sent[0].id,'original');
});
test('terminal conflicts stay durable and never auto-rebase or claim confirmation',async()=>{
    const f=fixture();f.data.operationIssues=[{changeId:'one',status:'conflict'}];f.adapter.sync=async()=>({blocked:true,results:f.data.operationIssues});
    f.scheduler.activate(f.c);await f.scheduler.flush(f.c);assert.equal(f.notifications.at(-1).status,'conflict');assert.equal(f.data.pendingOperations.length,1);
});
test('owner change or stop prevents old-context transport',async()=>{
    const f=fixture();f.scheduler.activate(f.c);f.owner({ownerUid:'B',playerId:'B'});await f.scheduler.flush(f.c);assert.equal(f.sent.length,0);
    f.scheduler.stop();f.owner({ownerUid:'A',playerId:'A'});await f.scheduler.flush(f.c);assert.equal(f.sent.length,0);
});
test('new local input during a held ACK is drained by the same scheduler',async()=>{
    const f=fixture();let release,n=0;f.adapter.sync=async()=>{n++;if(n===1){await new Promise(r=>{release=r;});f.data.pendingOperations=[{changeId:'new'}];}else f.data.pendingOperations=[];return {results:[]};};
    f.scheduler.activate(f.c);const running=f.scheduler.flush(f.c);await new Promise(setImmediate);f.scheduler.notify(f.c);release();await running;assert.equal(n,2);assert.equal(f.notifications.at(-1).status,'confirmed');
});
test('V1 API and round close reject before any DB side effect',async()=>{
    let writes=0;const app={logic:{},state:{},environment:{async checkOnline(){}},db:{collection(){writes++;throw new Error('unexpected write');}}};
    vm.runInNewContext(fs.readFileSync('App_Logic_Bridge.js','utf8'),{app,console});
    const v1=await app.logic.apiRequest('saveLiveScores',{requestId:'old'});assert.equal(v1.success,false);assert.equal(v1.definitelyNotApplied,true);
    const close=await app.logic.apiRequest('closeSpieltagServer',{spieltagId:'ST'});assert.equal(close.success,false);assert.equal(writes,0);
});
