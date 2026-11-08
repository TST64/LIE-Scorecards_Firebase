'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');const crypto=require('node:crypto');
function fixture(kind)
{
    const value=String(crypto.randomInt(100000,1000000)), messages=[],routes=[],calls=[];
    const inputs={'pin-new-1':{value},'pin-new-2':{value},'change-pin-btn':{disabled:false}};
    const authUser={uid:'A',async getIdTokenResult(){if(kind==='refresh')throw new Error('synthetic refresh error');return {claims:{playerId:kind==='claims'?'B':'A',mustChangePin:kind==='mandatory',role:'Spieler'}};},async getIdToken(){if(kind==='refresh')throw new Error('synthetic refresh error');}};
    const auth={currentUser:authUser,async signInWithCustomToken(){if(kind==='login')throw new Error('synthetic login error');return {user:authUser};}};
    const c={app:{state:{currentUser:{id:'A',mustChangePin:true}},logic:{showToast:(message,type)=>messages.push({message,type}),async apiRequest(action){calls.push(action);if(kind==='transport')throw new Error('synthetic transport error');return {success:kind!=='rejected',mustChangePin:false,customToken:'synthetic-session'};}},router:{navigate:r=>routes.push(r)}},firebase:{auth:()=>auth},document:{getElementById:id=>inputs[id]}};
    vm.runInNewContext(fs.readFileSync('App_Logic_Spieler.js','utf8'),c);
    return {c,inputs,messages,routes,calls};
}
test('client acknowledges only verified refreshed session, clears inputs and releases button',async()=>{
    const f=fixture();await f.c.app.logic.changePin();await new Promise(setImmediate);
    assert.equal(f.c.app.state.currentUser.mustChangePin,false);assert.ok(f.messages.some(x=>x.type==='success'));assert.equal(f.inputs['pin-new-1'].value,'');assert.equal(f.inputs['change-pin-btn'].disabled,false);assert.equal(f.routes.at(-1),'dashboard');
});
for(const kind of ['transport','rejected','login','refresh','claims','mandatory'])test('client '+kind+' failure never claims success and stays recoverable',async()=>{
    const f=fixture(kind);
    // Baseline returns void and has no rejection handler. Fail before starting an
    // unhandled promise; the subsequent assertions exercise actual fixed behavior.
    assert.equal(f.c.app.logic.changePin.constructor.name,'AsyncFunction','PIN action must be awaitable for guarded recovery');
    await f.c.app.logic.changePin();assert.equal(f.c.app.state.currentUser.mustChangePin,true);assert.ok(!f.messages.some(x=>x.type==='success'));assert.ok(f.messages.some(x=>x.type==='error'));assert.ok(!f.routes.includes('dashboard'));assert.equal(f.inputs['change-pin-btn'].disabled,false);
});
