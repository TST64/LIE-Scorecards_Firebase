// These checks PASS when known baseline defects are reproduced. They are NOT release acceptance tests.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const load=(c,file)=>vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),c,{filename:file});
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function client(){
 const c=vm.createContext({console:{log(){},warn(){},error(){}},document:{getElementById:()=>null},
  app:{state:{liveScores:{},scoreCards:[],spieler:[{id:'P',hcpLIE:26}],spieltage:[{id:'R',kursId:'K'}]},logic:{}}});
 load(c,'App_Logic_Scores.js');
 Object.assign(c.app.logic,{calculateHoleVorgabe:()=>1,showToast(){},stopLivePolling(){},startLivePolling(){}});
 return c;
}
test('BASELINE DEFECT: delayed ACK deletes newer score',async()=>{
 const c=client();let ack;
 c.app.state.liveScores.R_P_1=5;
 c.app.logic.apiRequest=()=>new Promise(resolve=>ack=resolve);
 c.app.logic.syncScoresWithServer('R',1);
 c.app.state.liveScores.R_P_1=6;
 ack({success:true});await tick();
 assert.equal(c.app.state.liveScores.R_P_1,undefined);
 assert.equal(c.app.state.scoreCards[0].strokes,5);
});
test('BASELINE DEFECT: ACK deletes unsent putts on another hole',async()=>{
 const c=client();let payload;
 Object.assign(c.app.state.liveScores,{R_P_1:5,R_P_2_puts:1});
 c.app.logic.apiRequest=async(_action,args)=>{payload=args.payload;return {success:true}};
 c.app.logic.syncScoresWithServer('R',1);await tick();
 assert.equal(payload.length,1);assert.equal(payload[0].hole,1);
 assert.equal(c.app.state.liveScores.R_P_2_puts,undefined);
});
test('BASELINE DEFECT: incomplete historical round disappears',()=>{
 const c=client();load(c,'App_Logic_History.js');load(c,'App_Logic_Performance.js');
 Object.assign(c.app.state,{saisonStartDatum:'2026-01-01',kurse:[{id:'K',name:'Synthetic'}],golfplaetze:[],
  bahnen:Array.from({length:18},(_,i)=>({kursId:'K',nr:i+1,si:i+1,par:4})),
  spieltage:[{id:'R',kursId:'K',status:'Beendet',date:'2026-11-01',rundenTyp:'18',bahnAnzahl:18,teilnehmerCsv:'P'}],
  scoreCards:Array.from({length:9},(_,i)=>({spieltagId:'R',spielerId:'P',hole:i+1,strokes:5,puts:2}))});
 const result=c.app.logic.getPersonalPerformance(c.app.state.spieler[0]);
 assert.equal(result.rounds.length,0);assert.equal(c.app.state.scoreCards.length,9);
});
test('BASELINE DEFECT: HCP decimals truncated even in incomplete round',()=>{
 const c=client();load(c,'App_Logic_History.js');c.app.state.bahnen=[];
 const result=c.app.logic.calculateRoundForPlayer({id:'R',kursId:'K',bahnAnzahl:18},'P',26.5,[]);
 assert.equal(result.startHcp,26);assert.equal(result.endHcp,26);
});
test('BASELINE DEFECT: valid PIN change raises undefined tempPin before write',async()=>{
 let writes=0;
 const firestore=()=>({collection:()=>({doc:()=>({get:async()=>({exists:true,data:()=>({role:'Spieler'})}),set:async()=>writes++})})});
 firestore.FieldValue={delete:()=>null,serverTimestamp:()=>null};
 const exports={};
 const c=vm.createContext({exports,console:{log(){}},require(name){
  if(name==='crypto')return require('node:crypto');
  if(name==='firebase-functions/v2/https')return {onCall:f=>f,HttpsError:Error};
  if(name==='firebase-functions/v2')return {setGlobalOptions(){}};
  if(name==='firebase-admin')return {initializeApp(){},firestore,auth:()=>{throw Error('unexpected auth access')}};
  throw Error('unexpected module '+name);
 }});
 load(c,'functions/index.js');
 await assert.rejects(exports.updatePlayerPin({auth:{uid:'P',token:{playerId:'P',role:'Spieler'}},data:{spielerId:'P',newPin:'735916'}}),/tempPin is not defined/);
 assert.equal(writes,0);
});
test('BASELINE DEFECT: failed HCP batch leaves round already ended',async()=>{
 const c=client();load(c,'App_Logic_Bridge.js');let status='Aktiv';
 c.app.db={collection:()=>({doc:()=>({update:async(data)=>{status=data.status}})}),batch:()=>({update(){},commit:async()=>{throw Error('synthetic batch failure')}})};
 const result=await c.app.logic.apiRequest('closeSpieltagServer',{spieltagId:'R',handicapUpdates:[{spielerId:'P',newHcpLie:25}]});
 assert.equal(result.success,false);assert.equal(status,'Beendet');
});
