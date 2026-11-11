'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const H=require('../functions/hcp-rules');
const warning='Prüfung erforderlich – Rundentyp oder Score-Vollständigkeit unklar';
const guard='<div role="alert">Legacy-Performance/Brutto/Putts bleiben bis zur fachlichen S05/S07-Abnahme gesperrt. Die Netto-/HCP-Vorschau verwendet den gemeinsamen Rechner.</div>';
const plain=value=>JSON.parse(JSON.stringify(value));
function fixture(withGood=false){
    const player={id:'P',nickname:'Synthetic P',hcpLIE:24.5,role:'Spieler'};
    const holes=Array.from({length:18},(_,i)=>({nr:i+1,par:4,si:i+1}));
    const bad={id:'REVIEW',date:'2026-03-02',kursId:'K',status:'Beendet',rundenTyp:'18',bahnAnzahl:18,teilnehmerCsv:'P',hcpStart:{P:25.5},hcpEnd:{P:17.7}};
    const good9={id:'GOOD9',date:'2026-03-01',kursId:'K',status:'Beendet',rundenTyp:'9-Front',bahnAnzahl:9,teilnehmerCsv:'P',hcpStart:{P:26},hcpEnd:{P:25.5}};
    const good18={id:'GOOD18',date:'2026-03-03',kursId:'K',status:'Beendet',rundenTyp:'18',bahnAnzahl:18,teilnehmerCsv:'P',hcpStart:{P:25.5},hcpEnd:{P:24.5}};
    const cards=(r,n)=>Array.from({length:n},(_,i)=>({id:r.id+'-'+(i+1),spieltagId:r.id,spielerId:'P',hole:i+1,strokes:5,puts:2,lady:false,maxscore:false}));
    const app={state:{currentUser:player,spieler:[player],saisonStartDatum:'2026-01-01',spieltage:withGood?[good9,bad,good18]:[bad],
        scoreCards:[...cards(bad,9),...(withGood?[...cards(good9,9),...cards(good18,18)]:[])],kurse:[{id:'K',name:'Synthetic course'}],bahnen:holes},logic:{},views:{}};
    let hcpCalls=0;
    app.logic.getRoundHoles=r=>H.played(r,holes);
    app.logic.getHistoricalHcp=()=>{hcpCalls++;return 26;};
    app.logic.calculateHoleVorgabeForHcp=()=>{hcpCalls++;return 1;};
    app.logic.calculateNettoStableford=()=>{hcpCalls++;return 2;};
    const context={app};vm.runInNewContext(fs.readFileSync('App_Logic_Performance.js','utf8'),context);
    vm.runInNewContext(fs.readFileSync('Views_Performance.js','utf8'),context);
    return {app,player,bad,getHcpCalls:()=>hcpCalls};
}
test('18 configured holes with nine scores remain visible as review-only raw data without HCP calculations',()=>{
    const f=fixture(),before=plain(f.app.state),d=f.app.logic.getPersonalPerformance(f.player);
    assert.equal(d.reviewRounds.length,1);assert.equal(d.reviewRounds[0].id,'REVIEW');
    assert.equal(d.reviewRounds[0].warning,warning);assert.equal(d.reviewRounds[0].rawScores.length,9);
    assert.equal(d.reviewRounds[0].hcpEnd,null);assert.equal(d.reviewRounds[0].netto,null);
    assert.equal(f.getHcpCalls(),0,'unclear rounds must not even invoke HCP/Netto calculators');
    assert.equal(d.hcpSeries.some(r=>r.id==='REVIEW'),false);assert.equal(d.hasHcpReviewGaps,true);
    assert.deepEqual(plain(f.app.state),before);
});
test('actual performance route displays warning and original raw values, without opening legacy rankings or HCP chart',()=>{
    const f=fixture();f.app.state.scoreCards[0].strokes=0;f.app.state.scoreCards[0].puts=0;
    f.app.state.scoreCards[1].id='<script>bad()</script>';delete f.app.state.scoreCards[1].puts;
    const html=f.app.views.performance();
    assert.ok(html.startsWith(guard));assert.ok(html.includes(warning));assert.ok(html.includes('REVIEW'));
    assert.ok(html.includes('Rohscores'));assert.ok(html.includes('nicht erfasst'));assert.ok(html.includes('false'));
    assert.ok(!html.includes('<script>bad()'));assert.ok(!html.includes('<svg'));assert.ok(!html.includes('17.7'));
    assert.equal(f.getHcpCalls(),0);
});
test('correct completed rounds and saved HCP points remain identical before and after adding a review round',()=>{
    const f=fixture(true),withReview=f.app.logic.getPersonalPerformance(f.player);
    f.app.state.spieltage=f.app.state.spieltage.filter(r=>r.id!=='REVIEW');
    const reference=f.app.logic.getPersonalPerformance(f.player);
    for(const key of ['rounds','roundsCount','hcpSeries','currentHcp','hcpChange','bestRound','courses'])assert.deepEqual(plain(withReview[key]),plain(reference[key]),key);
    assert.equal(reference.roundsCount,2);assert.equal(reference.currentHcp,24.5);
    assert.equal(f.app.views.performance(),guard,'existing completed-round view stays byte-identical');
});
test('contradictory round metadata or holes stay visible even if normal hole selection throws',()=>{
    for(const change of [f=>f.bad.bahnAnzahl=9,f=>{f.bad.rundenTyp='9-Back';f.bad.bahnAnzahl=9;},f=>f.app.state.scoreCards[8].hole=1]){
        const f=fixture();change(f);assert.equal(f.app.logic.getPersonalPerformance(f.player).reviewRounds.length,1);
        assert.ok(f.app.views.performance().includes(warning));assert.equal(f.getHcpCalls(),0);
    }
});
test('review rows preserve absent, zero and false raw fields and are scoped to the selected player',()=>{
    const f=fixture();delete f.app.state.scoreCards[0].puts;f.app.state.scoreCards[1].puts=0;
    f.app.state.scoreCards.push({...f.app.state.scoreCards[0],id:'OTHER',spielerId:'Q',strokes:99});
    const d=f.app.logic.getPersonalPerformance(f.player),raw=d.reviewRounds[0].rawScores;
    assert.equal(Object.hasOwn(raw[0],'puts'),false);assert.equal(raw[1].puts,0);assert.equal(raw[1].lady,false);
    assert.equal(raw.length,9);assert.ok(!f.app.views.performance().includes('99'));
});
