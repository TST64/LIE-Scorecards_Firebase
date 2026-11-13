'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { randomUUID } = require('node:crypto');
function fixture()
{
    const removed = Symbol('delete'), writes = [], db = new Map([
        ['spieltage/ST', { status: 'Aktiv' }],
        ['flights/FL-ST-1', { id: 'FL-ST-1', seq: 1, spieltagId: 'ST', spielerIdsCsv: 'A,B' }],
        ['scorecards/SC-ST-A-1', { id: 'SC-ST-A-1', spieltagId: 'ST', spielerId: 'A', hole: 1, flightSeq: 1, strokes: 5, puts: 3, lady: true, hcpStart: 0, strokesGiven: 0 }]
    ]);
    const c = { console: { log() {}, error() {} }, firebase: { firestore: { FieldValue: { delete: () => removed } } },
        app: { state: { currentUser: { id: 'A', role: 'Spieler' } }, environment: { async checkOnline() {} }, logic: { getFlightSeq: f => f.seq },
            db: { collection: name => ({ doc: id => name + '/' + id }), async runTransaction(callback) {
                const queued = [];
                await callback({ async get(ref) { assert.equal(queued.length, 0, 'all reads precede writes'); return { exists: db.has(ref), data: () => db.get(ref) }; },
                    update: (ref, patch) => queued.push([ref, patch]), set: (ref, patch) => queued.push([ref, patch]) });
                if (c.failBeforeCommit) throw new Error('synthetic transaction failure');
                for (const [ref, patch] of queued) {
                    const next = { ...db.get(ref) }; for (const [field, value] of Object.entries(patch)) {
                        if (value === removed) delete next[field]; else next[field] = value;
                    }
                    writes.push([ref, patch]); db.set(ref, next);
                }
                if (c.loseAck) throw new Error('synthetic ACK loss after real memory commit');
            } } } };
    vm.createContext(c);
    vm.runInContext(fs.readFileSync('App_Logic_Bridge.js', 'utf8'), c);
    const wire = { protocol: 'v1-s01', requestId: randomUUID(), owner: 'A', environment: 'local:demo-lie-scorecards-local', spieltagId: 'ST', flightId: 'FL-ST-1', flightSeq: 1,
        payload: [{ id: 'SC-ST-A-1', spieltagId: 'ST', spielerId: 'A', hole: 1, flightSeq: 1, creation: { hcpStart: 26, strokesGiven: 2 },
            changes: [{ changeId: randomUUID(), field: 'strokes', operation: 'set', value: 6 }] }] };
    return { c, db, writes, wire, send: () => c.app.logic.saveV1ScoreSnapshot(wire) };
}
test('real Bridge patches strokes only and preserves server puts/lady/HCP=0', async () => {
    const f = fixture(), r = await f.send(); assert.equal(r.success, true);
    const saved = f.db.get('scorecards/SC-ST-A-1'); assert.equal(saved.strokes, 6); assert.equal(saved.puts, 3); assert.equal(saved.lady, true); assert.equal(saved.hcpStart, 0);
    assert.deepEqual(Object.keys(f.writes[0][1]), ['strokes']); assert.deepEqual([...r.acknowledgedChangeIds], [f.wire.payload[0].changes[0].changeId]);
});
for (const [field, value] of [['puts', 0], ['lady', false], ['maxscore', false]]) test('explicit ' + field + '=' + value + ' reaches server', async () => {
    const f = fixture(); Object.assign(f.wire.payload[0].changes[0], { field, value }); assert.equal((await f.send()).success, true);
    assert.equal(f.db.get('scorecards/SC-ST-A-1')[field], value);
});
test('explicit deletion removes just chosen server field', async () => {
    const f = fixture(); Object.assign(f.wire.payload[0].changes[0], { field: 'puts', operation: 'delete', value: null });
    assert.equal((await f.send()).success, true); const saved = f.db.get('scorecards/SC-ST-A-1'); assert.equal('puts' in saved, false); assert.equal(saved.lady, true);
});
test('new card receives explicit strokes and creation metadata, no view defaults', async () => {
    const f = fixture(); f.db.delete('scorecards/SC-ST-A-1'); assert.equal((await f.send()).success, true);
    assert.deepEqual(Object.keys(f.db.get('scorecards/SC-ST-A-1')).sort(), ['flightSeq','hcpStart','hole','id','spielerId','spieltagId','strokes','strokesGiven'].sort());
});
test('deletion of absent card confirms a checked no-op and never invents a card', async () => {
    const f = fixture(); f.db.delete('scorecards/SC-ST-A-1'); Object.assign(f.wire.payload[0].changes[0], { operation: 'delete', value: null });
    const r = await f.send(); assert.equal(r.success, true); assert.equal(r.acknowledgedChangeIds.length, 1); assert.equal(f.writes.length, 0); assert.equal(f.db.has('scorecards/SC-ST-A-1'), false);
});
for (const kind of ['closed', 'flight', 'member', 'identity', 'owner', 'malformed', 'duplicate', 'putts-only']) test('rejects ' + kind + ' with no writes or positive ACK', async () => {
    const f = fixture();
    if (kind === 'closed') f.db.get('spieltage/ST').status = 'Abgeschlossen';
    if (kind === 'flight') f.db.get('flights/FL-ST-1').seq = 2;
    if (kind === 'member') f.db.get('flights/FL-ST-1').spielerIdsCsv = 'B';
    if (kind === 'identity') f.db.get('scorecards/SC-ST-A-1').spielerId = 'B';
    if (kind === 'owner') f.c.app.state.currentUser.id = 'B';
    if (kind === 'malformed') f.wire.payload[0].puts = 2;
    if (kind === 'duplicate') f.wire.payload[0].changes.push({ ...f.wire.payload[0].changes[0] });
    if (kind === 'putts-only') { f.db.delete('scorecards/SC-ST-A-1'); Object.assign(f.wire.payload[0].changes[0], { field: 'puts', value: 3 }); }
    const r = await f.send(); assert.equal(r.success, false); assert.equal(r.acknowledgedChangeIds, undefined); assert.equal(f.writes.length, 0);
});
test('post-commit ACK loss is unknown, never a definitely-not-applied promise', async () => {
    const f = fixture(); f.c.loseAck = true; const r = await f.send(); assert.equal(r.success, false); assert.equal(r.definitelyNotApplied, undefined); assert.equal(f.db.get('scorecards/SC-ST-A-1').strokes, 6);
});
test('preflight readiness rejection never opens transaction', async () => {
    const f = fixture(); f.c.app.environment.checkOnline = async () => { throw new Error('offline'); };
    const r = await f.send(); assert.equal(r.success, false); assert.equal(r.definitelyNotApplied, true); assert.equal(r.retryable, true); assert.equal(f.writes.length, 0);
});
