'use strict';
const {test} = require('node:test'), assert = require('node:assert/strict');
const {memoryDatabase} = require('../functions/test/memory-score-database');
const {fixture} = require('../tools/local/rc-fixture.cjs');

test('RC has twelve synthetic players, three disjoint four-player flights and no client HCP snapshot', () => {
    const f = fixture(); assert.equal(f.players.length, 12); assert.equal(f.writers.length, 3);
    const assigned = f.flights.flatMap(x => x.spielerIdsCsv.split(','));
    assert.equal(new Set(assigned).size, 12); assert.ok(f.flights.every(x => x.spielerIdsCsv.split(',').length === 4));
    assert.equal(Object.hasOwn(f.round, 'hcpStart'), false);
});

async function legacy() {
    const db = memoryDatabase(), f = fixture();
    // Same collection-query adapter as the existing S07 publication tests.
    const collection = db.collection.bind(db);
    db.collection = name => ({...collection(name), query: {collection: name, field: '__all__', value: undefined}});
    for (const p of f.players) {
        await db.collection('spieler').doc(p.id).set({...p, mustChangePin: false});
        await db.collection('spieler_public').doc(p.id).set(p);
    }
    await db.collection('config').doc('saison').set({saisonStartDatum: '2026-01-01'});
    await db.collection('kurse').doc('RC-COURSE').set({name: 'Synthetic'});
    for (let nr = 1; nr <= 18; nr++) await db.collection('bahnen').doc('H' + nr).set({kursId: 'RC-COURSE', nr, par: 4, si: nr});
    const oldRound = {id: 'LEGACY', date: '2026-02-01', status: 'Beendet', kursId: 'RC-COURSE',
        rundenTyp: '9-Front', bahnAnzahl: 9, teilnehmerCsv: f.round.teilnehmerCsv,
        hcpStart: {MS01: 26}, hcpEnd: {MS01: 23.7}, nettoSieger: 'MS01', historicalExtra: 'preserve'};
    const oldCard = {id: 'SC-LEGACY-MS01-1', spieltagId: 'LEGACY', spielerId: 'MS01', hole: 1,
        strokes: 5, puts: 2, lady: false, maxscore: false, hcpStart: 26, strokesGiven: 2};
    await db.collection('spieltage').doc('LEGACY').set(oldRound);
    await db.collection('scorecards').doc(oldCard.id).set(oldCard);
    return {db, f, oldRound, oldCard, auth: {uid: 'MS01', token: {playerId: 'MS01', role: 'Admin', mustChangePin: false}}};
}

test('publication read retains original legacy scores, winners, HCP values and extra fields without backfill', async () => {
    const f = await legacy(), result = await require('../functions/published-season').createPublishedSeasonRead(f.db)(f.auth);
    assert.deepEqual(result.spieltage[0], f.oldRound); assert.deepEqual(result.scorecards[0], f.oldCard);
    assert.deepEqual((await f.db.collection('spieltage').doc('LEGACY').get()).data(), f.oldRound);
});

test('legacy score uses its real creation timestamp, not an invented V2 generation', async () => {
    const f = await legacy(), snap = await f.db.collection('scorecards').doc(f.oldCard.id).get();
    const state = require('../functions/score-operations-v2').readDocumentState(snap);
    assert.match(state.generation, /^legacy:/); assert.equal(state.revisions.strokes, 0);
    assert.equal(Object.hasOwn((await f.db.collection('scorecards').doc(f.oldCard.id).get()).data(), '_sync'), false);
});

test('new round refuses unverified legacy history instead of resetting or rewriting it', async () => {
    const f = await legacy();
    await assert.rejects(require('../functions/round-start').createRoundStart(f.db)(f.auth,
        {spieltagObj: f.f.round, flightsPayload: f.f.flights}), /Legacy\/history initialization blocked/);
    assert.equal((await f.db.collection('spieltage').doc('RC-ROUND').get()).exists, false);
    assert.deepEqual((await f.db.collection('spieltage').doc('LEGACY').get()).data(), f.oldRound);
});
