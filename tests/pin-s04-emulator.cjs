'use strict';
// Real local Admin/Auth/Functions/Firestore + real browser client. Never print
// credentials, hashes, tokens, SDK responses or evaluated expressions.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const guard = require('../functions/local-guard');
const makePin = () => String(crypto.randomInt(100000,1000000));
function hash(pin) { const salt=crypto.randomBytes(16).toString('hex');return ['scrypt',salt,crypto.scryptSync(pin,salt,32).toString('hex')].join('$'); }
function matches(encoded,pin) { const [,salt,key]=encoded.split('$');return crypto.timingSafeEqual(Buffer.from(key,'hex'),crypto.scryptSync(pin,salt,32)); }
async function run({ evaluate,waitFor,reload })
{
    const admin=require('../functions/node_modules/firebase-admin');
    const instance=admin.initializeApp({...guard.validate(process.env),credential:guard.credential(admin)},'s04-pin-evidence');
    const db=instance.firestore(), auth=instance.auth(), initial=makePin(), changed=makePin(), recovered=makePin();
    const player='local-pin-player',other='local-pin-other',manager='local-pin-manager',administrator='local-pin-admin',locked='local-pin-lockout';
    const q=JSON.stringify;
    async function login(id,value) {
        assert.equal(await evaluate(`(async()=>{const r=await app.logic.callFunction('verifyPlayerPin',{spielerId:${q(id)},pin:${q(value)}});await firebase.auth().signInWithCustomToken(r.customToken);return firebase.auth().currentUser.uid===${q(id)};})()`),true,'local login must succeed');
    }
    async function denyUpdate(id) {
        assert.equal(await evaluate(`app.logic.callFunction('updatePlayerPin',{spielerId:${q(id)},newPin:${q(changed)}}).then(()=>false,e=>e.code==='functions/permission-denied')`),true,'unauthorized change rejected');
    }
    async function assertState(id,value) {
        const data=(await db.collection('spieler').doc(id).get()).data(),claims=(await auth.getUser(id)).customClaims;
        assert.ok(matches(data.pinHash,value),'expected credential verifies');assert.equal(data.mustChangePin,false);assert.equal(data.pinChangePending,undefined);
        assert.equal(claims.playerId,id);assert.equal(claims.mustChangePin,false);
    }
    try
    {
        const batch=db.batch();
        for(const [id,role] of [[player,'Spieler'],[other,'Spieler'],[manager,'Spielleiter'],[administrator,'Admin'],[locked,'Spieler']]) {
            const publicData={id,nickname:'Synthetic PIN fixture',name:'Synthetic PIN fixture',role,hcpLIE:26};
            batch.set(db.collection('spieler').doc(id),{...publicData,email:id+'@example.invalid',pinHash:hash(initial),mustChangePin:id===player});
            batch.set(db.collection('spieler_public').doc(id),publicData);
        }
        await batch.commit();
        let wrong=makePin();while(wrong===initial)wrong=makePin();
        for(let i=0;i<5;i++)assert.equal(await evaluate(`app.logic.callFunction('verifyPlayerPin',{spielerId:${q(locked)},pin:${q(wrong)}}).then(()=>false,e=>e.code==='functions/permission-denied')`),true,'wrong credential rejected');
        assert.equal(await evaluate(`app.logic.callFunction('verifyPlayerPin',{spielerId:${q(locked)},pin:${q(initial)}}).then(()=>false,e=>e.code==='functions/resource-exhausted')`),true,'existing lockout policy retained');
        await login(player,initial);
        assert.equal(await evaluate(`(async()=>{const s=await app.logic.readPlayerSessionState(firebase.auth().currentUser);app.state.currentUser={id:s.playerId,role:s.role,mustChangePin:s.mustChangePin};app.router.navigate('pin_aendern');return s.mustChangePin;})()`),true);
        assert.equal(await evaluate("app.db.collection('scorecards').get().then(()=>false,e=>e.code==='permission-denied')"),true,'mandatory token cannot read protected scores');
        assert.equal(await evaluate(`app.db.collection('spieler').doc(${q(player)}).update({mustChangePin:false}).then(()=>false,e=>e.code==='permission-denied')`),true,'no direct PIN-state bypass');
        await denyUpdate(other);
        assert.equal(await evaluate(`(async()=>{document.getElementById('pin-new-1').value=${q(changed)};document.getElementById('pin-new-2').value=${q(changed)};return await app.logic.changePin();})()`),true,'real client completes mandatory change');
        await assertState(player,changed);
        assert.ok(!matches((await db.collection('spieler').doc(player).get()).data().pinHash,initial),'previous credential invalid');
        assert.equal(await evaluate(`app.logic.callFunction('verifyPlayerPin',{spielerId:${q(player)},pin:${q(initial)}}).then(()=>false,e=>e.code==='functions/permission-denied')`),true);
        await reload();await waitFor(`Boolean(window.app&&app.state&&app.state.currentUser&&app.state.currentUser.id===${q(player)}&&app.state.currentView==='dashboard')`);
        assert.equal(await evaluate("app.state.currentUser.mustChangePin===false && firebase.auth().currentUser.getIdTokenResult(true).then(r=>r.claims.mustChangePin===false)"),true,'reload no mandatory loop');
        await evaluate("firebase.auth().signOut().then(()=>true)");await evaluate("app.router.navigate('login');app.logic.loadLoginPlayers().then(()=>{app.router.navigate('login');return true;})");
        assert.equal(await evaluate(`(async()=>{document.getElementById('loginSpielerSelect').value=${q(player)};document.getElementById('loginPinInput').value=${q(changed)};await app.logic.submitPin();return app.state.currentView==='dashboard'&&app.state.currentUser.id===${q(player)};})()`),true,'real login handler accepts new credential');
        await login(manager,initial);await denyUpdate(other);
        await login(administrator,initial);
        assert.equal(await evaluate(`app.logic.callFunction('updatePlayerPin',{spielerId:${q(other)},newPin:${q(changed)}}).then(r=>r.success&&!r.customToken)`),true,'Admin receives no target token');
        await assertState(other,changed);assert.equal((await auth.getUser(administrator)).customClaims.role,'Admin');
        await db.collection('spieler').doc(administrator).update({role:'Spieler'});
        await denyUpdate(other);
        assert.equal(await evaluate("app.db.collection('spieltage').doc('local-pin-denied').set({status:'Aktiv'}).then(()=>false,e=>e.code==='permission-denied')"),true,'stale Admin claim cannot bypass DB role');
        await db.collection('spieler').doc(administrator).update({role:'Admin'});
        await login(player,changed);
        // Construct the exact durable split state tested by VM fault injection:
        // new credential accepted, claims already false, final DB commit missing.
        await db.collection('spieler').doc(player).update({pinHash:hash(recovered),mustChangePin:true,pinChangePending:crypto.randomUUID()});
        assert.equal(await evaluate(`app.logic.callFunction('requestTempPin',{spielerId:${q(player)}}).then(r=>r.success)`),true);
        assert.ok(matches((await db.collection('spieler').doc(player).get()).data().pinHash,recovered),'temporary reset leaves pending personal change intact');
        assert.equal(await evaluate("app.db.collection('scorecards').get().then(()=>false,e=>e.code==='permission-denied')"),true,'DB pending gates an otherwise ready token');
        await reload();await waitFor("Boolean(window.app&&app.state&&app.state.currentView==='pin_aendern')");
        assert.equal(await evaluate(`(async()=>{document.getElementById('pin-new-1').value=${q(recovered)};document.getElementById('pin-new-2').value=${q(recovered)};return await app.logic.changePin();})()`),true,'same credential retry repairs seeded DB/claims split');
        await assertState(player,recovered);
        // A second split is repaired by authenticated credential verification,
        // without requiring the old session or an Admin reset.
        const loginRecovery=makePin();
        await db.collection('spieler').doc(player).update({pinHash:hash(loginRecovery),mustChangePin:true,pinChangePending:crypto.randomUUID()});
        await auth.setCustomUserClaims(player,{playerId:player,role:'Spieler',mustChangePin:true});
        await evaluate("firebase.auth().signOut().then(()=>true)");await login(player,loginRecovery);await assertState(player,loginRecovery);
        // Real commit + lost callable response: the actual client must show no
        // success, while an idempotent same-PIN retry can safely finish the UI.
        const lost=makePin();
        assert.equal(await evaluate(`(async()=>{app.state.currentUser={id:${q(player)},role:'Spieler',mustChangePin:false};app.router.navigate('pin_aendern');document.getElementById('pin-new-1').value=${q(lost)};document.getElementById('pin-new-2').value=${q(lost)};const original=app.logic.apiRequest;app.logic.apiRequest=async(a,p)=>{const r=await original(a,p);if(a==='updatePlayerPin')throw new Error('synthetic lost reply');return r;};try{return (await app.logic.changePin())===false&&app.state.currentView==='pin_aendern'&&!document.getElementById('change-pin-btn').disabled;}finally{app.logic.apiRequest=original;}})()`),true);
        await assertState(player,lost);
        assert.equal(await evaluate('app.logic.changePin()'),true,'same-PIN retry after lost reply succeeds');
        const forged=await auth.createCustomToken(player,{playerId:other,role:'Admin',mustChangePin:false});
        await evaluate(`firebase.auth().signInWithCustomToken(${q(forged)}).then(()=>true)`);await denyUpdate(other);
        assert.equal(await evaluate("app.db.collection('scorecards').get().then(()=>false,e=>e.code==='permission-denied')"),true,'UID/claim mismatch rejected by Rules');
        await evaluate("firebase.auth().signOut().then(()=>true)");
        require('node:fs').writeFileSync(require('node:path').join(__dirname,'../.local-runtime/s04-pin-proof.json'),JSON.stringify({projectId:guard.PROJECT,
            actualClientChange:true,oldCredentialRejected:true,newCredentialLogin:true,reloadWithoutLoop:true,adminTargetClaims:true,
            foreignRoleAndUidRejected:true,staleAdminRejected:true,lockoutRetained:true,seededSplitRetryAndLoginRecovered:true,
            pendingTemporaryResetBlocked:true,realCommitLostReplyRecovered:true,credentialMaterialLogged:false},null,2));
        console.log('PASS S04 real Auth/Functions/Firestore/Rules/client PIN change, old/new login, reload, Admin/foreign/UID guards, seeded split-state retry/login recovery and lost response. No credential material logged.');
    }
    finally {await instance.delete();}
}
module.exports={run};
