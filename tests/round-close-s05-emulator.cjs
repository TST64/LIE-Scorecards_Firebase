'use strict';
const assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs'),path=require('node:path');
const guard=require('../functions/local-guard'),golden=require('./fixtures/hcp-s06-golden.json');
async function run(primary){
    const admin=require('../functions/node_modules/firebase-admin'),instance=admin.initializeApp({...guard.validate(process.env),credential:guard.credential(admin)},'s05-closure-evidence'),db=instance.firestore();
    const q=JSON.stringify,players=golden.players.map(p=>p.id),captains=['MS01','MS05','MS09'],clients=[primary],proof=[];
    const pin=String(crypto.randomInt(100000,1000000)),salt=crypto.randomBytes(16).toString('hex'),encoded=['scrypt',salt,crypto.scryptSync(pin,salt,32).toString('hex')].join('$');
    let stage='seed',shadow;
    async function until(fn){for(let i=0;i<400;i++){const r=await fn();if(r)return r;await new Promise(r=>setTimeout(r,100));}throw new Error('S05 independent observation timeout');}
    async function login(c,id){assert.equal(await c.evaluate(`(async()=>{app.logic.stopScoreAutoSyncV2();await firebase.auth().signOut();app.state.currentUser=null;const r=await app.logic.callFunction('verifyPlayerPin',{spielerId:${q(id)},pin:${q(pin)}});await firebase.auth().signInWithCustomToken(r.customToken);await app.logic.refreshGlobalAppData();app.state.currentUser={...app.state.spieler.find(p=>p.id===${q(id)}),mustChangePin:false};return true;})()`),true);}
    async function open(c,roundId,hole){await c.evaluate(`app.router.navigate('score_eingabe',{id:${q(roundId)},hole:${hole}});true`);await c.waitFor(`Boolean(app.state.scoreEntryV2?.status==='ready'&&app.state.scoreScreenContext?.hole===${hole}&&document.getElementById('lie-avatar-'+app.state.scoreScreenContext.players[0]))`);}
    async function settled(c){await c.waitFor("app.state.scoreEntryV2.syncStatus?.status==='confirmed'&&Object.values(app.state.scoreEntryV2.entries).every(e=>!e.pendingOperations.length)");}
    async function observed(c,action,id){return c.evaluate(`(async()=>{try{return await app.logic.callFunction('roundClosureV1',${q({action,spieltagId:id})});}catch(_){return false;}})()`);}
    try{
        const seed=db.batch();for(const id of players){const data={id,name:'Synthetic '+id,nickname:id,role:id==='MS01'?'Admin':id==='MS05'?'Spielleiter':'Spieler',hcpLIE:54};seed.set(db.collection('spieler').doc(id),{...data,pinHash:encoded,mustChangePin:false});seed.set(db.collection('spieler_public').doc(id),data);}
        seed.set(db.collection('kurse').doc('S05-K'),{id:'S05-K',name:'Synthetic S05 course',bahnAnzahl:18});for(let nr=1;nr<=18;nr++)seed.set(db.collection('bahnen').doc('S05-H'+nr),{id:'S05-H'+nr,kursId:'S05-K',nr,par:4,si:nr});
        seed.set(db.collection('config').doc('saison'),{saisonStartDatum:'2026-01-01',seasonStartHcpByPlayer:{}},{merge:true});await seed.commit();
        if(primary.onRehearsalSeed)await primary.onRehearsalSeed({db,pin,players});
        clients.push(...(primary.rehearsalActors?[primary.rehearsalActors[4],primary.rehearsalActors[8]]:[await primary.newProfile(),await primary.newProfile()]));shadow=await primary.newProfile();
        for(let i=0;i<3;i++)await login(clients[i],captains[i]);
        for(const [index,type] of ['9-Front','9-Back','18'].entries()){
            stage='normal-create-'+type;
            await primary.evaluate(`(async()=>{await app.logic.refreshGlobalAppData();app.router.navigate('spieltag_neu');document.getElementById('new-spieltag-kurs').value='S05-K';document.getElementById('new-spieltag-date').value=${q(['2026-01-03','2026-01-10','2026-01-17'][index])};document.getElementById('new-spieltag-rundentyp').value=${q(type)};const ids=${q(players)};document.querySelectorAll('input[name="teilnehmer"]').forEach(cb=>cb.checked=ids.includes(cb.value));app.state.tempZufallsFlights=[ids.slice(0,4),ids.slice(4,8),ids.slice(8,12)];app.state.tempKalenderId=null;app.logic.saveZufallsFlights();return true;})()`);
            const round=await until(async()=>{const s=await db.collection('spieltage').where('kursId','==','S05-K').get();const d=s.docs.find(d=>d.data().rundenTyp===type);return d?{...d.data(),id:d.id}:null;});
            for(const p of golden.players)assert.equal(round.hcpStart[p.id],index===0?26:p.ends[index-1],p.id+' authoritative next start');
            assert.equal(round.hcpSnapshotVersion,1);
            const holes=Array.from({length:index===2?18:9},(_,j)=>j+(type==='9-Back'?10:1));
            for(const c of clients){await c.evaluate('app.logic.refreshGlobalAppData().then(()=>true)');await open(c,round.id,holes[0]);}
            if(index===0){
                // Establish one real generation first. The secondary device then
                // has a stale FIELD revision, not an unrelated birth lifecycle.
                await primary.evaluate("document.getElementById('lie-strokes-minus-MS02').click();true");
                await primary.waitFor('app.state.scoreEntryV2.entries.MS02_1.displayed.strokes===3');await settled(primary);
                stage='secondary-offline-pending';await login(shadow,'MS02');await open(shadow,round.id,1);
                await shadow.evaluate("Object.defineProperty(navigator,'onLine',{get:()=>false,configurable:true});document.getElementById('lie-strokes-plus-MS02').click();true");
                await shadow.waitFor("app.state.scoreEntryV2.entries.MS02_1.pendingOperations.length>0");
                assert.equal(await shadow.evaluate(`app.logic.assertRoundCloseLocalReady(${q(round.id)}).then(()=>false,()=>true)`),true);
            }
            if(primary.onRehearsalRound)await primary.onRehearsalRound({round,index,holes,golden});
            stage='432-normal-ui-cards-'+type;
            // Actual visible controls and actual automatic sender, no direct score
            // writes and no adapter.sync/flush as a substitute for integration.
            for(const [j,hole] of holes.entries()){
                await Promise.all(clients.map(async(c,f)=>{
                    await open(c,round.id,hole);
                    const targets=golden.players.slice(f*4,f*4+4).map(p=>({id:p.id,strokes:4+Math.floor(p.rawAllowances[index]/holes.length)+(j<p.rawAllowances[index]%holes.length?1:0)+2-Math.min(4,Math.max(0,p.netto[index]-4*j))}));
                    const holdLast=!primary.rehearsalActors&&index===0&&j===holes.length-1&&f===2;
                    await c.evaluate(`(async()=>{for(const p of ${q(targets)}){if(${holdLast}&&p.id==='MS12')Object.defineProperty(navigator,'onLine',{get:()=>false,configurable:true});const value=()=>app.state.scoreEntryV2.entries[p.id+'_'+${hole}].displayed.strokes;for(let n=0;n<20;n++){const before=value();if(before===p.strokes)break;const button=before===undefined&&p.strokes===4?'lie-avatar-'+p.id:'lie-strokes-'+((before??4)<p.strokes?'plus':'minus')+'-'+p.id;document.getElementById(button).click();await app.scoreEntryV2Controller.settleActions();for(let wait=0;wait<200&&value()===before;wait++)await new Promise(r=>setTimeout(r,10));if(value()===before)throw new Error('Normal input not accepted');}if(value()!==p.strokes)throw new Error('Normal input mismatch');}return true;})()`);
                    if(holdLast){
                        assert.equal(await c.evaluate(`app.logic.assertRoundCloseLocalReady(${q(round.id)}).then(()=>false,()=>true)`),true);
                        const partial=await observed(primary,'inspect',round.id);assert.equal(partial.complete,false);
                        assert.equal(await primary.evaluate(`app.logic.callFunction('roundClosureV1',${q({action:'begin',spieltagId:round.id,closeId:'missing-last',expectedRevision:partial.scoreRevision,expectedDigest:partial.scoreDigest})}).then(()=>false,()=>true)`),true);
                        await c.evaluate("Object.defineProperty(navigator,'onLine',{get:()=>true,configurable:true});window.dispatchEvent(new Event('online'));true");
                    }
                    await settled(c);
                }));
            }
            const cards=await db.collection('scorecards').where('spieltagId','==',round.id).get();assert.equal(cards.size,holes.length*12);
            for(const d of cards.docs){const c=d.data();assert.equal(c.hcpStart,round.hcpStart[c.spielerId]);assert.equal(c.strokesGiven,round.holeAllowances[c.spielerId][c.hole]);assert.ok(c._sync.generation.startsWith('gen:'));}
            if(index===0){
                stage='secondary-conflict-blocks-release';await shadow.evaluate("Object.defineProperty(navigator,'onLine',{get:()=>true,configurable:true});window.dispatchEvent(new Event('online'));true");
                await shadow.waitFor("app.state.scoreEntryV2.syncStatus?.status==='conflict'");
                assert.equal(await shadow.evaluate(`app.logic.assertRoundCloseLocalReady(${q(round.id)}).then(()=>false,()=>true)`),true);
                await shadow.evaluate("app.logic.showConfirm=(a,b,c,yes)=>yes();app.logic.scoreScreenRefreshSyncV2().then(()=>true)");
                // Only strokes is conflicted. Wait for that asynchronous UI
                // decision/refresh before touching the controller again.
                await shadow.evaluate("app.logic.scoreScreenDiscardSyncFieldV2('MS02','strokes').then(()=>true)");
                await settled(shadow);
            }
            if(primary.onRehearsalReview)await primary.onRehearsalReview({round,index,clients,shadow});
            stage='stale-cache-and-freeze-'+type;
            const view=await observed(primary,'inspect',round.id);assert.equal(view.complete,true);
            const closeId='S05-'+type,wire={spieltagId:round.id,closeId,expectedRevision:view.scoreRevision,expectedDigest:view.scoreDigest};
            assert.equal(await primary.evaluate(`app.logic.callFunction('roundClosureV1',${q({...wire,action:'begin',expectedRevision:view.scoreRevision-1})}).then(()=>false,()=>true)`),true);
            await primary.evaluate(`app.logic.openRoundClose(${q(round.id)}).then(()=>true)`);
            assert.equal(await primary.evaluate("app.state.currentView==='round_close'&&!!document.getElementById('close-begin')"),true);
            assert.equal((await primary.evaluate(`app.logic.roundCloseAction('begin',${q(round.id)})`)).closure.phase,'collecting');
            if(index===0&&primary.onClosingWindow)await primary.onClosingWindow({db,roundId:round.id,clients,shadow});
            if(index===0){
                // A stale real UI writer still holds an old active context. The
                // server freeze must reject it, and the local queue must survive.
                stage='frozen-real-ui-writer';const c=clients[2];
                await c.evaluate("document.getElementById('lie-puts-plus-MS12').click();true");
                await c.waitFor("app.state.scoreEntryV2.syncStatus?.status==='conflict'");
                assert.equal((await db.collection('scorecards').doc('SC-'+round.id+'-MS12-'+holes.at(-1)).get()).data().puts,2);
                assert.equal(await c.evaluate(`app.logic.assertRoundCloseLocalReady(${q(round.id)}).then(()=>false,()=>true)`),true);
                assert.equal(await primary.evaluate(`app.logic.roundCloseAction('cancel',${q(round.id)}).then(r=>r.closure.phase==='cancelled')`),true);
                await c.evaluate("app.logic.showConfirm=(a,b,c,yes)=>yes();app.logic.scoreScreenRefreshSyncV2().then(()=>true)");
                await c.evaluate("app.logic.scoreScreenDiscardSyncFieldV2('MS12','puts').then(()=>true)");await settled(c);
                assert.equal((await primary.evaluate(`app.logic.roundCloseAction('begin',${q(round.id)})`)).closure.phase,'collecting');
            }
            const frozen=(await db.collection('spieltage').doc(round.id).get()).data(),basis={...wire,closeId:frozen.closure.id};
            assert.equal(await primary.evaluate(`app.logic.callFunction('roundClosureV1',${q({...basis,action:'commit'})}).then(()=>false,()=>true)`),true,'no flight releases');
            // Each real flight captain explicitly attests after local durable checks.
            for(let f=0;f<3;f++){
                const c=clients[f],flightId='FL-'+round.id+'-'+(f+1);await c.evaluate(`app.logic.openRoundClose(${q(round.id)}).then(()=>true)`);
                assert.equal(await c.evaluate(`(async()=>{document.getElementById(${q('close-review-'+flightId)}).checked=true;return !!await app.logic.roundCloseAction('release',${q(round.id)},${q(flightId)});})()`),true);
            }
            stage='transaction-fault-'+type;
            const before=(await db.collection('spieler').doc('MS01').get()).data().hcpLIE;
            const faultDb={collection:db.collection.bind(db),runTransaction:work=>db.runTransaction(tx=>work({get:tx.get.bind(tx),set(ref,...args){tx.set(ref,...args);if(ref.path==='spieler/MS01')throw new Error('synthetic-staged-publication-failure');}}))};
            await assert.rejects(require('../functions/round-close').createRoundClosure(faultDb)({uid:'MS01',token:{playerId:'MS01',role:'Admin',mustChangePin:false}},{...basis,action:'commit'}));
            assert.equal((await db.collection('spieltage').doc(round.id).get()).data().status,'Aktiv');assert.equal((await db.collection('spieler').doc('MS01').get()).data().hcpLIE,before);
            stage='lost-ack-parallel-close-'+type;
            await primary.evaluate(`(async()=>{await app.logic.openRoundClose(${q(round.id)});window.s05Original=app.logic.callFunction;window.s05Lost=false;app.logic.callFunction=async(name,data)=>{const result=await window.s05Original(name,data);if(name==='roundClosureV1'&&data.action==='commit'&&!window.s05Lost){window.s05Lost=true;throw new Error('synthetic closure response lost');}return result;};return true;})()`);
            const replies=await Promise.all([primary.evaluate(`app.logic.roundCloseAction('commit',${q(round.id)})`),clients[1].evaluate(`app.logic.callFunction('roundClosureV1',${q({...basis,action:'commit'})})`)]);
            assert.equal(replies[0],false);assert.equal(replies[1].status,'Beendet');assert.equal(await primary.evaluate('window.s05Lost'),true);
            await primary.evaluate('app.logic.callFunction=window.s05Original;true');
            const retry=await primary.evaluate(`app.logic.callFunction('roundClosureV1',${q({...basis,action:'commit'})})`);assert.deepEqual(retry,replies[1]);
            const closed=(await db.collection('spieltage').doc(round.id).get()).data();assert.equal(closed.status,'Beendet');assert.equal(closed._roundClose.closeId,basis.closeId);
            for(const p of golden.players){assert.equal(closed.hcpEnd[p.id],p.ends[index]);const a=(await db.collection('spieler').doc(p.id).get()).data(),b=(await db.collection('spieler_public').doc(p.id).get()).data();assert.equal(a.hcpLIE,p.ends[index]);assert.equal(b.hcpLIE,p.ends[index]);assert.deepEqual(a.hcpClosure,b.hcpClosure);}
            assert.equal(closed._roundClose.brutto.status,'not-rated');
            assert.deepEqual(closed._roundClose.nettoWinners.slice().sort(),index===1?players.slice().sort():['MS09']);
            for(const p of golden.players)assert.equal(closed._roundClose.results.find(r=>r.playerId===p.id).totalNetto,p.netto[index]);
            assert.equal(await primary.evaluate(`(async()=>{await app.logic.refreshGlobalAppData();await app.logic.openRoundClose(${q(round.id)});return app.state.currentView==='round_close'&&app.state.roundCloseView.status==='Beendet'&&app.views.leaderboard(${q(round.id)},'netto').includes('Serverbestätigter Netto-Abschluss')&&app.state.currentUser.hcpLIE===${golden.players[0].ends[index]};})()`),true);
            assert.equal(await primary.evaluate(`(async()=>{let denied=0;for(const collection of ['spieler','spieler_public']){try{await app.db.collection(collection).doc('MS02').update({hcpLIE:0});}catch(e){if(e.code==='permission-denied')denied++;}try{await app.db.collection(collection).doc('MS02').delete();}catch(e){if(e.code==='permission-denied')denied++;}}try{await app.db.collection('spieltage').doc(${q(round.id)}).update({closure:{phase:'cancelled'}});}catch(e){if(e.code==='permission-denied')denied++;}return denied===5;})()`),true);
            assert.equal(await primary.evaluate("app.logic.recalculateSeasonFromStart().then(()=>false,()=>true)"),true);
            proof.push({type,roundId:round.id,cards:cards.size,hcpEnd:closed.hcpEnd,closureId:basis.closeId,manualFlightReleases:3,transactionFaultAtomic:true,parallelCommit:true,lostReplyReplay:true});
            console.log('PASS S05 '+type+': '+cards.size+' normal UI cards, three identity-bound releases, atomic HCPs, parallel/lost-ACK retry.');
        }
        fs.writeFileSync(path.join(__dirname,'../.local-runtime/s05-close-proof.json'),JSON.stringify({projectId:guard.PROJECT,syntheticPlayers:12,flights:3,serverConfirmedCards:proof.reduce((n,r)=>n+r.cards,0),chronologicalRounds:proof,historyWritesEnabled:false,releaseGo:false},null,2));
    }catch(error){
        const states=await Promise.all(clients.map(c=>c.evaluate("({owner:app.state.currentUser?.id,view:app.state.currentView,entry:app.state.scoreEntryV2?.status,errorCode:app.state.scoreEntryV2?.error?.code,errorName:app.state.scoreEntryV2?.error?.name,localLock:app.state.roundCloseLocalBusy})").catch(()=>({unavailable:true}))));
        console.error('S05 failed at '+stage+' ('+error.name+'); safe state '+JSON.stringify(states)+'; stack only '+String(error.stack).split('\n').slice(1,4).join(' | '));throw new Error('S05 demo scenario failed');}
    finally{for(const c of clients.slice(1))await c.close();if(shadow)await shadow.close();await instance.delete();}
}
module.exports={run};
