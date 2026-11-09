'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');
for(const kind of ['pending','conflict','offline','unknown-request','legacy-pending'])test('closure client refuses '+kind+' before transport',async()=>{
    assert.ok(fs.existsSync('App_Logic_RoundClose.js'),'S05 requires durable local closure gate');let calls=0;
    const data={pendingOperations:[],operationIssues:[],requestSnapshots:[]};if(kind==='pending')data.pendingOperations=[{changeId:'x'}];if(kind==='conflict')data.operationIssues=[{changeId:'x'}];if(kind==='unknown-request')data.requestSnapshots=[{status:'failed'}];
    const app={logic:{callFunction:async()=>{calls++;return {};},showToast(){}},views:{},state:{currentUser:{id:'A'},pendingScoreKeys:kind==='legacy-pending'?{x:true}:{}},scoreSyncStore:{inspect:async()=>data},createScoreEntryContextStore:()=>({list:async()=>[{ownerUid:'A',spieltagId:'R',response:{flightId:'F'}}],close:async()=>{}})};
    vm.runInNewContext(fs.readFileSync('App_Logic_RoundClose.js','utf8'),{app,navigator:{onLine:kind!=='offline'},firebase:{auth:()=>({currentUser:{uid:'A'}})},console});
    await assert.rejects(app.logic.assertRoundCloseLocalReady('R'));assert.equal(calls,0);
});
