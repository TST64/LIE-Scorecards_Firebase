'use strict';
const assert=require('node:assert/strict');const crypto=require('node:crypto');const fs=require('node:fs');const path=require('node:path');
const guard=require('../functions/local-guard');const {readDocumentState}=require('../functions/score-operations-v2');
async function run(primary)
{
    const admin=require('../functions/node_modules/firebase-admin');const instance=admin.initializeApp({...guard.validate(process.env),credential:guard.credential(admin)},'sync-s02-s03-test');
    const db=instance.firestore(),auth=instance.auth(),q=JSON.stringify,round='sync-round';
    const pin=String(crypto.randomInt(100000,1000000)),salt=crypto.randomBytes(16).toString('hex');
    const encoded=['scrypt',salt,crypto.scryptSync(pin,salt,32).toString('hex')].join('$');
    const players=Array.from({length:12},(_,i)=>'SYN'+String(i+1).padStart(2,'0'));
    const flight=id=>'sync-flight-'+(Math.floor(players.indexOf(id)/4)+1);
    const ref=(id,hole=1)=>db.collection('scorecards').doc('SC-'+round+'-'+id+'-'+hole);
    let second,manager,stage='seed';
    async function until(work){for(let i=0;i<200;i++){if(await work())return;await new Promise(r=>setTimeout(r,100));}throw new Error('Independent emulator assertion timed out');}
    async function login(client,id)
    {
        assert.equal(await client.evaluate(`(async()=>{await firebase.auth().signOut();app.state.currentUser=null;const r=await app.logic.callFunction('verifyPlayerPin',{spielerId:${q(id)},pin:${q(pin)}});await firebase.auth().signInWithCustomToken(r.customToken);await app.logic.refreshGlobalAppData();app.state.currentUser={...app.state.spieler.find(p=>p.id===${q(id)}),mustChangePin:false};app.router.navigate('score_eingabe',{id:${q(round)},hole:1});return true;})()`),true);
        await client.waitFor(`Boolean(app.state.scoreEntryV2?.status==='ready'&&app.state.scoreScreenContext?.owner===${q(id)}&&document.getElementById('lie-strokes-plus-'+${q(id)}))`);
    }
    async function settled(client){await client.waitFor("Boolean(app.state.scoreEntryV2?.syncStatus?.status==='confirmed'&&Object.values(app.state.scoreEntryV2.entries).every(e=>!e.pendingOperations.length))");}
    async function normalClick(client,id,field='strokes',direction='plus')
    {assert.equal(await client.evaluate(`Boolean(document.getElementById(${q('lie-'+field+'-'+direction+'-'+id)}).click()===undefined)`),true);}
    try
    {
        const batch=db.batch();
        for(const id of [...players,'sync-admin']){
            const data={id,nickname:'Synthetic '+id,name:'Synthetic '+id,role:id==='sync-admin'?'Admin':'Spieler',hcpLIE:54};
            batch.set(db.collection('spieler').doc(id),{...data,pinHash:encoded,mustChangePin:false});batch.set(db.collection('spieler_public').doc(id),data);
        }
        batch.set(db.collection('spieltage').doc(round),{id:round,kursId:'sync-course',status:'Aktiv',rundenTyp:'9-Front',bahnAnzahl:9,
            teilnehmerCsv:players.join(','),hcpStart:Object.fromEntries(players.map((id,i)=>[id,i===0?0:26])),
            ...require('../functions/test/hcp-fixture').metadata({rundenTyp:'9-Front',bahnAnzahl:9},Object.fromEntries(players.map((id,i)=>[id,i===0?0:26])))});
        batch.set(db.collection('kurse').doc('sync-course'),{name:'Synthetic sync course'});
        for(let h=1;h<=9;h++)batch.set(db.collection('bahnen').doc('sync-hole-'+h),{kursId:'sync-course',nr:h,par:4,si:h});
        for(let i=0;i<3;i++)batch.set(db.collection('flights').doc('sync-flight-'+(i+1)),{spieltagId:round,seq:i+1,spielerIdsCsv:players.slice(i*4,i*4+4).join(',')});
        await batch.commit();
        // Each write originates from a normal visible input handler. No test call
        // to adapter.sync/flush substitutes for the integrated sender.
        for(const id of players){
            stage='normal-ui-'+id;
            await login(primary,id);await normalClick(primary,id);
            await until(async()=>{const d=await ref(id).get();return d.exists&&d.data().strokes===5;});await settled(primary);
            const d=(await ref(id).get()).data();assert.equal(d.hcpStart,id===players[0]?0:26);assert.equal(d.strokesGiven,id===players[0]?0:2);assert.equal(d.puts,2);
        }
        console.log('PASS S02: twelve synthetic normal UI senders, three four-player flights, independent server reads.');
        stage='secondary-profiles';second=await primary.newProfile();manager=await primary.newProfile();
        stage='same-field-contexts';
        await login(primary,players[0]);await login(second,players[0]);
        stage='same-field-race';await normalClick(primary,players[0]);await normalClick(second,players[0],'strokes','minus');
        await until(async()=>{const d=(await ref(players[0]).get()).data();return d._sync.fields.strokes.revision===2;});
        await primary.waitFor("Boolean(app.state.scoreEntryV2.syncStatus&&['confirmed','conflict'].includes(app.state.scoreEntryV2.syncStatus.status))");
        await second.waitFor("Boolean(app.state.scoreEntryV2.syncStatus&&['confirmed','conflict'].includes(app.state.scoreEntryV2.syncStatus.status))");
        const a=await primary.evaluate("app.state.scoreEntryV2.syncStatus.status"),b=await second.evaluate("app.state.scoreEntryV2.syncStatus.status");
        assert.deepEqual([a,b].sort(),['confirmed','conflict']);
        const winner=a==='confirmed'?primary:second;
        // Admin uses the SAME revisioned Callable, never an unversioned DB update.
        stage='revisioned-admin';assert.equal(await manager.evaluate(`(async()=>{const r=await app.logic.callFunction('verifyPlayerPin',{spielerId:'sync-admin',pin:${q(pin)}});await firebase.auth().signInWithCustomToken(r.customToken);return true;})()`),true);
        const before=readDocumentState(await ref(players[0]).get()),c={ownerUid:'sync-admin',playerId:'sync-admin',spieltagId:round,flightId:flight(players[0])};
        const wire={...c,mode:'selectedFlight',requestId:crypto.randomUUID(),operations:[{...c,spielerId:players[0],hole:1,documentId:ref(players[0]).id,field:'strokes',operation:'set',value:9,baseFieldRevision:2,baseDocumentGeneration:before.generation,changeId:crypto.randomUUID()}]};
        assert.equal(await manager.evaluate(`app.logic.callFunction('saveScoreOperationsV2',${q(wire)}).then(r=>r.results[0].status==='acknowledged')`),true);
        stage='stale-after-admin';await normalClick(winner,players[0]);await winner.waitFor("app.state.scoreEntryV2.syncStatus?.status==='conflict'");
        assert.equal((await ref(players[0]).get()).data().strokes,9,'stale UI cannot undo newer Admin correction');
        stage='independent-field';await normalClick(winner,players[0],'puts');
        await until(async()=> (await ref(players[0]).get()).data().puts===3);
        assert.equal((await ref(players[0]).get()).data().strokes,9,'independent field retains correction');
        // Old V1/direct Admin/legacy writers cannot bypass the one contract.
        assert.equal(await manager.evaluate(`(async()=>{let denied=0;for(const collection of ['scorecards','scores'])for(const action of ['set','update','delete']){const r=app.db.collection(collection).doc(${q(ref(players[0]).id)});try{if(action==='delete')await r.delete();else await r[action]({strokes:1});}catch(e){if(e.code==='permission-denied')denied++;}}const r=await app.logic.apiRequest('saveLiveScores',{requestId:'legacy'});return denied===6&&r.success===false;})()`),true);
        assert.equal((await ref(players[0]).get()).data().strokes,9);
        // Explicit field discard after an authoritative comparison, never rebase.
        stage='explicit-discard';await winner.evaluate("app.logic.showConfirm=(a,b,c,yes)=>yes();app.logic.scoreScreenRefreshSyncV2().then(()=>true)");
        await winner.evaluate(`app.logic.scoreScreenDiscardSyncFieldV2(${q(players[0])},'strokes').then(()=>true)`);await settled(winner);
        assert.equal((await ref(players[0]).get()).data().strokes,9);
        console.log('PASS S03: separate browser storage profiles conflict; revisioned Admin correction survives stale writers, direct writes denied, explicit discard.');
        // Real commit then lost response for a NEW generation, offline reload,
        // reconnect and automatic receipt replay of the immutable request.
        stage='lost-ack-login';await login(primary,players[11]);
        await primary.evaluate(`(async()=>{const original=app.scoreSyncV2CallableTransport;window.syncLost=false;app.scoreSyncV2CallableTransport=async request=>{const result=await original(request);if(!syncLost){syncLost=true;Object.defineProperty(navigator,'onLine',{get:()=>false,configurable:true});throw new Error('synthetic response lost');}return result;};app.logic.stopScoreAutoSyncV2();app.state.scoreEntryV2.needsReload=true;app.router.navigate('score_eingabe',{id:${q(round)},hole:2});return true;})()`);
        await primary.waitFor(`Boolean(document.getElementById('lie-avatar-'+${q(players[11])})&&app.state.scoreScreenContext?.hole===2)`);
        await primary.evaluate(`document.getElementById('lie-avatar-'+${q(players[11])}).click();true`);
        stage='lost-ack-commit';await primary.waitFor("window.syncLost===true&&app.state.scoreEntryV2.syncStatus?.status==='error'");
        const committed=(await ref(players[11],2).get()).data();assert.equal(committed.strokes,4);const generation=committed._sync.generation;
        await primary.command('Page.enable',{});
        const injection=await primary.command('Page.addScriptToEvaluateOnNewDocument',{source:"Object.defineProperty(navigator,'onLine',{get:()=>false,configurable:true});window.__syncDiagnostic=[];window.addEventListener('error',e=>window.__syncDiagnostic.push(e.error?.name || 'ScriptError'));"});
        await primary.command('Network.setBlockedURLs',{urls:['http://127.0.0.1:'+process.env.LIE_FUNCTIONS_PORT+'/*','http://127.0.0.1:'+process.env.LIE_FIRESTORE_PORT+'/*']});
        stage='offline-reload';await primary.reload();await primary.waitFor("Boolean(window.app&&app.state.scoreEntryV2?.status==='ready')");
        assert.equal(await primary.evaluate("Object.values(app.state.scoreEntryV2.entries).some(e=>e.pendingOperations.length>0)"),true,'unknown committed request remains durable offline');
        await primary.evaluate(`app.router.navigate('score_eingabe',{id:${q(round)},hole:2});true`);
        await normalClick(primary,players[11],'puts');
        await primary.waitFor(`app.state.scoreEntryV2.entries[${q(players[11]+'_2')}].displayed.puts===3`);
        await primary.command('Network.setBlockedURLs',{urls:[]});await primary.command('Page.removeScriptToEvaluateOnNewDocument',{identifier:injection.identifier});
        await primary.evaluate("Object.defineProperty(navigator,'onLine',{get:()=>true,configurable:true});window.dispatchEvent(new Event('online'));true");
        stage='receipt-replay';await settled(primary);const replayed=(await ref(players[11],2).get()).data();assert.equal(replayed._sync.generation,generation);assert.equal(replayed._sync.fields.strokes.revision,1);assert.equal(replayed._sync.fields.puts.revision,2);assert.equal(replayed.puts,3);
        stage='logout-pending-owner-isolation';
        await primary.evaluate(`Object.defineProperty(navigator,'onLine',{get:()=>false,configurable:true});app.router.navigate('score_eingabe',{id:${q(round)},hole:3});true`);
        await normalClick(primary,players[11]);await primary.waitFor(`app.state.scoreEntryV2.entries[${q(players[11]+'_3')}].pendingOperations.length>0`);
        await primary.evaluate("app.logic.showConfirm=(a,b,c,yes)=>yes();app.logic.logout();true");await primary.waitFor("firebase.auth().currentUser===null&&app.state.currentView==='login'");
        await primary.evaluate("Object.defineProperty(navigator,'onLine',{get:()=>true,configurable:true});true");
        await login(primary,players[1]);assert.equal((await ref(players[11],3).get()).exists,false,'another owner never sends old owners queue');
        await login(primary,players[11]);await until(async()=>{const snap=await ref(players[11],3).get();return snap.exists&&snap.data().strokes===5;});await settled(primary);
        fs.writeFileSync(path.join(__dirname,'../.local-runtime/s02-s03-proof.json'),JSON.stringify({projectId:guard.PROJECT,syntheticPlayers:12,flights:3,normalUiAutomatic:true,independentServerRead:true,separateBrowserProfiles:true,sameFieldConflict:true,independentField:true,revisionedAdmin:true,directAdminAndLegacyDenied:true,explicitDiscard:true,commitLostReplyOfflineReloadReplay:true,newOfflineInput:true,logoutOwnerQueueIsolation:true,frozenMetadata:true},null,2));
        console.log('PASS S02/S03: real commit/lost reply, offline reload, automatic receipt replay once, generation preserved.');
    }
    catch(error){
        const diagnostic=await primary.evaluate("({online:navigator.onLine,auth:!!window.firebase?.auth().currentUser,view:window.app?.state.currentView,entry:window.app?.state.scoreEntryV2?.status,errorName:window.app?.state.scoreEntryV2?.error?.name,errorCode:window.app?.state.scoreEntryV2?.error?.code,scriptErrors:window.__syncDiagnostic || []})").catch(()=>({unavailable:true}));
        console.error('S02/S03 failed at '+stage+' ('+error.name+'); safe state '+JSON.stringify(diagnostic)+'; stack only: '+String(error.stack).split('\n').slice(1,5).join(' | '));throw new Error('S02/S03 local scenario failed.');}
    finally{if(second)await second.close();if(manager)await manager.close();await instance.delete();}
}
module.exports={run};
