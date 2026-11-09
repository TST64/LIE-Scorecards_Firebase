'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');
const course=Array.from({length:18},(_,i)=>({nr:i+1,par:4,si:i+1,kursId:'K'}));
function legacy(){const app={logic:{},state:{bahnen:course,handicaps:[]}};const c={app};for(const f of ['Hcp_Rules.js','App_Logic_Scores.js','App_Logic_History.js'])if(fs.existsSync(f))vm.runInNewContext(fs.readFileSync(f,'utf8'),c);return app;}
function rules(){const file='functions/hcp-rules.js';assert.ok(fs.existsSync(file),'one pure group HCP reference implementation is required');return require('../'+file);}
test('baseline generic nine distributes exactly thirteen allowances on played front nine',()=>{
    const app=legacy(),round={id:'R',kursId:'K',rundenTyp:'9',bahnAnzahl:9};const total=course.slice(0,9).reduce((n,h)=>n+app.logic.calculateHoleVorgabe({hcpLIE:26},round,h.nr),0);assert.equal(total,13);
});
test('historical HCP zero is preserved and decimal deterioration is never truncated',()=>{
    const app=legacy(),round={id:'R',kursId:'K',rundenTyp:'9-Front',bahnAnzahl:9};
    const cards=course.slice(0,9).map(h=>({spieltagId:'R',spielerId:'A',hole:h.nr,strokes:4}));
    assert.equal(app.logic.calculateRoundForPlayer(round,'A',0,cards).endHcp,0);
    // Nine pars with HCP zero => 18; make one hole one stroke worse => 17.
    cards[0].strokes=5;assert.equal(app.logic.calculateRoundForPlayer(round,'A',0,cards).endHcp,0.1);
});
test('historical fallback must never substitute todays player HCP',()=>{
    const app=legacy();assert.equal(app.logic.getHistoricalHcp({id:'A',hcpLIE:54},{id:'R'},null),null);
});
test('explicit Strich is zero netto, completed; missing hole is incomplete, no HCP progression',()=>{
    const h=rules();const round={rundenTyp:'9-Front',bahnAnzahl:9};const snap=h.snapshot(round,course,26,[]);
    const cards=snap.holes.map(n=>({hole:n,strokes:4,maxscore:true}));const full=h.evaluate(round,course,26,cards,snap.holeAllowances);
    assert.equal(full.totalNetto,0);assert.equal(full.complete,true);assert.equal(full.endHcp,27.8);assert.equal(full.bruttoEligible,false);
    const partial=h.evaluate(round,course,26,cards.slice(1),snap.holeAllowances);assert.equal(partial.complete,false);assert.equal(partial.endHcp,null);
});
test('played-hole SI ranks: back-nine reversed, zero and whole playing allowance edges',()=>{
    const h=rules(),back=course.map(x=>({...x,si:x.nr<=9?x.nr:28-x.nr}));
    for(const [hcp,total] of [[0,0],[1,1],[9,5],[18,9],[26,13],[36,18],[54,27]]){
        for(const type of ['9-Front','9-Back']){const r={rundenTyp:type,bahnAnzahl:9};const s=h.snapshot(r,back,hcp,[]);assert.equal(Object.values(s.holeAllowances).reduce((a,b)=>a+b,0),total);}
    }
    const s=h.snapshot({rundenTyp:'9-Back',bahnAnzahl:9},back,26,[]);assert.equal(s.holeAllowances[18],2);assert.equal(s.holeAllowances[10],1);
});
test('decimal half-up, HCP bounds, invalid/duplicate holes and score NaN are explicit',()=>{
    const h=rules();for(const [value,expected] of [[0.05,0.1],[26.05,26.1],[26.15,26.2],[53.95,54]])assert.equal(h.normalizeHcp(value),expected);
    const r={rundenTyp:'9-Front',bahnAnzahl:9},s=h.snapshot(r,course,0,[]),cards=s.holes.map(hole=>({hole,strokes:1}));
    assert.equal(h.evaluate(r,course,0,cards,s.holeAllowances).endHcp,0);
    assert.equal(h.progress(54,0,9),54);assert.throws(()=>h.normalizeHcp(NaN));assert.throws(()=>h.snapshot(r,[...course,course[0]],26,[]));
    assert.equal(h.evaluate(r,course,0,[...cards,cards[0]],s.holeAllowances).valid,false);
    assert.equal(h.evaluate(r,course,0,cards.map((c,i)=>({...c,strokes:i===0?NaN:c.strokes})),s.holeAllowances).valid,false);
});
test('independent twelve-player golden matrix and three-round correction plan',()=>{
    const h=rules();const golden=require('./fixtures/hcp-s06-golden.json');
    const rounds=[{id:'F',date:'2026-01-03',rundenTyp:'9-Front',bahnAnzahl:9},{id:'B',date:'2026-01-10',rundenTyp:'9-Back',bahnAnzahl:9},{id:'E',date:'2026-01-17',rundenTyp:'18',bahnAnzahl:18}];
    // Fixture raw scores use explicitly tabulated old start/playing totals. Expected
    // HCPs are literal independently hand-calculated constants, not function copies.
    const all=[];
    for(const player of golden.players){let start=26;for(let i=0;i<3;i++){
        const r=rounds[i],holes=i===1?course.slice(9):i===0?course.slice(0,9):course;
        const V=player.rawAllowances[i],H=holes.length;
        const cards=holes.map((hole,j)=>({spieltagId:r.id,spielerId:player.id,hole:hole.nr,strokes:4+Math.floor(V/H)+(j<V%H?1:0)+2-Math.min(4,Math.max(0,player.netto[i]-4*j))}));all.push(...cards);
        const s=h.snapshot(r,course,start,[]),result=h.evaluate(r,course,start,cards,s.holeAllowances);assert.equal(result.endHcp,player.ends[i],player.id+' round '+i);start=result.endHcp;
    }}
    assert.equal(all.length,432);const before=JSON.stringify(all);
    const plan=h.plan(rounds,all,Object.fromEntries(golden.players.map(p=>[p.id,26])),()=>course,()=>[]);
    assert.equal(plan.currentHcp.MS03,26.4);assert.equal(JSON.stringify(all),before);
    const corrected=structuredClone(all);corrected.find(c=>c.spieltagId==='F'&&c.spielerId==='MS02'&&c.hole===6).strokes=3;
    const fixed=h.plan(rounds,corrected,Object.fromEntries(golden.players.map(p=>[p.id,26])),()=>course,()=>[]);
    assert.equal(fixed.currentHcp.MS02,23.1);assert.deepEqual(fixed,h.plan(rounds,corrected,Object.fromEntries(golden.players.map(p=>[p.id,26])),()=>course,()=>[]));
});
