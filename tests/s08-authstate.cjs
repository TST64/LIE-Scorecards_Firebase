'use strict';
const assert=require('node:assert/strict'),{PIN}=require('./s08-source.cjs');
async function run(browser,db,auth){
    const token=await auth.createCustomToken('MS12');await browser.evaluate(`firebase.auth().signInWithCustomToken(${JSON.stringify(token)}).then(()=>true)`);
    assert.equal(await browser.evaluate("app.logic.callFunction('getPlayerSessionState',{}).then(r=>r.mustChangePin)"),true);
    const active=(await db.collection('spieltage').where('status','==','Aktiv').get()).docs[0].id;
    assert.equal(await browser.evaluate(`app.logic.callFunction('readOwnFlightScoresV2',{ownerUid:'MS12',playerId:'MS12',spieltagId:${JSON.stringify(active)}}).then(()=>false,()=>true)`),true);
    assert.equal(await browser.evaluate(`(async()=>{const r=await app.logic.callFunction('updatePlayerPin',{spielerId:'MS12',newPin:${JSON.stringify(PIN)}});await firebase.auth().signInWithCustomToken(r.customToken);const t=await firebase.auth().currentUser.getIdTokenResult(true);return r.success&&t.claims.playerId==='MS12'&&t.claims.role==='Spieler'&&t.claims.mustChangePin===false;})()`),true);
    assert.equal((await db.collection('spieler').doc('MS12').get()).data().mustChangePin,false);
    assert.equal(await browser.evaluate(`app.logic.callFunction('getPlayerSessionState',{}).then(r=>r.mustChangePin===false)`),true);assert.equal(await browser.evaluate(`app.logic.callFunction('readOwnFlightScoresV2',{ownerUid:'MS12',playerId:'MS12',spieltagId:${JSON.stringify(active)}}).then(r=>r.flightId==='FL-'+${JSON.stringify(active)}+'-3')`),true,'PIN recovery restores the normal authorized read');
    assert.equal(await browser.evaluate(`app.logic.callFunction('verifyPlayerPin',{spielerId:'MS11',pin:${JSON.stringify(PIN)}}).then(()=>false,()=>true)`),true,'restored login lock persists');
    const disabled=await auth.createCustomToken('MS10');assert.equal(await browser.evaluate(`firebase.auth().signInWithCustomToken(${JSON.stringify(disabled)}).then(()=>false,()=>true)`),true,'restored disabled Auth user remains disabled');
    return {pendingPinInitiallyBlocked:true,pinRecoveryConsistent:true,loginLockPreserved:true,disabledAccountPreserved:true};
}
module.exports={run};
