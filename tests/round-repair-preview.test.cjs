'use strict';
const {test} = require('node:test'), assert = require('node:assert/strict'), vm = require('node:vm'), fs = require('node:fs');
const {preview, syntheticExample} = require('../tools/local/round-repair-preview.cjs');

test('incomplete 18-hole rounds stay outside rated aggregates while remaining available for review', () => {
    const input = syntheticExample(), app = {state:{spieltage:[input.rounds[0]], scoreCards:input.scorecards,
        saisonStartDatum:'2026-01-01', kurse:[], golfplaetze:[]},logic:{getRoundHoles:r=>r.hcpHoleData}};
    vm.runInNewContext(fs.readFileSync('App_Logic_Performance.js','utf8'), {app});
    assert.equal(app.logic.getPersonalPerformance({id:'SYN01',hcpLIE:26}).roundsCount,0);
    assert.equal(app.logic.getPersonalPerformance({id:'SYN01',hcpLIE:26}).reviewRounds.length,1);
    assert.equal(app.state.spieltage.length,1); assert.equal(app.state.scoreCards.length,54);
    app.state.spieltage[0]={...app.state.spieltage[0],rundenTyp:'9-Front',bahnAnzahl:9};
    assert.equal(app.logic.getPersonalPerformance({id:'SYN01',hcpLIE:26}).roundsCount,1);
});
test('front preview preserves every raw object and shows HCP/result effects over three rounds without allowing save', () => {
    const input = syntheticExample(), original = structuredClone(input), p = preview(input,'SYN-R1','9-Front');
    assert.equal(p.previewComplete,true); assert.equal(p.rawValuesUnchanged,true); assert.deepEqual(input,original);
    assert.equal(p.impact.length,6); assert.equal(p.results.length,3); assert.equal(p.impact[0].recomputedBeforeComplete,false);
    assert.equal(p.impact[0].proposedComplete,true); assert.equal(p.persistAllowed,false); assert.equal(p.saveImplemented,false);
});
test('back preview uses holes 10-18 without renumbering or discarding the original front cards', () => {
    const input = syntheticExample(), p = preview(input,'SYN-R1','9-Back');
    assert.equal(p.previewComplete,false); assert.equal(p.cardsOutsideSelectedRange.length,18);
    assert.ok(p.blockingReasons.includes('cards-outside-selected-range-no-automatic-remap-or-exclusion'));
    for (const r of input.rounds) {r.rundenTyp=r.id==='SYN-R1'?'18':'9-Back';}
    for (const c of input.scorecards) c.hole+=9;
    const back = preview(input,'SYN-R1','9-Back'); assert.equal(back.previewComplete,true); assert.equal(back.rawValuesUnchanged,true);
});
test('missing strokes or conflicting duplicate cards block a complete preview', () => {
    for (const change of [d=>delete d.scorecards[0].strokes,d=>d.scorecards.push({...d.scorecards[0],id:'DUP'})]) {
        const d = syntheticExample();change(d);const p=preview(d,'SYN-R1','9-Front');assert.equal(p.previewComplete,false);assert.equal(p.persistAllowed,false);
    }
});
test('missing historical basis and ambiguous same-day order never acquire guessed HCP values', () => {
    for (const change of [d=>delete d.initialHcp.SYN01,d=>delete d.rounds[0].hcpHoleData,d=>d.rounds[1].date=d.rounds[0].date]) {
        const d=syntheticExample();change(d);const p=preview(d,'SYN-R1','9-Front');assert.equal(p.previewComplete,false);assert.equal(p.impact,undefined);
    }
});
test('missing inventories, duplicate rounds and invalid calendar dates produce blocked diagnostics', () => {
    assert.equal(preview(undefined,'SYN-R1','9-Front').persistAllowed,false);
    for (const change of [d=>delete d.scorecards,d=>d.rounds.push({...d.rounds[0]}),d=>d.rounds[0].date='2026-02-31',
        d=>d.scorecards.push(null),d=>d.rounds[1].teilnehmerCsv='SYN01, SYN02',d=>d.scorecards[0].spieltagId='UNKNOWN']) {
        const d=syntheticExample();change(d);assert.equal(preview(d,'SYN-R1','9-Front').previewComplete,false);
    }
});
