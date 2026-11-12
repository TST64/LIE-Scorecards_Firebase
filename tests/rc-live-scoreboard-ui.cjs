'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {launch}=require('./s08-2-devices.cjs'),U=require('./s08-2-ui.cjs'),{createViaUi}=require('./rc-round-start-ui.cjs');
async function run(profile,port,db,data,visualOnly=false){
    const root=fs.mkdtempSync(path.resolve('.local-runtime/live-ui-')),devices=[],images=path.resolve('.local-runtime/ui-evidence');fs.mkdirSync(images,{recursive:true});
    let stage='login';
    const image=async(c,name)=>{const shot=await c.command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(images,name+'.png'),Buffer.from(shot.data,'base64'));};
    const mobile=c=>c.command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
    const board=async(c,id)=>{await c.evaluate(`app.router.navigate('leaderboard',{id:${U.q(id)}});true`);await c.waitFor("app.state.liveLeaderboard?.status==='live'",90000);};
    const total=(c,id)=>c.evaluate(`app.state.liveLeaderboard.model.rows.find(r=>r.id===${U.q(id)}).result.totalNetto`);
    try{
        for(let i=0;i<3;i++)devices.push(await launch(profile,port,path.join(root,'p'+i)));
        const clients=devices.map(d=>d.client),[a,b,c]=clients;await U.login(a,'MS01','1234');
        const created=await createViaUi(a,data);assert.equal(created.result.success,true);const id=created.result.spieltag.id;
        const flights=created.result.flights.map(f=>({id:f.id,members:f.spielerIdsCsv.split(',')}));
        const own=flights.findIndex(f=>f.members.includes('MS01'));[flights[0],flights[own]]=[flights[own],flights[0]];
        const writers=['MS01',flights[1].members[0],flights[2].members[0]];
        await Promise.all([U.login(b,writers[1],'1234'),U.login(c,writers[2],'1234')]);
        stage='remote-polling';await board(b,id);await U.open(a,id,1,'MS01');await mobile(a);
        await U.stroke(a,'MS01',1,5);
        await b.waitFor("app.state.liveLeaderboard.model.rows.find(r=>r.id==='MS01').result.playedHoles===1",90000);
        const first=await total(b,'MS01');await U.stroke(a,'MS01',1,4);
        await b.waitFor("app.state.liveLeaderboard.model.rows.find(r=>r.id==='MS01').result.totalNetto==="+(first+1),90000);
        assert.equal(await b.evaluate("app.state.currentView==='leaderboard'"),true);
        stage='modes-and-viewports';await b.command('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
        await image(b,'matrix-desktop');await mobile(b);
        for(const mode of ['matrix','list','flights']){
            await b.evaluate(`document.getElementById('live-mode-${mode}').click();true`);
            assert.equal(await b.evaluate(`!!document.querySelector('[data-live-mode="${mode}"]')`),true);
            assert.equal(await total(b,'MS01'),first+1);await image(b,mode+'-mobile');
        }
        assert.equal(await b.evaluate('document.documentElement.scrollWidth<=innerWidth+2'),true,'mobile page must not overflow');
        assert.equal(await b.evaluate("Array.from(document.querySelectorAll('.lie-live-tabs button')).every(e=>e.getBoundingClientRect().height>=48)"),true);
        await image(a,'score-input-unchanged-mobile');
        if(visualOnly){
            assert.equal(await b.evaluate("getComputedStyle(document.querySelector('.lie-live-heading')).backgroundColor"),'rgba(0, 0, 0, 0)');
            await a.evaluate(`app.logic.openRoundClose(${U.q(id)}).then(()=>true)`);await image(a,'round-close-mobile');
            assert.equal(await a.evaluate("document.getElementById('close-begin').disabled"),true);
            await a.evaluate("document.querySelector('.lie-close-table').scrollIntoView({block:'start'});true");await image(a,'round-close-table-mobile');
            const checks=await Promise.all(devices.map(d=>d.stop()));assert.ok(checks.every(x=>x.forbiddenOrigins===0));
            console.log('PASS visual follow-up: transparent headings, mobile modes and disabled incomplete closure; input styling unchanged.');return;
        }
        stage='pending-not-ranked';await U.offline(a,profile,true);
        await a.evaluate("document.getElementById('lie-strokes-plus-MS01').click();true");
        await a.waitFor("app.state.scoreEntryV2.entries.MS01_1.pendingOperations.length>0");
        await b.evaluate('app.logic.refreshLeaderboardLive().then(()=>true)');assert.equal(await total(b,'MS01'),first+1);
        await U.offline(a,profile,false);await U.settled(a);
        await b.waitFor("app.state.liveLeaderboard.model.rows.find(r=>r.id==='MS01').result.totalNetto==="+first,90000);
        stage='overlay-after-ack';await a.evaluate("document.querySelector('.lie-round-nav button:nth-child(2)').click();true");
        await a.waitFor("!!document.querySelector('#overlay-leaderboard-content [data-live-mode]')",90000);
        await U.stroke(a,'MS01',1,4);await a.waitFor("!!document.getElementById('score-leaderboard-overlay')&&app.state.liveLeaderboard?.model?.rows.find(r=>r.id==='MS01').result.totalNetto==="+(first+1),90000);
        await a.evaluate("document.getElementById('live-close-overlay').click();true");
        stage='nine-hole-ui-input';
        // Only the affected nine-hole flow, using the existing normal input and
        // V2 sender for three flight writers, no direct score seeding.
        await Promise.all(clients.map(async(client,i)=>{
            for(let hole=1;hole<=9;hole++){
                await U.open(client,id,hole,writers[i]);
                for(const player of flights[i].members)await U.stroke(client,player,hole,4+(i===2?1:0));
            }
        }));
        stage='consistent-closure';
        const inputResults=await a.evaluate("Object.fromEntries(app.state.scoreScreenContext.players.map(id=>{const r=LieHcpRules.evaluate(app.state.scoreScreenContext.round,app.state.scoreScreenContext.round.holeData,app.state.scoreScreenContext.round.hcpStart[id],app.state.scoreScreenContext.round.holes.map(h=>({hole:h,...app.state.scoreEntryV2.entries[id+'_'+h].confirmed})),app.state.scoreScreenContext.round.holeAllowances[id]);return [id,{totalNetto:r.totalNetto,playedHoles:r.playedHoles}];}))");
        await board(b,id);const before=await b.evaluate('app.state.liveLeaderboard.model.rows.map(r=>({id:r.id,netto:r.result.totalNetto,played:r.result.playedHoles}))');
        assert.equal(before.length,12);assert.ok(before.every(r=>r.played===9));
        await a.evaluate(`app.logic.openRoundClose(${U.q(id)}).then(()=>true)`);
        const view=await a.evaluate('app.state.roundCloseView');assert.equal(view.complete,true);
        for(const r of view.results){assert.equal(r.totalNetto,before.find(x=>x.id===r.playerId).netto);if(inputResults[r.playerId])assert.equal(r.totalNetto,inputResults[r.playerId].totalNetto);}
        await image(a,'round-close-mobile');
        assert.equal(await a.evaluate("document.getElementById('close-begin').getBoundingClientRect().height>=48"),true);
        await a.evaluate("document.getElementById('close-begin').click();true");await a.waitFor("app.state.roundCloseView.closure?.phase==='collecting'",90000);
        for(let i=0;i<3;i++){
            const client=clients[i];if(i)await client.evaluate(`app.logic.openRoundClose(${U.q(id)}).then(()=>true)`);
            const flightId=flights[i].id;
            await client.evaluate(`document.getElementById(${U.q('close-review-'+flightId)}).click();document.getElementById(${U.q('close-release-'+flightId)}).click();true`);
            await client.waitFor(`!!app.state.roundCloseView.closure.approvals[${U.q(flightId)}]`,90000);
        }
        await a.evaluate(`app.logic.openRoundClose(${U.q(id)}).then(()=>true)`);await image(a,'round-close-released-mobile');
        assert.equal(await a.evaluate("document.getElementById('close-commit').disabled"),false);
        await a.evaluate("document.getElementById('close-commit').click();true");await a.waitFor("app.state.roundCloseView.status==='Beendet'",90000);
        const published=await a.evaluate('app.state.roundCloseView.published');
        await board(b,id);const shown=await b.evaluate('app.state.liveLeaderboard.model');
        assert.equal(shown.published.version,1);assert.deepEqual(shown.published.nettoWinners,published.nettoWinners);
        for(const r of published.results){assert.equal(r.totalNetto,before.find(x=>x.id===r.playerId).netto);assert.equal(shown.published.hcpEnd[r.playerId],r.endHcp);}
        await image(b,'published-mobile');
        assert.equal((await db.collection('scorecards').get()).size,108);
        const checks=await Promise.all(devices.map(d=>d.stop()));assert.ok(checks.every(x=>x.forbiddenOrigins===0));
        fs.writeFileSync('.local-runtime/rc-live-ui-proof.json',JSON.stringify({syntheticOnly:true,project:profile.projectId,players:12,writers:3,holes:9,cards:108,automaticRemoteUpdate:true,pendingExcluded:true,offlineRecovery:true,overlaySurvivesAck:true,modes:['matrix','list','flights'],mobileWidth:390,valuesAgree:true,closurePublished:true,forbiddenOrigins:0},null,2));
        console.log('PASS RC UI: 3 writers, 108 UI-confirmed cards; live without reload; pending excluded; scores/Net/HCP closure agree.');
    }catch(error){console.error('RC live UI stage: '+stage);throw error;}
    finally{await Promise.allSettled(devices.map(d=>d.stop()));}
}
module.exports={run};
