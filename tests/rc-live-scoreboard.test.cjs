'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const H=require('../Hcp_Rules'),{metadata}=require('../functions/test/hcp-fixture');
const {roundDigest}=require('../functions/round-close');
function setup(){
    assert.ok(fs.existsSync('App_Logic_Leaderboard.js'),'safe live reader required');
    const app={state:{currentUser:{id:'A'},currentView:'leaderboard'},logic:{},views:{},router:{currentParams:{id:'R'}}};
    const timers=[],elements=new Map(),document={getElementById:id=>elements.get(id),addEventListener(){},removeEventListener(){}};
    const c={app,LieHcpRules:H,crypto:require('node:crypto').webcrypto,TextEncoder,console,document,navigator:{onLine:true},
        firebase:{auth:()=>({currentUser:{uid:app.state.currentUser?.id}})},setTimeout:f=>(timers.push(f),timers.length),clearTimeout(){}};
    vm.runInNewContext(fs.readFileSync('App_Logic_Leaderboard.js','utf8'),c);
    return {app,c,timers,elements};
}
function fixture(){
    const round={id:'R',date:'2026-11-12',kursId:'K',rundenTyp:'9-Front',bahnAnzahl:9,status:'Aktiv',teilnehmerCsv:'A,B',scoreRevision:1,
        ...metadata({rundenTyp:'9-Front',bahnAnzahl:9},{A:0,B:26})};
    const card={id:'SC-R-A-1',spieltagId:'R',spielerId:'A',hole:1,strokes:4,maxscore:false,hcpStart:0,strokesGiven:round.holeAllowances.A[1]};
    const flights=[{id:'F',members:['A','B']}],cards=[card];
    const results=['A','B'].map(playerId=>({playerId,...H.evaluate(round,round.hcpHoleData,round.hcpStart[playerId],cards.filter(c=>c.spielerId===playerId),round.holeAllowances[playerId])}));
    const publication={publication:{revision:0,activeRun:null},spieltage:[round],scorecards:cards,spieler:[{id:'A',nickname:'<Ann>'},{id:'B',nickname:'Ben'}],flights:[{id:'F',spieltagId:'R',spielerIdsCsv:'A,B'}]};
    const inspect={spieltagId:'R',status:'Aktiv',scoreRevision:1,scoreDigest:roundDigest(round,flights,cards),results,flights,published:null};
    return {publication,inspect};
}
test('server-confirmed live model uses frozen HCP zero and canonical digest; no local pending scores',async()=>{
    const {app}=setup(),f=fixture();app.state.liveScores={'R_A_1':20};
    const v=await app.logic.buildLiveLeaderboard(f.publication,f.inspect,'R');
    assert.equal(v.rows.find(r=>r.id==='A').result.totalNetto,2);assert.equal(v.rows.find(r=>r.id==='A').scores[1].strokes,4);
    assert.equal(v.published,null);assert.equal(v.rows.find(r=>r.id==='A').result.startHcp,0);
});
for(const kind of ['changed-score','changed-revision','missing-snapshot','history-running'])test('no trusted live projection for '+kind,async()=>{
    const {app}=setup(),f=fixture();
    if(kind==='changed-score')f.publication.scorecards[0].strokes=8;
    if(kind==='changed-revision')f.inspect.scoreRevision++;
    if(kind==='missing-snapshot')delete f.publication.spieltage[0].hcpStart;
    if(kind==='history-running')f.publication.publication.activeRun='H1';
    await assert.rejects(app.logic.buildLiveLeaderboard(f.publication,f.inspect,'R'));
});
test('all familiar modes escape names, show provisional Net and no HCP projection or Brutto/Putts winner',async()=>{
    const {app,c}=setup(),f=fixture();const model=await app.logic.buildLiveLeaderboard(f.publication,f.inspect,'R');
    app.state.liveLeaderboard={owner:'A',id:'R',model,status:'live'};
    vm.runInNewContext(fs.readFileSync('Views_Leaderboard.js','utf8'),c);
    vm.runInNewContext(fs.readFileSync('Views_LiveScoreboard.js','utf8'),c);
    for(const mode of ['matrix','list','flights']){
        app.state.leaderboardViewMode=mode;const html=app.views.leaderboard('R');
        assert.match(html,/Live-Netto/);assert.match(html,/&lt;Ann&gt;/);assert.doesNotMatch(html,/<Ann>|HCP-Vorschau|finishRoundWithWinners|showPlayerDetailModal|Brutto \(Zählspiel\)/);
        assert.match(html,new RegExp('data-live-mode="'+mode+'"'));
    }
});
test('read error keeps last confirmed snapshot visibly stale; polling never writes or reads Firestore directly',async()=>{
    const {app,timers}=setup(),f=fixture();let fail=false;const calls=[];
    app.logic.callFunction=async(name,r)=>{calls.push([name,r]);if(fail)throw new Error('technical secret');return name==='readPublishedSeasonV1'?f.publication:f.inspect;};
    app.logic.startLeaderboardLive('R');await app.logic.refreshLeaderboardLive();
    const previous=app.state.liveLeaderboard.model;assert.ok(previous);fail=true;
    await timers.at(-1)();assert.equal(app.state.liveLeaderboard.model,previous);assert.equal(app.state.liveLeaderboard.status,'stale');
    assert.ok(calls.every(([name,r])=>name==='readPublishedSeasonV1'||name==='roundClosureV1'&&r.action==='inspect'));
});
test('late read after account/navigation change cannot paint or restart polling',async()=>{
    const {app,timers}=setup(),f=fixture();let release;
    app.logic.callFunction=()=>new Promise(r=>{release=r;});app.logic.startLeaderboardLive('R');
    const running=app.logic.refreshLeaderboardLive();app.logic.stopLeaderboardLive();app.state.currentUser={id:'B'};release(f.publication);await running;
    assert.equal(app.state.liveLeaderboard,undefined);assert.equal(timers.length,0);
});
