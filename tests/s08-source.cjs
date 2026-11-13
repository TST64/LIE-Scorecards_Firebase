'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),C=require('../tools/local/restore-contract.cjs'),B=require('../tools/local/synthetic-backup.cjs');
const PIN='824613'; // Public synthetic fixture PIN only; never printed.
async function run(browser,db,auth,profile,root){
    const backups=path.join(root,'backups'),anchors={};let closingRefused=false,quarantine,stageReader,pendingCut,stageQuarantine,activeStageWaited=false;
    const urls=Object.values(profile.emulators).map(e=>'http://127.0.0.1:'+e.port+'/*');
    async function pause(clients,on){for(const c of clients){await c.command('Network.setBlockedURLs',{urls:on?urls:[]});await c.evaluate("Object.defineProperty(navigator,'onLine',{get:()=>"+(!on)+",configurable:true});true");}}
    browser.onClosingWindow=async({clients,shadow})=>{const all=[...clients,...(shadow?[shadow]:[])];await pause(all,true);try{const cut=await B.freeze(db);
        await assert.rejects(async()=>C.seal(await B.inventory(db,auth,cut)),/Open closure backup refused/);closingRefused=true;
    }finally{await B.unfreeze(db);await pause(all,false);}};
    // No seed substitution: these are the existing normal three-round UI paths.
    await require('./round-close-s05-emulator.cjs').run(browser);assert.equal(closingRefused,true);
    const players=Array.from({length:12},(_,i)=>'MS'+String(i+1).padStart(2,'0'));
    for(const id of [...players.filter(p=>p!=='MS01'),'MS01']){
        assert.equal(await browser.evaluate(`(async()=>{const r=await app.logic.callFunction('updatePlayerPin',{spielerId:${JSON.stringify(id)},newPin:${JSON.stringify(PIN)}});if(${JSON.stringify(id)}==='MS01')await firebase.auth().signInWithCustomToken(r.customToken);return r.success&&r.mustChangePin===false;})()`),true);
    }
    for(const id of players)assert.equal(await browser.evaluate(`app.logic.callFunction('verifyPlayerPin',{spielerId:${JSON.stringify(id)},pin:${JSON.stringify(PIN)}}).then(r=>r.success&&r.mustChangePin===false)`),true);
    browser.onStage400=async({reader})=>{stageReader=reader;stageQuarantine=await browser.evaluate("(async()=>{const owner=String(app.state.currentUser.id),store=app.createScoreEntryContextStore();let rows;try{rows=await store.list(owner);}finally{await store.close();}const v2=[];for(const row of rows){const c={ownerUid:owner,playerId:owner,spieltagId:row.spieltagId,flightId:row.response.flightId},d=await app.scoreSyncStore.inspect(c);v2.push({...c,pendingOperations:d.pendingOperations,requestSnapshots:d.requestSnapshots});}return {v1:[],v2};})()");};
    browser.onActiveStage=async()=>{await pause([browser,stageReader],true);let finished=false;pendingCut=B.freeze(db).then(cut=>{finished=true;return cut;});for(let n=0;n<100;n++){if((await db.collection('localMaintenance').doc('current').get()).data().state==='quiescing')break;await new Promise(r=>setTimeout(r,10));}assert.equal((await db.collection('localMaintenance').doc('current').get()).data().state,'quiescing');assert.equal(finished,false,'no snapshot while an actual S07 stage request is active');assert.ok((await db.collection('localMaintenanceRequests').where('active','==',true).get()).size>0);activeStageWaited=true;};
    browser.onStageFailure=async()=>{const cut=await pendingCut;try{const artifact=C.seal(await B.inventory(db,auth,cut,stageQuarantine));B.writeArtifact(path.join(backups,'interrupted'),artifact);anchors.interrupted={digest:artifact.digest,inventory:artifact.inventory,authUsers:artifact.payload.users.length};}finally{await B.unfreeze(db);await pause([browser,stageReader],false);}};
    browser.onWorkerExit=async({pid,exitCode})=>{assert.equal(exitCode,73);await B.reapExitedStage(db,pid);};
    await require('./history-s07-emulator.cjs').run(browser);
    await browser.waitFor("app.state.scoreEntryV2.syncStatus?.status==='confirmed'&&Object.values(app.state.scoreEntryV2.entries).every(e=>!e.pendingOperations.length)");
    await pause([browser],true);await browser.evaluate("document.getElementById('lie-strokes-plus-MS02').click();true");await browser.waitFor('Object.values(app.state.scoreEntryV2.entries).some(e=>e.pendingOperations.length)');
    quarantine=await browser.evaluate("(async()=>{const owner=String(app.state.currentUser.id),store=app.createScoreEntryContextStore();let rows;try{rows=await store.list(owner);}finally{await store.close();}const v2=[];for(const row of rows){const c={ownerUid:owner,playerId:owner,spieltagId:row.spieltagId,flightId:row.response.flightId},d=await app.scoreSyncStore.inspect(c);v2.push({...c,pendingOperations:d.pendingOperations,requestSnapshots:d.requestSnapshots});}const legacy={key:'lie_score_sync_v1',value:{ownerUid:owner,strokes:99}};localStorage.setItem(legacy.key,JSON.stringify(legacy.value));return {v1:[legacy],v2};})()");
    fs.writeFileSync(path.join(root,'source-quarantine.json'),JSON.stringify(quarantine),{mode:0o600});
    return {anchors,closingRefused,activeStageWaited,quarantine};
}
module.exports={run,PIN};
