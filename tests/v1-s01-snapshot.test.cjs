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
    assert.deepEqual(Array.from(f.sent[0].payload).map(x => x.hole), [1]);
});
test('SY04 only intended strokes field is transmitted; existing puts/lady are preserved', async () =>
{
    const f = fixture(); f.edit('ST_A_1', 6); await f.sync();
    assert.deepEqual(Array.from(changes(f.sent[0])).map(x => x.field), ['strokes']);
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
test('request-persist failure sends nothing and retains durable input', async () => {
    const f = fixture(); f.edit('ST_A_1', 6); f.local.fail = true; await f.sync();
    assert.equal(f.sent.length, 0); assert.ok(f.c.app.state.pendingScoreKeys.ST_A_1);
    f.local.fail = false; assert.equal(fixture({ local: f.local, session: f.session }).c.app.state.liveScores.ST_A_1, 6);
});
test('ACK-persist failure cannot display serverconfirmed or replay on reload', async () => {
    const f = fixture(); f.edit('ST_A_1', 6); f.transport(async p => { f.local.fail = true; return ack(p); }); await f.sync();
    assert.ok(f.c.app.state.pendingScoreKeys.ST_A_1); assert.doesNotMatch(f.status.innerHTML, /Serverbestätigt/);
    f.local.fail = false; const reload = fixture({ local: f.local, session: f.session }); await reload.sync(); assert.equal(reload.sent.length, 0);
});
for (const kind of ['wrong-request', 'foreign-id', 'duplicate-id']) test('malformed ACK ' + kind + ' retains and blocks pending', async () => {
    const f = fixture(); f.edit('ST_A_1', 6); f.transport(async p => {
        const r = ack(p); if (kind === 'wrong-request') r.requestId = 'wrong';
        else if (kind === 'foreign-id') r.acknowledgedChangeIds = ['foreign']; else r.acknowledgedChangeIds.push(r.acknowledgedChangeIds[0]); return r;
    }); await f.sync(); await f.sync(); assert.equal(f.sent.length, 1); assert.ok(f.c.app.state.pendingScoreKeys.ST_A_1);
});
test('same-field edits from independent tabs preserve both records and block sending', async () => {
    const local = storage(), lock = locks(), a = fixture({ local, locks: lock }), b = fixture({ local, locks: lock });
    a.edit('ST_A_1', 6); b.edit('ST_A_1', 7); await b.sync();
    assert.equal(b.sent.length, 0); assert.equal(b.c.app.state.v1Journal.read().active.length, 2);
    assert.match(b.status.innerHTML, /Konflikt|gesperrt/);
});
test('same owner tabs cannot overlap flight requests', async () => {
    const local = storage(), lock = locks(), a = fixture({ local, locks: lock }), b = fixture({ local, locks: lock }); let release;
    a.edit('ST_A_1', 6); a.transport(p => new Promise(resolve => { release = () => resolve(ack(p)); }));
    const running = a.c.app.logic.syncScoresWithServer('ST', 1, true); await tick(); b.edit('ST_A_2', 7); await b.sync();
    assert.equal(b.sent.length, 0); release(); await running; await b.sync(); assert.equal(b.sent.length, 1);
});
test('legacy owner bundle stays quarantined and cannot be accidentally acknowledged', async () => {
    const raw = JSON.stringify({ owner: 'A', liveScores: { ST_A_1: 9 }, pendingScoreKeys: { ST_A_1: 1 } });
    const local = storage(new Map([['lie_score_sync_v1__local:demo-lie-scorecards-local__A', raw]])); const f = fixture({ local });
    await f.sync(); assert.equal(f.sent.length, 0); assert.equal(local.getItem('lie_score_sync_v1__local:demo-lie-scorecards-local__A'), raw);
});
test('Strich on/off is atomic, explicit, retains V1 off=>par and leaves puts untouched', async () => {
    const f = fixture(); f.c.app.logic.toggleMaxScore('ST','A',1,8,4,2);
    assert.equal(f.c.app.state.liveScores.ST_A_1, 8); assert.equal(f.c.app.state.liveScores.ST_A_1_maxscore, true); await f.sync();
    f.c.app.logic.toggleMaxScore('ST','A',1,8,4,2); await f.sync();
    assert.equal(f.c.app.state.scoreCards[0].strokes, 4); assert.equal(f.c.app.state.scoreCards[0].maxscore, false); assert.equal(f.c.app.state.scoreCards[0].puts, 3);
});
test('quota failure cannot accept half a Strich compound action', () => {
    const f = fixture(); f.edit('ST_A_1', 5); f.local.fail = true;
    assert.equal(f.c.app.logic.toggleMaxScore('ST','A',1,8,4,2), false); f.local.fail = false;
    const reload = fixture({ local: f.local, session: f.session }); assert.equal(reload.c.app.state.liveScores.ST_A_1, 5);
    assert.equal(reload.c.app.state.liveScores.ST_A_1_maxscore, undefined); assert.match(f.status.innerHTML, /Speicherfehler/);
});
test('flight/round changes while an ACK waits cannot acknowledge another context', async () => {
    const f = fixture(); let release; f.edit('ST_A_1', 6);
    f.transport(p => new Promise(resolve => { release = () => resolve(ack(p)); })); const running = f.c.app.logic.syncScoresWithServer('ST',1,true); await tick();
    f.c.app.state.activeScoreSpieltagId = 'OTHER'; f.c.app.state.flights[0].seq = 2;
    f.c.app.state.liveScores.OTHER_A_1 = 7; f.c.app.logic.markScorePending('OTHER', 'OTHER_A_1');
    release(); await running; assert.ok(f.c.app.state.pendingScoreKeys.OTHER_A_1); assert.equal(f.c.app.state.liveScores.OTHER_A_1, 7);
});
for (const seq of [0, -1, '1junk', 1.5]) test('Hotfix port: invalid flight ' + seq + ' never writes or ACKs', async () => {
    const f = fixture(); f.edit('ST_A_1', 6); await f.c.app.logic.syncScoresWithServer('ST', seq, true);
    assert.equal(f.sent.length, 0); assert.ok(f.c.app.state.pendingScoreKeys.ST_A_1);
});
for (const kind of ['duplicate-seq', 'duplicate-membership', 'duplicate-card', 'foreign-card']) test('Hotfix port: reject ambiguous ' + kind, async () => {
    const f = fixture(); f.edit('ST_A_1', 6);
    if (kind === 'duplicate-seq') f.c.app.state.flights.push({ ...f.c.app.state.flights[0], id: 'other' });
    if (kind === 'duplicate-membership') f.c.app.state.flights.push({ ...f.c.app.state.flights[0], id: 'other', seq: 2 });
    if (kind === 'duplicate-card') f.c.app.state.scoreCards.push({ ...f.c.app.state.scoreCards[0] });
    if (kind === 'foreign-card') f.c.app.state.scoreCards[0].spielerId = 'B';
    await f.sync(); assert.equal(f.sent.length, 0); assert.ok(f.c.app.state.pendingScoreKeys.ST_A_1);
});
test('rapid persistence rejection restores input and does not accept numeric junk', () => {
    const f = fixture(); f.edit('ST_A_1', 5); f.local.fail = true; const input = { value: '6' };
    assert.equal(f.c.app.logic.updateRapidScoreState('ST', 'A', 1, 'strokes', '6', input), false); assert.equal(input.value, 5);
    f.local.fail = false; assert.equal(f.c.app.logic.updateRapidScoreState('ST', 'A', 1, 'strokes', '6junk', input), false);
    assert.equal(f.c.app.state.liveScores.ST_A_1, 5);
});
test('manual score replaces persisted Strich via durable explicit false', async () => {
    const f = fixture(); f.c.app.logic.toggleMaxScore('ST','A',1,8,4,2); await f.sync();
    f.c.app.logic.adjustScore('ST','A',1,-1,4,2); await f.sync();
    assert.equal(f.c.app.state.scoreCards[0].strokes, 7); assert.equal(f.c.app.state.scoreCards[0].maxscore, false);
});
test('corrupt stored field context fails closed without deleting earlier evidence', async () => {
    const f = fixture(); f.edit('ST_A_1', 6); const entry = [...f.local.map.entries()].find(([key]) => key.includes('__op__'));
    const corrupt = JSON.parse(entry[1]); corrupt.field = 'puts'; f.local.setItem(entry[0], JSON.stringify(corrupt));
    const reload = fixture({ local: f.local, session: f.session }); await reload.sync();
    assert.equal(reload.sent.length, 0); assert.match(reload.status.innerHTML, /Speicherfehler/); assert.equal(f.local.map.has(entry[0]), true);
});
test('ACK from one round cannot claim server confirmation in an untouched round', async () => {
    const f = fixture(); f.edit('ST_A_1', 6); await f.sync(); f.c.app.state.activeScoreSpieltagId = 'OTHER';
    f.c.app.logic.updateScoreSyncStatus('OTHER'); assert.doesNotMatch(f.status.innerHTML, /Serverbestätigt/);
});
test('Hotfix port: status DOM exception releases request counter and flight lock', async () => {
    const f = fixture(); f.edit('ST_A_1', 6); const render = f.c.app.logic.updateScoreSyncStatus;
    f.c.app.logic.updateScoreSyncStatus = () => { throw new Error('synthetic DOM error'); }; await f.sync();
    assert.equal(f.c.app.state.scoreSyncInProgress, false); assert.equal(f.c.app.state.v1RequestsRunning, 0);
    f.c.app.logic.updateScoreSyncStatus = render; f.edit('ST_A_2', 7); await f.sync();
    assert.equal(f.sent.length, 1); assert.equal(f.sent[0].payload[0].hole, 2); assert.ok(f.c.app.state.pendingScoreKeys.ST_A_1);
});
test('failed diagnostic checkpoint does not reject a successfully persisted operation', () => {
    const f = fixture(), set = f.local.setItem.bind(f.local);
    f.local.setItem = (key, value) => { if (key === f.c.app.state.v1Journal.prefix) throw new Error('synthetic checkpoint-only failure'); set(key, value); };
    assert.equal(f.edit('ST_A_1', 6), true); assert.equal(f.c.app.state.v1PersistenceError, null);
    assert.equal(fixture({ local: f.local, session: f.session }).c.app.state.liveScores.ST_A_1, 6);
});
test('real rapid renderer shows status, preserves tombstone and uses explicit flight seq', () => {
    const f = fixture(); f.edit('ST_A_1', undefined); f.c.app.views = {};
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'Views_ScoreSchnellerfassung.js'), 'utf8'), f.c);
    const html = f.c.app.views.scoreSchnellerfassungLegacyReference({ id: 'ST', flightSeq: 1 });
    assert.match(html, /id="score-sync-status"/); assert.match(html, /'strokes', this.value, this/);
    assert.match(html, /type="tel"[^>]*'ST', 'A', 1, 'strokes'[^>]*value=""/s);
    f.c.app.state.flights.push({ id: 'explicit-second-flight', seq: 2, spieltagId: 'ST', spielerIdsCsv: 'B' });
    const selected = f.c.app.views.scoreSchnellerfassungLegacyReference({ id: 'ST', flightSeq: 2 });
    assert.doesNotMatch(selected, /'ST', 'A', 1, 'strokes'/); assert.match(selected, /'ST', 'B', 1, 'strokes'/);
});

test('active rapid route is explicitly disabled and cannot accept or flush legacy input',()=>{
    const f=fixture();f.c.app.views={};vm.runInContext(fs.readFileSync(path.join(__dirname,'..','Views_ScoreSchnellerfassung.js'),'utf8'),f.c);
    const html=f.c.app.views.score_schnellerfassung({id:'ST',flightSeq:1});assert.match(html,/gesperrt/);assert.doesNotMatch(html,/oninput|Alles sichern/);assert.equal(f.sent.length,0);
});
