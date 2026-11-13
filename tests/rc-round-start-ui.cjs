'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const browser=require('./s08-browser.cjs'),U=require('./s08-2-ui.cjs');
async function createViaUi(c,data){
    await c.evaluate("app.router.navigate('spieltag_neu');true");
    await c.waitFor("!!document.getElementById('new-spieltag-rundentyp')");
    await c.evaluate(`(()=>{
        window.rcStartProbe={};const call=app.logic.callFunction;
        app.logic.callFunction=async function(name,request){if(name!=='createRoundStart')return call(name,request);
            rcStartProbe.request=structuredClone(request);try{const result=await call(name,request);rcStartProbe.result=result;return result;}
            catch(error){rcStartProbe.errorCode=error.code;throw error;}};
        document.getElementById('new-spieltag-date').value='2026-11-12';
        document.getElementById('new-spieltag-kurs').value='RC-COURSE';
        document.getElementById('new-spieltag-rundentyp').value='9-Front';
        document.querySelectorAll('input[name="teilnehmer"]').forEach(e=>{e.checked=true;e.dispatchEvent(new Event('change',{bubbles:true}));});
        document.querySelector('button[onclick="app.logic.previewFlights()"]').click();return true;
    })()`);
    await c.waitFor("!!document.querySelector('button[onclick=\"app.logic.saveZufallsFlights()\"]')");
    await c.evaluate("document.querySelector('button[onclick=\"app.logic.saveZufallsFlights()\"]').click();true");
    await c.waitFor('!!(window.rcStartProbe.result||window.rcStartProbe.errorCode)',90000);
    return c.evaluate('window.rcStartProbe');
}
async function run(p,port,instance,data,expectBlocked){
    const db=instance.firestore(),catalog=fs.mkdtempSync(path.resolve('.local-runtime/rc-ui-'));let proof;
    const boundary=await browser.run(p,port,catalog,async c=>{
        await U.login(c,'MS01','1234');const wire=await createViaUi(c,data),id=wire.request.spieltagObj.id;
        const responses=c.networkBoundaryEvidence().filter(e=>e.event==='Network.responseReceived'&&e.url?.endsWith('/createRoundStart'));
        assert.ok(responses.length,'real callable HTTP response required');
        if(expectBlocked){
            assert.equal(wire.errorCode,'functions/failed-precondition');assert.equal(responses.at(-1).status,400);
            const user=await instance.auth().getUser('MS01');let failedCheck;
            try{await require('../functions/round-start').createRoundStart(db)({uid:user.uid,token:user.customClaims},wire.request);}
            catch(error){failedCheck=error.message;}
            assert.equal(failedCheck,'Participant already has active round; S05 required');
            assert.equal((await db.collection('spieltage').doc('RC-ROUND').get()).data().status,'Aktiv');
            assert.equal((await db.collection('spieltage').doc(id).get()).exists,false);
            proof={stage:'before',httpStatus:400,errorCode:wire.errorCode,failedCheck,blockingRound:'RC-ROUND',overlappingPlayers:12,noNewRoundWritten:true};
        }else{
            assert.equal(wire.errorCode,undefined);assert.equal(responses.at(-1).status,200);assert.equal(wire.result.success,true);
            const round=(await db.collection('spieltage').doc(id).get()).data();
            assert.equal(round.rundenTyp,'9-Front');assert.equal(round.bahnAnzahl,9);assert.equal(round.hcpSnapshotVersion,1);
            assert.equal(Object.keys(round.hcpStart).length,12);assert.equal((await db.collection('flights').where('spieltagId','==',id).get()).size,3);
            await c.waitFor("app.state.spieltage.some(r=>r.id==="+U.q(id)+")");await U.open(c,id,1,'MS01');await U.stroke(c,'MS01',1,5);
            const score=(await db.collection('scorecards').doc('SC-'+id+'-MS01-1').get()).data();
            assert.equal(score.strokes,5);assert.match(score._sync.generation,/^gen:/);
            // A second UI start must still fail with the same protective rule.
            await c.reload();await c.waitFor("app.state.currentUser?.id==='MS01'&&app.state.spieltage.length>0");
            const second=await createViaUi(c,data);assert.equal(second.errorCode,'functions/failed-precondition');
            assert.equal((await db.collection('spieltage').get()).size,1);assert.equal((await db.collection('scorecards').get()).size,1);
            proof={stage:'after',httpStatus:200,createdByNormalUi:true,type:round.rundenTyp,players:12,flights:3,authoritativeSnapshot:true,
                confirmedUiScore:score.strokes,secondOverlappingUiRoundBlocked:true,roundCount:1};
        }
    });
    assert.equal(boundary.forbiddenOrigins,0);
    fs.writeFileSync('.local-runtime/rc-round-start-'+(expectBlocked?'before':'after')+'.json',JSON.stringify({...proof,project:p.projectId,forbiddenOrigins:0},null,2));
    console.log(expectBlocked?'PASS reproduction: HTTP400; Participant already has active round; blocking seed RC-ROUND.':
        'PASS RC UI: new 9-Front round HTTP200, twelve snapshots, three flights, confirmed score; overlap still blocked.');
}
module.exports={run,createViaUi};
