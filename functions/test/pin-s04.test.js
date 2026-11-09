'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { memoryDatabase, fieldValue } = require('./memory-score-database');
const pin = () => String(crypto.randomInt(100000, 1000000));
test('S05 login discovery never stages writes to public HCP projections',async()=>{
    const f=await fixture(),original=f.db.collection.bind(f.db);
    f.db.collection=name=>({...original(name),get:async()=>({forEach:fn=>[{id:'A',data:()=>({nickname:'Synthetic',hcpLIE:26})}].forEach(fn)})});
    f.db.batch=()=>{throw new Error('Login discovery must not write');};
    const result=await f.exports.getLoginPlayers({data:{}});assert.equal(result.success,true);assert.equal(result.spieler.length,1);
});
function hash(value) { const salt = crypto.randomBytes(16).toString('hex'); return ['scrypt',salt,crypto.scryptSync(value,salt,32).toString('hex')].join('$'); }
function matches(encoded, value) { const [format,salt,key] = encoded.split('$'); return format === 'scrypt' && crypto.timingSafeEqual(Buffer.from(key,'hex'),crypto.scryptSync(value,salt,32)); }
async function fixture()
{
    const db = memoryDatabase(), oldPin = pin(), newPin = pin(), users = new Map(), calls = [], logs = [];
    for (const [id,role] of [['A','Spieler'],['B','Spieler'],['ADMIN','Admin'],['MANAGER','Spielleiter']]) {
        await db.collection('spieler').doc(id).set({ id, role, email:id+'@example.invalid', pinHash: hash(oldPin), mustChangePin: id === 'A', failedPinAttempts: 2 });
        users.set(id,{ uid:id,customClaims:{ playerId:id,role,mustChangePin:id==='A',unrelated:true } });
    }
    const collection = db.collection.bind(db);
    db.collection = name => { const c = collection(name), doc = c.doc; c.doc = id => ({ ...doc(id), id }); return c; };
    class HttpsError extends Error { constructor(code,message,details) { super(message);this.code=code;this.details=details; } }
    const f = { db, oldPin, newPin, users, calls, logs, txCount:0 };
    const run = db.runTransaction.bind(db);
    db.runTransaction = async work => { const n=++f.txCount; if(f.beforeTx){const hook=f.beforeTx;f.beforeTx=null;await hook();} if(f.failTx===n) throw new Error('synthetic DB rejection'); const r=await run(work); if(f.failAfterTx===n) throw new Error('synthetic lost DB acknowledgement');return r; };
    const auth = {
        async getUser(uid) { if(!users.has(uid)) throw Object.assign(new Error('synthetic missing user'),{code:'auth/user-not-found'});return structuredClone(users.get(uid)); },
        async createUser({uid}) { users.set(uid,{uid,customClaims:{}});return users.get(uid); },
        async setCustomUserClaims(uid,claims) { calls.push({uid,claims});if(f.failClaims)throw new Error('synthetic claims failure');users.set(uid,{uid,customClaims:structuredClone(claims)});if(f.failAfterClaims)throw new Error('synthetic claims acknowledgement lost'); },
        async createCustomToken(uid,claims) { if(f.failToken)throw new Error('synthetic token failure');f.minted={uid,claims};return 'synthetic-opaque-session'; }
    };
    const context = { Buffer, exports:{}, process:{env:{}}, console:{error:(...args)=>logs.push(args),log:(...args)=>logs.push(args)}, require(name) {
        if(name==='crypto')return crypto;
        if(name==='./local-guard')return {validate:()=>({}),credential:()=>({}),disabledMail:async()=>{f.mailCalls=(f.mailCalls||0)+1;if(f.mail)return f.mail();throw new Error('mail must not run');}};
        if(name==='./network-guard')return {};
        if(name==='firebase-functions/v2/https')return {onCall:f=>f,HttpsError};
        if(name==='firebase-functions/v2')return {setGlobalOptions(){}};
        if(name==='firebase-admin')return {initializeApp(){},firestore:()=>db,auth:()=>auth};
        if(name==='firebase-admin/firestore')return {FieldValue:{...fieldValue,serverTimestamp:()=>({synthetic:true})},Timestamp:{fromMillis:n=>({toMillis:()=>n})}};
        if(name==='./round-start')return require('../round-start');
        if(name==='./round-close')return require('../round-close');
        if(name.startsWith('./score-'))return require('../'+name.slice(2));
        throw new Error('unexpected dependency');
    } };
    const source=process.env.PIN_S04_BASELINE==='1'
        ?require('node:child_process').execFileSync('git',['show','f862cf0c8f73ef610cdc711218e2a1dd84b8a839:functions/index.js'],{cwd:path.join(__dirname,'../..'),encoding:'utf8'})
        :fs.readFileSync(path.join(__dirname,'../index.js'),'utf8');
    vm.runInNewContext(source,context,{filename:'actual-functions-index.js'});
    f.exports=context.exports; f.request={auth:{uid:'A',token:{playerId:'A',role:'Spieler',mustChangePin:true}},data:{spielerId:'A',newPin}};
    f.update=()=>f.exports.updatePlayerPin(f.request); f.read=async id=>(await db.collection('spieler').doc(id||'A').get()).data();
    f.login=value=>f.exports.verifyPlayerPin({data:{spielerId:'A',pin:value}});
    return f;
}
test('AU01 actual callable changes validated PIN, clears DB/claims and accepts only new credential', async()=>{
    const f=await fixture();const r=await f.update();assert.equal(r.success,true);
    const data=await f.read();assert.ok(matches(data.pinHash,f.newPin),'new credential must verify');assert.ok(!matches(data.pinHash,f.oldPin),'old credential must fail');
    assert.equal(data.mustChangePin,false);assert.equal(data.pinChangePending,undefined);assert.equal(data.pin,undefined);assert.equal(data.tempPinSentAt,undefined);
    assert.equal(f.users.get('A').customClaims.mustChangePin,false);assert.equal(f.users.get('A').customClaims.unrelated,true);
    await assert.rejects(f.login(f.oldPin),e=>e.code==='permission-denied');assert.equal((await f.login(f.newPin)).mustChangePin,false);
    assert.equal(f.minted.claims,undefined,'session token must not override persistent claims');assert.equal(f.logs.length,0);
});
for(const kind of ['unauthenticated','foreign','uid-mismatch','forged-admin','manager','mandatory-admin','deleted','invalid-pin','invalid-id'])test('AU03 deny '+kind+' without credential/claims writes',async()=>{
    const f=await fixture(),before=await f.read();
    if(kind==='unauthenticated')f.request.auth=null;
    if(kind==='foreign')f.request.data.spielerId='B';
    if(kind==='uid-mismatch')f.request.auth.uid='B';
    if(kind==='forged-admin'){f.request.auth.token.role='Admin';f.request.data.spielerId='B';}
    if(kind==='manager'){f.request.auth={uid:'MANAGER',token:{playerId:'MANAGER',role:'Spielleiter'}};f.request.data.spielerId='B';}
    if(kind==='mandatory-admin'){f.request.auth={uid:'ADMIN',token:{playerId:'ADMIN',role:'Admin',mustChangePin:true}};f.request.data.spielerId='B';}
    if(kind==='deleted')await f.db.collection('spieler').doc('A').set({istGeloescht:true},{merge:true});
    if(kind==='invalid-pin')f.request.data.newPin='invalid';
    if(kind==='invalid-id')f.request.data.spielerId='invalid/path';
    const expected = kind==='unauthenticated'?'unauthenticated':kind.startsWith('invalid-')?'invalid-argument':'permission-denied';
    await assert.rejects(f.update(),e=>e.code===expected);assert.ok((await f.read()).pinHash===before.pinHash,'original credential retained');assert.equal(f.calls.length,0);
});
test('AU03 authorized Admin changes target claims only and gets no target session',async()=>{
    const f=await fixture();f.request.auth={uid:'ADMIN',token:{playerId:'ADMIN',role:'Admin',mustChangePin:false}};f.request.data.spielerId='B';
    const r=await f.update();assert.equal(r.success,true);assert.equal(r.customToken,undefined);assert.ok(matches((await f.read('B')).pinHash,f.newPin));
    assert.equal(f.users.get('B').customClaims.mustChangePin,false);assert.ok(f.calls.every(c=>c.uid==='B'));assert.equal(f.users.get('ADMIN').customClaims.role,'Admin');
});
test('repeated successful request does not reintroduce mandatory status',async()=>{
    const f=await fixture();await f.update();const first=await f.read();await f.update();const second=await f.read();assert.ok(first.pinHash===second.pinHash);assert.equal(second.mustChangePin,false);
});
for(const kind of ['prepare-db','prepare-ack','claims','claims-ack','final-db','final-ack','token'])test('AU04 '+kind+' failure never reports success; same credential retry repairs',async()=>{
    const f=await fixture();
    if(kind==='prepare-db')f.failTx=1;if(kind==='prepare-ack')f.failAfterTx=1;if(kind==='claims')f.failClaims=true;if(kind==='claims-ack')f.failAfterClaims=true;
    if(kind==='final-db')f.failTx=2;if(kind==='final-ack')f.failAfterTx=2;if(kind==='token')f.failToken=true;
    await assert.rejects(f.update(),e=>e.code==='unavailable'||e.code==='failed-precondition');
    const during=await f.read();if(['prepare-ack','claims','claims-ack','final-db'].includes(kind)){assert.equal(during.mustChangePin,true);assert.ok(during.pinChangePending);}
    if(kind==='prepare-db')assert.ok(matches(during.pinHash,f.oldPin));
    f.failTx=0;f.failAfterTx=0;f.failClaims=false;f.failAfterClaims=false;f.failToken=false;
    assert.equal((await f.update()).success,true);assert.equal((await f.read()).mustChangePin,false);assert.equal(f.users.get('A').customClaims.mustChangePin,false);assert.equal(f.logs.length,0);
});
test('login with new credential repairs pending claims failure, old credential cannot',async()=>{
    const f=await fixture();f.failClaims=true;await assert.rejects(f.update());f.failClaims=false;
    await assert.rejects(f.login(f.oldPin));assert.equal((await f.login(f.newPin)).mustChangePin,false);assert.equal((await f.read()).pinChangePending,undefined);
});
test('different credential cannot overwrite a pending operation',async()=>{
    const f=await fixture();f.failClaims=true;await assert.rejects(f.update());f.failClaims=false;f.request.data.newPin=pin();
    await assert.rejects(f.update(),e=>e.code==='failed-precondition');assert.ok(matches((await f.read()).pinHash,f.newPin));
});
test('disabled Auth actor cannot change even own credential',async()=>{
    const f=await fixture(),before=await f.read();f.users.get('A').disabled=true;
    await assert.rejects(f.update(),e=>e.code==='permission-denied');assert.ok((await f.read()).pinHash===before.pinHash);assert.equal(f.calls.length,0);
});
test('Admin cannot change a deleted target',async()=>{
    const f=await fixture();f.request.auth={uid:'ADMIN',token:{playerId:'ADMIN',role:'Admin',mustChangePin:false}};f.request.data.spielerId='B';
    await f.db.collection('spieler').doc('B').set({istGeloescht:true},{merge:true});await assert.rejects(f.update(),e=>e.code==='not-found');assert.equal(f.calls.length,0);
});
for(const kind of ['claims','token'])test('login '+kind+' failure returns no session and remains retryable',async()=>{
    const f=await fixture();await f.update();if(kind==='claims')f.failClaims=true;else f.failToken=true;
    await assert.rejects(f.login(f.newPin),e=>e.code==='unavailable');f.failClaims=false;f.failToken=false;
    assert.equal((await f.login(f.newPin)).mustChangePin,false);assert.equal(f.logs.length,0);
});
test('session status checks DB pending despite ready claim and exposes no credentials',async()=>{
    const f=await fixture();f.request.auth.token.mustChangePin=false;
    await f.db.collection('spieler').doc('A').set({mustChangePin:false,pinChangePending:'synthetic-operation'},{merge:true});
    const result=await f.exports.getPlayerSessionState({auth:f.request.auth});assert.equal(result.mustChangePin,true);
    assert.deepEqual(Object.keys(result).sort(),['success','playerId','role','mustChangePin'].sort());
    await assert.rejects(f.exports.getPlayerSessionState({auth:{uid:'B',token:{playerId:'A'}}}),e=>e.code==='permission-denied');
});
test('temporary reset never overwrites a pending personal change',async()=>{
    const f=await fixture();f.failClaims=true;await assert.rejects(f.update());const before=await f.read();
    assert.equal((await f.exports.requestTempPin({data:{spielerId:'A'}})).success,true);assert.ok((await f.read()).pinHash===before.pinHash);assert.ok(!f.mailCalls);
});
test('temporary reset CAS does not overwrite a personal change begun after initial read',async()=>{
    const f=await fixture();f.beforeTx=()=>f.update();
    assert.equal((await f.exports.requestTempPin({data:{spielerId:'A'}})).success,true);assert.ok(matches((await f.read()).pinHash,f.newPin));assert.ok(!f.mailCalls);
});
test('temporary delivery rollback cannot undo a newer completed personal change',async()=>{
    const f=await fixture();f.mail=async()=>{await f.update();throw new Error('synthetic delivery failure');};
    await assert.rejects(f.exports.requestTempPin({data:{spielerId:'A'}}),e=>e.code==='internal');
    const data=await f.read();assert.ok(matches(data.pinHash,f.newPin));assert.equal(data.mustChangePin,false);assert.equal(f.users.get('A').customClaims.mustChangePin,false);
});
test('concurrent same-credential requests converge without resetting completed state',async()=>{
    const f=await fixture();const results=await Promise.all([f.update(),f.update()]);assert.ok(results.every(r=>r.success));assert.equal((await f.read()).mustChangePin,false);
});
