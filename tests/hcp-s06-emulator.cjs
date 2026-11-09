'use strict';
const assert=require('node:assert/strict');const crypto=require('node:crypto');const fs=require('node:fs');const path=require('node:path');
const guard=require('../functions/local-guard');
async function run({evaluate,waitFor})
{
    const admin=require('../functions/node_modules/firebase-admin');const instance=admin.initializeApp({...guard.validate(process.env),credential:guard.credential(admin)},'s06-hcp-evidence');
    const db=instance.firestore(),q=JSON.stringify,players=Array.from({length:12},(_,i)=>'GH'+String(i+1).padStart(2,'0'));
    const pin=String(crypto.randomInt(100000,1000000)),salt=crypto.randomBytes(16).toString('hex'),encoded=['scrypt',salt,crypto.scryptSync(pin,salt,32).toString('hex')].join('$');
    let stage='seed';const proofs=[];
    async function until(fn){for(let i=0;i<200;i++){const value=await fn();if(value)return value;await new Promise(r=>setTimeout(r,100));}throw new Error('S06 local server observation timed out');}
    async function login(id){assert.equal(await evaluate(`(async()=>{await firebase.auth().signOut();app.state.currentUser=null;const r=await app.logic.callFunction('verifyPlayerPin',{spielerId:${q(id)},pin:${q(pin)}});await firebase.auth().signInWithCustomToken(r.customToken);await app.logic.refreshGlobalAppData();app.state.currentUser={...app.state.spieler.find(p=>p.id===${q(id)}),mustChangePin:false};return true;})()`),true);}
    try
    {
        const batch=db.batch();
        for(const id of players){const data={id,name:'Synthetic '+id,nickname:id,role:id===players[0]?'Admin':'Spieler',hcpLIE:54};batch.set(db.collection('spieler').doc(id),{...data,pinHash:encoded,mustChangePin:false});batch.set(db.collection('spieler_public').doc(id),data);}
        batch.set(db.collection('kurse').doc('HCP-K'),{id:'HCP-K',name:'Synthetic HCP course',bahnAnzahl:18});
        for(let nr=1;nr<=18;nr++)batch.set(db.collection('bahnen').doc('HCP-H'+nr),{id:'HCP-H'+nr,kursId:'HCP-K',nr,par:4,si:nr});
        batch.set(db.collection('config').doc('saison'),{saisonStartDatum:'2026-01-01',seasonStartHcpByPlayer:{[players[0]]:0}},{merge:true});await batch.commit();
        for(const type of ['9-Front','9-Back','18'])
        {
            stage='normal-round-create-'+type;await login(players[0]);
            assert.equal(await evaluate(`(async()=>{app.router.navigate('spieltag_neu');document.getElementById('new-spieltag-kurs').value='HCP-K';document.getElementById('new-spieltag-date').value='2026-03-07';document.getElementById('new-spieltag-rundentyp').value=${q(type)};const ids=${q(players)};document.querySelectorAll('input[name="teilnehmer"]').forEach(cb=>{cb.checked=ids.includes(cb.value);});app.state.tempZufallsFlights=[ids.slice(0,4),ids.slice(4,8),ids.slice(8,12)];app.state.tempKalenderId=null;app.logic.saveZufallsFlights();return document.querySelectorAll('input[name="teilnehmer"]:checked').length===12;})()`),true,'actual normal creation handler called');
            const round=await until(async()=>{const s=await db.collection('spieltage').where('kursId','==','HCP-K').get();return s.docs.length===1?{id:s.docs[0].id,...s.docs[0].data()}:null;});
            assert.equal(round.hcpSnapshotVersion,1);assert.equal(round.rundenTyp,type);assert.equal(round.hcpStart[players[0]],0);assert.equal(round.hcpStart[players[1]],26);
            assert.equal(Object.values(round.holeAllowances[players[1]]).reduce((a,b)=>a+b,0),type==='18'?26:13);
            assert.ok(round._roundStart.fingerprint);assert.equal(round.hcpHoleData.length,type==='18'?18:9);
            await waitFor(`app.state.spieltage.some(r=>r.id===${q(round.id)}&&r.hcpSnapshotVersion===1)`);
            stage='immutable-snapshots-'+type;
            assert.equal(await evaluate(`(async()=>{let denied=0;for(const update of [{hcpStart:{}},{holeAllowances:{}},{hcpHoleData:[]},{status:'Beendet'}])try{await app.db.collection('spieltage').doc(${q(round.id)}).update(update);}catch(e){if(e.code==='permission-denied')denied++;}try{await app.db.collection('flights').doc(${q('FL-'+round.id+'-1')}).update({spielerIdsCsv:'GH02'});}catch(e){if(e.code==='permission-denied')denied++;}return denied===5;})()`),true);
            const hole=type==='9-Back'?10:1;stage='normal-v2-new-card-'+type;
            await evaluate(`app.router.navigate('score_eingabe',{id:${q(round.id)},hole:${hole}});true`);
            await waitFor("Boolean(app.state.scoreEntryV2?.status==='ready'&&document.getElementById('lie-strokes-plus-GH01'))");
            await evaluate("document.getElementById('lie-strokes-plus-GH01').click();true");
            await evaluate("document.getElementById('lie-strokes-plus-GH02').click();true");
            await evaluate("document.getElementById('lie-strich-GH03').click();true");
            const card=await until(async()=>{const s=await db.collection('scorecards').doc('SC-'+round.id+'-GH02-'+hole).get();return s.exists?s.data():null;});
            assert.equal(card.hcpStart,26);assert.equal(card.strokesGiven,round.holeAllowances.GH02[hole]);assert.equal(card.strokes,5);
            await waitFor("app.state.scoreEntryV2.syncStatus?.status==='confirmed'&&Object.values(app.state.scoreEntryV2.entries).every(e=>!e.pendingOperations.length)");
            const zero=(await db.collection('scorecards').doc('SC-'+round.id+'-GH01-'+hole).get()).data();assert.equal(zero.hcpStart,0);assert.equal(zero.strokesGiven,0);
            assert.equal(await evaluate("LieHcpRules.progress(26,16,9)===26.2&&LieHcpRules.normalizeHcp(26.05)===26.1&&document.querySelector('.lie-hcp-preview').textContent.includes('keine HCP-Fortschreibung')"),true);
            const strich=(await db.collection('scorecards').doc('SC-'+round.id+'-GH03-'+hole).get()).data();assert.equal(strich.maxscore,true);
            assert.equal(await evaluate(`LieHcpRules.evaluate(app.state.scoreEntryV2.response.round,app.state.scoreEntryV2.response.round.holeData,26,[{hole:${hole},strokes:1,maxscore:true}],app.state.scoreEntryV2.response.round.holeAllowances.GH03).totalNetto`),0);
            assert.equal(await evaluate(`app.logic.apiRequest('closeSpieltagServer',{spieltagId:${q(round.id)}}).then(r=>r.success===false)`),true);
            assert.equal(await evaluate("app.logic.recalculateSeasonFromStart().then(()=>false,()=>true)"),true);
            proofs.push({type,participants:12,startZero:true,seasonBaseline:true,normalCreation:true,normalV2:true,immutable:true,playedHoles:round.hcpHoleData.length});
            console.log('PASS S06 normal '+type+' creation: twelve authoritative snapshots, zero preserved, immutable, actual V2 new cards.');
            // Independent setup cases: clean ONLY these synthetic local fixtures.
            // This is not a round close or a chronological three-round E2E claim.
            await evaluate("app.logic.stopScoreAutoSyncV2();firebase.auth().signOut().then(()=>true)");
            const cleanup=db.batch();for(const collection of ['scorecards','flights']){const docs=await db.collection(collection).where('spieltagId','==',round.id).get();docs.forEach(d=>cleanup.delete(d.ref));}cleanup.delete(db.collection('spieltage').doc(round.id));await cleanup.commit();
        }
        fs.writeFileSync(path.join(__dirname,'../.local-runtime/s06-hcp-proof.json'),JSON.stringify({projectId:guard.PROJECT,independentCreationCases:proofs,chronologicalCloseExecuted:false,historyWritesEnabled:false},null,2));
    }
    catch(error){console.error('S06 failed at '+stage+' ('+error.name+'); stack only '+String(error.stack).split('\n').slice(1,4).join(' | '));throw new Error('S06 local integration failed.');}
    finally{await instance.delete();}
}
module.exports={run};
