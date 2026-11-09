'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');
for(const kind of ['pending','conflict','offline','unknown-request','legacy-pending','storage-failure'])test('closure client refuses '+kind+' before transport',async()=>{
    assert.ok(fs.existsSync('App_Logic_RoundClose.js'),'S05 requires durable local closure gate');let calls=0;
    const data={pendingOperations:[],operationIssues:[],requestSnapshots:[]};if(kind==='pending')data.pendingOperations=[{changeId:'x'}];if(kind==='conflict')data.operationIssues=[{changeId:'x'}];if(kind==='unknown-request')data.requestSnapshots=[{status:'failed'}];
    const app={logic:{callFunction:async()=>{calls++;return {};},showToast(){}},views:{},state:{currentUser:{id:'A'},pendingScoreKeys:kind==='legacy-pending'?{x:true}:{}},scoreSyncStore:{inspectOwnerRound:async(owner,round)=>{assert.equal(owner,'A');assert.equal(round,'R');if(kind==='storage-failure')throw new Error('synthetic IDB read failure');return data;}}};
    vm.runInNewContext(fs.readFileSync('App_Logic_RoundClose.js','utf8'),{app,navigator:{onLine:kind!=='offline'},firebase:{auth:()=>({currentUser:{uid:'A'}})},console});
    await assert.rejects(app.logic.assertRoundCloseLocalReady('R'));assert.equal(calls,0);
});
