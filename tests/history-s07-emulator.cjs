'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const guard=require('../functions/local-guard'),golden=require('./fixtures/hcp-s06-golden.json');
async function run(primary){
    const admin=require('../functions/node_modules/firebase-admin'),instance=admin.initializeApp({...guard.validate(process.env),credential:guard.credential(admin)},'s07-history-evidence'),db=instance.firestore();
    const q=JSON.stringify,proof=JSON.parse(fs.readFileSync(path.join(__dirname,'../.local-runtime/s05-close-proof.json'),'utf8')),ids=proof.chronologicalRounds.map(r=>r.roundId),front=ids[0],players=golden.players.map(p=>p.id),targetId='SC-'+front+'-MS02-6';let stage='S05-source',reader;
    const rounds=[],raw=[];for(const id of ids){rounds.push((await db.collection('spieltage').doc(id).get()).data());raw.push(...(await db.collection('scorecards').where('spieltagId','==',id).get()).docs.map(d=>d.data()));}
    const auth={uid:'MS01',token:{playerId:'MS01',role:'Admin',mustChangePin:false}};
    async function until(fn){for(let i=0;i<300;i++){const r=await fn();if(r)return r;await new Promise(r=>setTimeout(r,100));}throw new Error('S07 independent read timed out');}
    async function serverOld(){assert.equal((await db.collection('scorecards').doc(targetId).get()).data().strokes,7);for(const name of ['spieler','spieler_public'])assert.equal((await db.collection(name).doc('MS02').get()).data().hcpLIE,24);for(const id of ids)assert.equal((await db.collection('spieltage').doc(id).get()).data()._roundClose.revision,1);}
    try{
        assert.equal(raw.length,432);await serverOld();stage='normal-admin-preview';
        assert.equal(await primary.evaluate(`app.logic.openHistoryCorrectionV1(${q(front)}).then(()=>app.state.currentView==='history_correction')`),true);
        await primary.evaluate(`document.getElementById('history-player').value='MS02';document.getElementById('history-hole').value='6';document.getElementById('history-value').value='3';document.getElementById('history-preview').click();true`);
        await primary.waitFor('Boolean(app.state.historyCorrectionView.preview)');
        const preview=await primary.evaluate('app.state.historyCorrectionView.preview'),change=await primary.evaluate('app.state.historyCorrectionView.change');assert.equal(preview.writeCount,459);
        const independentPreview=await require('../functions/history-correction').createHistoryCorrection(db)(auth,{action:'preview',change});assert.equal(independentPreview.basisHash,preview.basisHash,'running Callable and fresh worker agree on exact approval binding');
        assert.equal(await primary.evaluate(`app.logic.callFunction('historyCorrectionV1',${q({action:'prepare',runId:'S07-ALTERED',change:{...change,value:4},expectedBasis:preview.basisHash})}).then(()=>false,()=>true)`),true,'approved preview cannot authorize a different correction');
        assert.deepEqual(preview.changes.map(r=>[r.hcpStart.MS02,r.hcpEnd.MS02,r.results.find(p=>p.playerId==='MS02').totalNetto]),[[26,23,24],[23,23.1,17],[23.1,23.1,36]]);await serverOld();
        stage='Admin-and-PIN-boundaries';reader=await primary.newProfile();const token=await instance.auth().createCustomToken('MS05');
        assert.equal(await reader.evaluate(`(async()=>{await firebase.auth().signInWithCustomToken(${q(token)});return app.logic.callFunction('historyCorrectionV1',${q({action:'preview',change})}).then(()=>false,()=>true);})()`),true,'actual Spielleiter must not correct history');
        stage='normal-prepare-and-first-400';assert.equal(await primary.evaluate("(async()=>{document.getElementById('history-review').checked=true;return (await app.logic.historyCorrectionActionV1('prepare')).phase==='staging';})()"),true);
        const runId=await primary.evaluate('app.state.historyCorrectionView.status.runId');
        assert.equal((await primary.evaluate("app.logic.historyCorrectionActionV1('stage')")).staged,400);await serverOld();
        if(primary.onStage400)await primary.onStage400({db,instance,runId,change,preview,reader,primary});
        assert.equal((await db.collection('historyCorrectionStages').where('planHash','==',preview.planHash||((await db.collection('historyCorrectionRuns').doc(runId).get()).data().planHash)).get()).size,400);
        const read=await primary.evaluate("app.logic.callFunction('readPublishedSeasonV1',{})");assert.equal(read.scorecards.find(c=>c.id===targetId).strokes,7);assert.equal(read.spieler.find(p=>p.id==='MS02').hcpLIE,24);assert.equal(read.publication.activeRun,runId);
        assert.equal(await primary.evaluate("app.db.collection('historyCorrectionStages').get().then(()=>false,e=>e.code==='permission-denied')"),true);
        const c={ownerUid:'MS01',playerId:'MS01',spieltagId:front,flightId:'FL-'+front+'-1'},stale={...c,requestId:crypto.randomUUID(),mode:'selectedFlight',operations:[{...c,...change,changeId:crypto.randomUUID(),spielerId:'MS02',hole:6}]};
        assert.equal(await primary.evaluate(`app.logic.callFunction('saveScoreOperationsV2',${q(stale)}).then(r=>r.results[0].reason==='history-correction-barrier')`),true);
        const next={spieltagObj:{id:'S07-NEXT-BLOCKED',date:'2026-01-24',kursId:'S05-K',rundenTyp:'9-Front',bahnAnzahl:9,status:'Aktiv',teilnehmerCsv:players.join(',')},flightsPayload:[0,1,2].map(i=>({id:'FL-S07-NEXT-BLOCKED-'+(i+1),spieltagId:'S07-NEXT-BLOCKED',spielerIdsCsv:players.slice(i*4,i*4+4).join(',')}))};
        assert.equal(await primary.evaluate(`app.logic.callFunction('createRoundStart',${q(next)}).then(()=>false,()=>true)`),true);
        assert.equal(await primary.evaluate(`app.logic.callFunction('historyCorrectionV1',${q({action:'prepare',runId:'COMPETING',change,expectedBasis:preview.basisHash})}).then(()=>false,()=>true)`),true);
        stage='second-batch-failure-59';let attempted=0;
        const faulty={collection:db.collection.bind(db),runTransaction:db.runTransaction.bind(db),batch(){return {set(){attempted++;},async commit(){if(primary.onActiveStage)await primary.onActiveStage({db,runId});throw new Error('synthetic second Firestore batch failure');}};}};
        await assert.rejects(require('../functions/history-correction').createHistoryCorrection(faulty)(auth,{action:'stage',runId}));if(primary.onStageFailure)await primary.onStageFailure({db,runId});assert.equal(attempted,59);await serverOld();
        assert.equal((await primary.evaluate(`app.logic.callFunction('historyCorrectionV1',${q({action:'status',runId})})`)).staged,400);
        stage='real-worker-crash-after-second-commit';
        const crashed=spawnSync(process.execPath,[path.join(__dirname,'history-s07-worker.cjs'),runId,'crash-after-batch'],{cwd:path.join(__dirname,'..'),env:process.env,encoding:'utf8',windowsHide:true,timeout:90000});assert.equal(crashed.status,73,'test worker exits after real stage commit before checkpoint');await serverOld();
        if(primary.onWorkerExit)await primary.onWorkerExit({db,pid:crashed.pid,exitCode:crashed.status});
        assert.equal((await primary.evaluate(`app.logic.callFunction('historyCorrectionV1',${q({action:'status',runId})})`)).staged,400);
        stage='fresh-worker-recovery';
        const recovered=spawnSync(process.execPath,[path.join(__dirname,'history-s07-worker.cjs'),runId],{cwd:path.join(__dirname,'..'),env:process.env,encoding:'utf8',windowsHide:true,timeout:90000});assert.equal(recovered.status,0);assert.match(recovered.stdout,/"staged":459/);await serverOld();
        await primary.reload();await primary.waitFor("Boolean(app.state.currentUser?.id==='MS01'&&app.logic.openHistoryCorrectionV1)");
        await primary.evaluate(`app.logic.openHistoryCorrectionV1(${q(front)}).then(()=>true)`);
        assert.equal((await primary.evaluate("app.logic.historyCorrectionActionV1('status')")).phase,'ready');
        stage='final-transaction-failure';
        const faultTx={collection:db.collection.bind(db),runTransaction:work=>db.runTransaction(tx=>work({get:tx.get.bind(tx),set(ref,...args){tx.set(ref,...args);if(ref.path==='spieltage/'+ids[1])throw new Error('synthetic final publication failure');}}))};
        await assert.rejects(require('../functions/history-correction').createHistoryCorrection(faultTx)(auth,{action:'publish',runId}));await serverOld();
        stage='real-publication-lost-ACK';
        await primary.evaluate("window.historyOriginal=app.logic.callFunction;window.historyLost=false;app.logic.callFunction=async(name,data)=>{const result=await window.historyOriginal(name,data);if(name==='historyCorrectionV1'&&data.action==='publish'&&!window.historyLost){window.historyLost=true;throw new Error('synthetic publication response lost');}return result;};document.getElementById('history-publish-review').checked=true;true");
        const [attempt,racingRead]=await Promise.all([primary.evaluate("app.logic.historyCorrectionActionV1('publish')"),reader.evaluate(`(async()=>{const r=await app.logic.callFunction('readPublishedSeasonV1',{});return [r.scorecards.find(c=>c.id===${q(targetId)}).strokes,r.spieler.find(p=>p.id==='MS02').hcpLIE,r.publication.revision];})()`)]);
        assert.equal(attempt,false);assert.ok(JSON.stringify(racingRead)==='[7,24,0]'||JSON.stringify(racingRead)==='[3,23.1,1]','concurrent reader sees a complete old or complete new publication');assert.equal(await primary.evaluate('window.historyLost'),true);
        assert.equal((await db.collection('scorecards').doc(targetId).get()).data().strokes,3);assert.equal((await db.collection('spieler').doc('MS02').get()).data().hcpLIE,23.1);
        await primary.evaluate('app.logic.callFunction=window.historyOriginal;true');const result=await primary.evaluate(`app.logic.callFunction('historyCorrectionV1',${q({action:'publish',runId})})`);assert.equal(result.revision,1);
        assert.deepEqual(await primary.evaluate(`app.logic.callFunction('historyCorrectionV1',${q({action:'publish',runId})})`),result);
        assert.equal((await primary.evaluate("app.logic.historyCorrectionActionV1('status')")).phase,'published');
        stage='independent-all-432-cards-and-chain';let unchanged=0;
        for(const old of raw){const current=(await db.collection('scorecards').doc(old.id).get()).data();for(const field of ['strokes','puts','lady','maxscore'])assert.deepEqual(current[field],old.id===targetId&&field==='strokes'?3:old[field]);if(old.id!==targetId)unchanged++;assert.equal(current._sync.generation,old._sync.generation);assert.equal(current._sync.fields.strokes.revision,old._sync.fields.strokes.revision+(old.id===targetId?1:0));assert.equal(current.historyPublication.runId,runId);}
        for(let i=0;i<3;i++){
            const round=(await db.collection('spieltage').doc(ids[i]).get()).data();assert.equal(round._roundClose.revision,2);assert.equal(round._roundClose.historyCorrection.runId,runId);assert.equal(round.historyPublication.runId,runId);
            assert.equal(round.hcpStart.MS02,[26,23,23.1][i]);assert.equal(round.hcpEnd.MS02,[23,23.1,23.1][i]);assert.equal(round._roundClose.results.find(r=>r.playerId==='MS02').totalNetto,[24,17,36][i]);
            for(const p of golden.players)if(p.id!=='MS02')assert.equal(round.hcpEnd[p.id],p.ends[i]);
        }
        for(const p of golden.players){const a=(await db.collection('spieler').doc(p.id).get()).data(),b=(await db.collection('spieler_public').doc(p.id).get()).data();assert.equal(a.hcpLIE,p.id==='MS02'?23.1:p.ends[2]);assert.equal(b.hcpLIE,a.hcpLIE);assert.deepEqual(a.hcpClosure,b.hcpClosure);assert.equal(a.hcpClosure.revision,2);}
        const oldClose={action:'commit',spieltagId:front,closeId:rounds[0]._roundClose.closeId,expectedRevision:rounds[0]._roundClose.scoreRevision,expectedDigest:rounds[0]._roundClose.scoreDigest};
        assert.equal(await primary.evaluate(`app.logic.callFunction('roundClosureV1',${q(oldClose)}).then(r=>r.hcpEnd.MS02===23&&r.supersededReceipt===true)`),true);
        stale.requestId=crypto.randomUUID();stale.operations[0].changeId=crypto.randomUUID();assert.equal(await primary.evaluate(`app.logic.callFunction('saveScoreOperationsV2',${q(stale)}).then(r=>r.results[0].status==='rejected')`),true);
        assert.equal(await primary.evaluate(`(async()=>{await app.logic.refreshGlobalAppData();return app.state.spieltage.find(r=>r.id===${q(front)})._roundClose.nettoWinners.includes('MS02')&&app.state.spieler.find(p=>p.id==='MS02').hcpLIE===23.1&&app.state.historyPublication.revision===1;})()`),true);
        assert.equal(await primary.evaluate("app.logic.recalculateSeasonFromStart().then(()=>false,()=>true)"),true);
        stage='normal-fourth-round-create';
        await primary.evaluate(`(async()=>{app.router.navigate('spieltag_neu');document.getElementById('new-spieltag-kurs').value='S05-K';document.getElementById('new-spieltag-date').value='2026-01-24';document.getElementById('new-spieltag-rundentyp').value='9-Front';const ids=${q(players)};document.querySelectorAll('input[name="teilnehmer"]').forEach(cb=>cb.checked=ids.includes(cb.value));app.state.tempZufallsFlights=[ids.slice(0,4),ids.slice(4,8),ids.slice(8,12)];app.state.tempKalenderId=null;app.logic.saveZufallsFlights();return true;})()`);
        const nextRound=await until(async()=>{const s=await db.collection('spieltage').where('kursId','==','S05-K').get();const d=s.docs.find(d=>d.data().date==='2026-01-24');return d?d.data():null;});assert.equal(nextRound.hcpStart.MS02,23.1);assert.equal(nextRound.historyPublication.runId,runId);assert.equal(nextRound.hcpSnapshotRevision,1);for(const p of golden.players)if(p.id!=='MS02')assert.equal(nextRound.hcpStart[p.id],p.ends[2]);
        await primary.evaluate(`app.router.navigate('score_eingabe',{id:${q(nextRound.id)},hole:1});true`);await primary.waitFor("Boolean(app.state.scoreEntryV2?.status==='ready'&&document.getElementById('lie-avatar-MS02'))");await primary.evaluate("document.getElementById('lie-avatar-MS02').click();true");
        const newCard=await until(async()=>{const s=await db.collection('scorecards').doc('SC-'+nextRound.id+'-MS02-1').get();return s.exists?s.data():null;});assert.equal(newCard.hcpStart,23.1);assert.equal(newCard.strokesGiven,2);assert.equal(newCard.historyPublication.runId,runId);
        const currentTarget=(await db.collection('scorecards').doc(targetId).get()).data(),again={...change,changeId:crypto.randomUUID(),baseFieldRevision:currentTarget._sync.fields.strokes.revision,value:4};
        assert.equal(await primary.evaluate(`app.logic.callFunction('historyCorrectionV1',${q({action:'preview',change:again})}).then(()=>false,()=>true)`),true,'already active following round must block another correction');
        fs.writeFileSync(path.join(__dirname,'../.local-runtime/s07-proof.json'),JSON.stringify({projectId:guard.PROJECT,sourceCards:432,unchangedRawCards:unchanged,runId,firstBatch:400,failedSecondBatch:59,realWorkerExit:73,freshWorkerResume:true,publicationRevision:1,roundRevisions:[2,2,2],MS02:{start:[26,23,23.1],netto:[24,17,36],end:[23,23.1,23.1]},atomicFinalFault:true,lostAcknowledgementReplay:true,coherentRead:true,fourthNormalStart:23.1,newV2Card:true,releaseGo:false},null,2));
        console.log('PASS S07: 400 staged + failed59; real worker exit73/recovery; atomic459 projection publication; MS02 23/23.1/23.1; normal fourth round and V2 card.');
    }catch(error){console.error('S07 failed at '+stage+' ('+error.name+'); stack only '+String(error.stack).split('\n').slice(1,5).join(' | '));throw new Error('S07 local history integration failed');}
    finally{if(reader)await reader.close();await instance.delete();}
}
module.exports={run};
