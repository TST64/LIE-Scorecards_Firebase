'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');const crypto=require('node:crypto');
function fixture(kind)
{
    const value=String(crypto.randomInt(100000,1000000)), messages=[],routes=[],calls=[];
    const inputs={'pin-new-1':{value},'pin-new-2':{value},'change-pin-btn':{disabled:false},loginSpielerSelect:{value:'A'},loginPinInput:{value},loginSubmitBtn:{disabled:false}};
    const authUser={uid:'A',async getIdTokenResult(){if(kind==='refresh')throw new Error('synthetic refresh error');return {claims:{playerId:kind==='claims'?'B':'A',mustChangePin:kind==='mandatory',role:'Spieler'}};},async getIdToken(){if(kind==='refresh')throw new Error('synthetic refresh error');}};
    const auth={currentUser:authUser,async setPersistence(){},async signOut(){auth.currentUser=null;},async signInWithCustomToken(){if(kind==='login')throw new Error('synthetic login error');return {user:authUser};}};
    const c={localStorage:{setItem(){}},app:{state:{spieler:[{id:'A',role:'Spieler'}],currentUser:{id:'A',mustChangePin:true}},logic:{async loadLoginPlayers(){},async callFunction(){if(kind==='status')throw new Error('synthetic status failure');return {success:true,playerId:'A',mustChangePin:kind==='db-pending',role:'Spieler'};},showToast:(message,type)=>messages.push({message,type}),async apiRequest(action){calls.push(action);if(kind==='transport')throw new Error('synthetic transport error');return {success:kind!=='rejected',mustChangePin:false,customToken:'synthetic-session'};}},router:{navigate:r=>routes.push(r)}},firebase:{auth:()=>auth},document:{getElementById:id=>inputs[id]}};
    c.firebase.auth.Auth={Persistence:{LOCAL:'local'}};
    vm.runInNewContext(fs.readFileSync('App_Logic_Spieler.js','utf8'),c);
    return {c,inputs,messages,routes,calls};
}
test('client acknowledges only verified refreshed session, clears inputs and releases button',async()=>{
    const f=fixture();await f.c.app.logic.changePin();await new Promise(setImmediate);
    assert.equal(f.c.app.state.currentUser.mustChangePin,false);assert.ok(f.messages.some(x=>x.type==='success'));assert.ok(f.inputs['pin-new-1'].value==='','secret input cleared after verified success');assert.equal(f.inputs['change-pin-btn'].disabled,false);assert.equal(f.routes.at(-1),'dashboard');
});
for(const kind of ['transport','rejected','login','refresh','claims','mandatory','status','db-pending'])test('client '+kind+' failure never claims success and stays recoverable',async()=>{
    const f=fixture(kind);
    // Baseline returns void and has no rejection handler. Fail before starting an
    // unhandled promise; the subsequent assertions exercise actual fixed behavior.
    assert.equal(f.c.app.logic.changePin.constructor.name,'AsyncFunction','PIN action must be awaitable for guarded recovery');
    await f.c.app.logic.changePin();assert.equal(f.c.app.state.currentUser.mustChangePin,true);assert.ok(!f.messages.some(x=>x.type==='success'));assert.ok(f.messages.some(x=>x.type==='error'));assert.ok(!f.routes.includes('dashboard'));assert.equal(f.inputs['change-pin-btn'].disabled,false);
});
test('duplicate click sends one request only',async()=>{
    const f=fixture();let release,count=0;f.c.app.logic.apiRequest=()=>{count++;return new Promise(resolve=>{release=()=>resolve({success:true,mustChangePin:false,customToken:'synthetic'});});};
    const first=f.c.app.logic.changePin();assert.equal(await f.c.app.logic.changePin(),false);assert.equal(count,1);release();assert.equal(await first,true);assert.equal(f.inputs['change-pin-btn'].disabled,false);
});
test('late result never clears another owners mandatory state or signs it out',async()=>{
    const f=fixture();let release;f.c.app.logic.apiRequest=()=>new Promise(resolve=>{release=()=>resolve({success:true,mustChangePin:false,customToken:'synthetic'});});
    const first=f.c.app.logic.changePin();f.c.app.state.currentUser={id:'B',mustChangePin:true};f.c.firebase.auth().currentUser={uid:'B'};release();
    assert.equal(await first,false);assert.equal(f.c.app.state.currentUser.id,'B');assert.equal(f.c.app.state.currentUser.mustChangePin,true);assert.equal(f.c.firebase.auth().currentUser.uid,'B');assert.ok(!f.routes.includes('dashboard'));
});
for(const kind of ['transport','login','status'])test('actual submitPin handles '+kind+' failure without false login or disabled button',async()=>{
    const f=fixture(kind);await f.c.app.logic.submitPin();assert.ok(!f.routes.includes('dashboard'));assert.ok(f.messages.some(x=>x.type==='error'));assert.equal(f.inputs.loginSubmitBtn.disabled,false);
});
