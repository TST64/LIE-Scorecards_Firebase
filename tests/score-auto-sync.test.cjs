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
    const f=fixture();let release,n=0;f.adapter.sync=async()=>{n++;if(n===1){await new Promise(r=>{release=r;});f.data.pendingOperations=[{changeId:'new'}];}else f.data.pendingOperations=[];return {results:[{status:'acknowledged'}]};};
    f.scheduler.activate(f.c);const running=f.scheduler.flush(f.c);await new Promise(setImmediate);f.scheduler.notify(f.c);release();await running;assert.equal(n,2);assert.equal(f.notifications.at(-1).status,'confirmed');
});
test('V1 API and round close reject before any DB side effect',async()=>{
    let writes=0;const app={logic:{},state:{},environment:{async checkOnline(){}},db:{collection(){writes++;throw new Error('unexpected write');}}};
    vm.runInNewContext(fs.readFileSync('App_Logic_Bridge.js','utf8'),{app,console});
    const v1=await app.logic.apiRequest('saveLiveScores',{requestId:'old'});assert.equal(v1.success,false);assert.equal(v1.definitelyNotApplied,true);
    const close=await app.logic.apiRequest('closeSpieltagServer',{spieltagId:'ST'});assert.equal(close.success,false);assert.equal(writes,0);
});
test('unsafe Admin/history/close/reset entrypoints stop before even reading mutable forms or DB',async()=>{
    let accesses=0;const app={views:{},logic:{showToast(){}},state:{currentUser:{id:'A',role:'Admin'}}};
    const document={getElementById(){accesses++;throw new Error('unsafe partial work');},querySelectorAll(){accesses++;throw new Error('unsafe partial work');}};
    const context={app,document,console};
    for(const file of ['Views_AdminKorrektur.js','App_Logic_History.js','App_Logic_Spieltage.js','App_Logic_UI.js'])vm.runInNewContext(fs.readFileSync(file,'utf8'),context);
    app.logic.showToast=()=>{};
    assert.equal(await app.logic.saveAdminRoundCorrection(false,true),false);
    await assert.rejects(app.logic.recalculateSeasonFromStart(),/gesperrt/);
    assert.equal(app.logic.closeActiveSpieltag('ST'),false);assert.equal(app.logic.triggerMasterReset(),false);assert.equal(accesses,0);
});
test('transport error cannot become confirmation; same original retry remains scheduled',async()=>{
    const f=fixture();f.adapter.sync=async()=>{throw new Error('synthetic offline response');};
    f.scheduler.activate(f.c);await f.scheduler.flush(f.c);assert.equal(f.notifications.at(-1).status,'error');assert.equal(f.data.pendingOperations.length,1);assert.ok(f.timers.some(t=>t.ms>=1500));
});
test('authoritative refresh may bind an externally created card only when cached absence has no local work',async()=>{
    const app={};vm.runInNewContext(fs.readFileSync('App_Logic_ScoreEntryV2.js','utf8'),{app,structuredClone,console});
    const holes=Array.from({length:9},(_,i)=>i+1),cache=new Map();let created=false,replacements=0;
    const response=()=>({ownerUid:'A',playerId:'A',spieltagId:'ST',flightId:'F',flightSeq:1,members:['A'],players:[{id:'A'}],
        round:{status:'Aktiv',rundenTyp:'9-Front',bahnAnzahl:9,kursId:'K',holes,holeData:holes.map(n=>({nr:n,par:4,si:n}))},
        cards:holes.map(hole=>({documentId:'SC-ST-A-'+hole,spielerId:'A',hole,exists:created&&hole===1,values:created&&hole===1?{strokes:5}:{},
            fieldRevisions:{strokes:created&&hole===1?1:0,puts:0,lady:0,maxscore:0},generation:created&&hole===1?'gen:external':'absent'}))});
    const store={async readScorecard(c){return {generation:cache.get(c.documentId),pendingOperations:[],confirmed:{}};},async putServerSnapshot(c,v,r,i){cache.set(c.documentId,i.generation);},async replaceServerGeneration(c,v,r,i){assert.equal(i.replacesGeneration,'absent');cache.set(c.documentId,i.generation);replacements++;}};
    const ctrl=app.createScoreEntryV2Controller({store,getIdentity:async()=>({ownerUid:'A',playerId:'A'}),getState:()=>({currentUser:{id:'A'},flights:[{id:'F',spieltagId:'ST',spielerIdsCsv:'A'}]}),readTransport:async()=>response()});
    await ctrl.open({spieltagId:'ST'});created=true;await ctrl.refresh();assert.equal(replacements,1);assert.equal(cache.get('SC-ST-A-1'),'gen:external');
});
