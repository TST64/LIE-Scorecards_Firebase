'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto').webcrypto;
const tick = () => new Promise(resolve => setImmediate(resolve));
function storage(map = new Map())
{
    return { map, fail: false, get length() { return map.size; }, key: n => [...map.keys()][n],
        getItem: key => map.get(key) ?? null, setItem(key, value) { if (this.fail) throw new Error('synthetic-quota'); map.set(key, value); },
        removeItem: key => map.delete(key) };
}
function locks()
{
    const held = new Set();
    return { async request(name, options, callback) {
        if (held.has(name)) return callback(null);
        held.add(name); try { return await callback({ name }); } finally { held.delete(name); }
    } };
}
function fixture(options = {})
{
    const local = options.local || storage(), session = options.session || storage();
    const sent = [], messages = [], timers = [], status = { className: '', innerHTML: '' };
    const card = { id: 'SC-ST-A-1', spieltagId: 'ST', spielerId: 'A', hole: 1, flightSeq: 1, strokes: 5, puts: 3, lady: true, hcpStart: 26, strokesGiven: 2 };
    const c = { crypto, structuredClone, console: { log() {}, warn() {}, error() {} }, navigator: { onLine: true, locks: options.locks || locks() },
        localStorage: local, sessionStorage: session, document: { getElementById: id => id === 'score-sync-status' ? status : null },
        window: { addEventListener() {} }, setTimeout: f => { timers.push(f); return timers.length; }, clearTimeout() {}, setInterval: () => 1,
        app: { environment: { assertReady() {} }, logic: {}, state: { currentUser: { id: 'A', role: 'Spieler' },
            flights: [{ id: 'FL-ST-1', seq: 1, spieltagId: 'ST', spielerIdsCsv: 'A,B' }],
            spieltage: [{ id: 'ST', kursId: 'K', status: 'Aktiv', rundenTyp: '18', bahnAnzahl: 18 }],
            spieler: [{ id: 'A', hcpLIE: 26 }, { id: 'B', hcpLIE: 26 }], scoreCards: options.empty ? [] : [card], liveScores: {} } } };
    vm.createContext(c);
    for (const file of ['App_Logic_Scores.js', 'App_Logic_Spieltage.js'])
        vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), c, { filename: file });
    c.app.logic.showToast = (message, kind) => messages.push({ message, kind });
    c.app.logic.calculateHoleVorgabe = () => 2;
    let transport = async payload => ack(payload);
    c.app.logic.apiRequest = async (action, payload) => { assert.equal(action, 'saveLiveScores'); sent.push(payload); return transport(payload); };
    c.app.logic.initScoreAutoSync('ST');
    return { c, sent, messages, local, session, status, timers, transport(fn) { transport = fn; },
        edit(key, value) { if (value === undefined) delete c.app.state.liveScores[key]; else c.app.state.liveScores[key] = value; return c.app.logic.markScorePending('ST', key); },
        async sync() { await c.app.logic.syncScoresWithServer('ST', 1, true); await tick(); } };
}
function ids(payload) { return (payload.payload || []).flatMap(card => (card.changes || []).map(op => op.changeId)); }
function ack(payload, selected = ids(payload)) { return { success: true, requestId: payload.requestId, acknowledgedChangeIds: selected }; }
function changes(payload) { return (payload.payload || []).flatMap(card => card.changes || Object.entries(card).filter(([k]) => ['strokes', 'puts', 'lady', 'maxscore'].includes(k)).map(([field, value]) => ({ field, value }))); }
test('SY01 old ACK cannot clear newer 6; reload retains it and next ACK confirms it', async () =>
{
    const f = fixture(); let release;
    f.transport(payload => new Promise(resolve => { release = () => resolve(ack(payload)); }));
    f.edit('ST_A_1', 5); const running = f.c.app.logic.syncScoresWithServer('ST', 1, true); await tick();
    f.edit('ST_A_1', 6); release(); await running; await tick();
    assert.ok(f.c.app.state.pendingScoreKeys.ST_A_1, '6 must remain pending');
    const reload = fixture({ local: f.local, session: f.session });
    assert.equal(reload.c.app.state.liveScores.ST_A_1, 6);
    await reload.sync(); assert.equal(Object.keys(reload.c.app.state.pendingScoreKeys).length, 0);
    assert.equal(reload.c.app.state.scoreCards[0].strokes, 6);
});
test('SY02 ABA is a new change, never identified by equal value', async () =>
{
    const f = fixture(); let release;
    f.transport(payload => new Promise(resolve => { release = () => resolve(ack(payload)); }));
    f.edit('ST_A_1', 5); const before = f.c.app.state.pendingScoreKeys.ST_A_1;
    const running = f.c.app.logic.syncScoresWithServer('ST', 1, true); await tick();
    f.edit('ST_A_1', 6); f.edit('ST_A_1', 5); const after = f.c.app.state.pendingScoreKeys.ST_A_1;
    release(); await running; await tick(); assert.notEqual(after, before); assert.equal(f.c.app.state.pendingScoreKeys.ST_A_1, after);
});
test('SY03 ACK excludes unsendable putts-only card', async () =>
{
    const f = fixture(); f.edit('ST_A_1', 6); f.edit('ST_A_2_puts', 3); await f.sync();
    assert.ok(f.c.app.state.pendingScoreKeys.ST_A_2_puts); assert.equal(f.c.app.state.pendingScoreKeys.ST_A_1, undefined);
    assert.deepEqual(f.sent[0].payload.map(x => x.hole), [1]);
});
test('SY04 only intended strokes field is transmitted; existing puts/lady are preserved', async () =>
{
    const f = fixture(); f.edit('ST_A_1', 6); await f.sync();
    assert.deepEqual(changes(f.sent[0]).map(x => x.field), ['strokes']);
    assert.equal(f.c.app.state.scoreCards[0].puts, 3); assert.equal(f.c.app.state.scoreCards[0].lady, true);
});
test('SY08 explicit puts=0, false and field deletion are operations, not defaults', async () =>
{
    const f = fixture(); f.edit('ST_A_1_puts', 0); f.edit('ST_A_1_lady', false); f.edit('ST_A_1', undefined); await f.sync();
    const ops = changes(f.sent[0]);
    assert.ok(ops.some(x => x.field === 'strokes' && x.operation === 'delete' && x.value === null));
    assert.ok(ops.some(x => x.field === 'puts' && x.value === 0)); assert.ok(ops.some(x => x.field === 'lady' && x.value === false));
    assert.equal(Object.hasOwn(f.c.app.state.scoreCards[0], 'strokes'), false);
});
test('real rapid handler records clear durably and does not restore old display fallback', async () =>
{
    const f = fixture(); f.c.app.logic.updateRapidScoreState('ST', 'A', 1, 'strokes', ''); await f.sync();
    assert.ok(changes(f.sent[0]).some(x => x.field === 'strokes' && x.operation === 'delete'));
});
test('OF03 failed local persistence rejects new input, retains older durable 5 and shows error', async () =>
{
    const f = fixture(); f.edit('ST_A_1', 5); const durable = [...f.local.map]; f.local.fail = true;
    assert.equal(f.edit('ST_A_1', 6), false); assert.deepEqual([...f.local.map], durable);
    const reload = fixture({ local: f.local, session: f.session }); assert.equal(reload.c.app.state.liveScores.ST_A_1, 5);
    assert.match(f.status.innerHTML, /fehler|nicht gespeichert/i); assert.doesNotMatch(f.status.innerHTML, /Synchronisiert|serverbestätigt/i);
});
test('SY06 partial ACK removes only identified operations and blocks ambiguous remainder', async () =>
{
    const f = fixture(); f.edit('ST_A_1', 6); f.edit('ST_A_1_puts', 2);
    f.transport(p => ack(p, ids(p).slice(0, 1))); await f.sync();
    assert.equal(Object.keys(f.c.app.state.pendingScoreKeys).length, 1);
    const calls = f.sent.length; await f.sync(); assert.equal(f.sent.length, calls, 'no blind retry after partial unknown result');
});
test('SY05 lost ACK is durable unknown outcome, never automatically replays stale request after reload', async () =>
{
    const f = fixture(); f.edit('ST_A_1', 5); f.transport(async () => { throw new Error('reply-lost-after-commit'); }); await f.sync();
    const reload = fixture({ local: f.local, session: f.session }); await reload.sync();
    assert.equal(reload.sent.length, 0); assert.ok(reload.c.app.state.pendingScoreKeys.ST_A_1); assert.match(reload.status.innerHTML, /unklar|gesperrt|Konflikt/i);
});
test('known no-write transport failure retains operations and permits safe next attempt', async () =>
{
    const f = fixture(); f.edit('ST_A_1', 6);
    f.transport(async p => ({ success: false, requestId: p.requestId, definitelyNotApplied: true, retryable: true })); await f.sync();
    assert.ok(f.c.app.state.pendingScoreKeys.ST_A_1); f.transport(async p => ack(p)); await f.sync();
    assert.equal(Object.keys(f.c.app.state.pendingScoreKeys).length, 0);
});
test('late ACK updates only original durable owner; never another users RAM or buffer', async () =>
{
    const f = fixture(); let release; f.edit('ST_A_1', 6);
    f.transport(p => new Promise(resolve => { release = () => resolve(ack(p)); }));
    const running = f.c.app.logic.syncScoresWithServer('ST', 1, true); await tick();
    f.c.app.state.currentUser = { id: 'B', role: 'Spieler' }; f.c.app.logic.restoreLocalScoreBuffer(); f.edit('ST_B_1', 7);
    const other = JSON.stringify(f.c.app.state.pendingScoreKeys); release(); await running; await tick();
    assert.equal(JSON.stringify(f.c.app.state.pendingScoreKeys), other); assert.equal(f.c.app.state.liveScores.ST_B_1, 7);
});
test('immutable request captures exact operation IDs and is frozen before transport', async () =>
{
    const f = fixture(); f.edit('ST_A_1', 6); await f.sync();
    assert.ok(ids(f.sent[0]).every(x => typeof x === 'string' && x.length > 12)); assert.equal(ids(f.sent[0]).length, 1);
    assert.ok(Object.isFrozen(f.sent[0])); assert.ok(Object.isFrozen(f.sent[0].payload[0].changes[0]));
});
test('independent tabs cannot overwrite each others accepted durable journal operations', () =>
{
    const local = storage(), lock = locks(), a = fixture({ local, locks: lock }), b = fixture({ local, locks: lock });
    a.edit('ST_A_1', 6); b.edit('ST_A_2', 7);
    const reload = fixture({ local }); assert.equal(reload.c.app.state.liveScores.ST_A_1, 6); assert.equal(reload.c.app.state.liveScores.ST_A_2, 7);
});
test('no cross-tab locking capability => safe send block, durable input retained', async () =>
{
    const f = fixture(); delete f.c.navigator.locks; f.edit('ST_A_1', 6); await f.sync();
    assert.equal(f.sent.length, 0); assert.ok(f.c.app.state.pendingScoreKeys.ST_A_1);
});
module.exports = { fixture, storage, locks, ack, ids, changes };
