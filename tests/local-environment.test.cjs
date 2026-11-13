'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const { profile, PROJECT } = require('../tools/local/profile.cjs');
const { validate, create } = require('../App_Environment');
const serverGuard = require('../functions/local-guard');
const config = { projectId: PROJECT, authDomain: PROJECT + '.firebaseapp.com', apiKey: 'local-demo-key', storageBucket: PROJECT + '.appspot.com' };
const location = { hostname: '127.0.0.1', protocol: 'http:' };
function sdkFixture()
{
    const events = [];
    const auth = { useEmulator: (...args) => events.push(['auth', ...args]) };
    const db = { useEmulator: (...args) => events.push(['firestore', ...args]) };
    const functions = { useEmulator: (...args) => events.push(['functions', ...args]),
        httpsCallable: name => async data => { events.push(['call', name]); return { data }; } };
    const instance = { options: config, auth: () => auth, firestore: () => db, functions: region => { assert.equal(region, 'europe-west1'); return functions; } };
    const sdk = { apps: [], app: () => instance, initializeApp: () => { events.push(['initialize']); sdk.apps.push(instance); return instance; } };
    return { sdk, events };
}
test('invalid local profiles never initialize SDK or probe network', () =>
{
    const cases = [undefined, { ...profile({}), mode: undefined }, { ...profile({}), projectId: 'liescorecard-70c5e' },
        { ...profile({}), emulators: {} }, { ...profile({}), emulators: { ...profile({}).emulators, auth: { host: '0.0.0.0', port: 9099 } } }];
    for (const p of cases)
    {
        const { sdk, events } = sdkFixture();
        assert.throws(() => create(p, config, location, sdk, () => assert.fail('probe')));
        assert.deepEqual(events, []);
    }
    assert.throws(() => validate(profile({}), { ...config, projectId: 'liescorecard-70c5e' }, location, []));
    assert.throws(() => validate(profile({}), config, { ...location, hostname: 'example.com' }, []));
    assert.throws(() => validate(profile({}), config, location, [{ options: { projectId: 'foreign' } }]));
    assert.throws(() => validate(profile({}), { ...config, authDomain: 'liescorecard-70c5e.firebaseapp.com' }, location, []));
    assert.throws(() => profile({ LIE_AUTH_PORT: '9099', LIE_FIRESTORE_PORT: '9099' }));
    assert.throws(() => profile({ LIE_MODE: 'production' }));
    assert.throws(() => profile({ GCLOUD_PROJECT: 'liescorecard-70c5e' }));
    assert.throws(() => profile({ FIREBASE_CONFIG: JSON.stringify({ projectId: 'foreign' }) }));
});
test('readiness failure initializes nothing and has no callable fallback', async () =>
{
    const { sdk, events } = sdkFixture();
    const environment = create(profile({}), config, location, sdk, async () => { throw new Error('down'); });
    await assert.rejects(environment.start(), /down/);
    assert.throws(() => environment.callable('getLoginPlayers'));
    assert.deepEqual(events, []);
});
test('all three services connect before calls; replaced app is rejected', async () =>
{
    const { sdk, events } = sdkFixture();
    const env = create(profile({}), config, location, sdk, async () => {});
    await env.start();
    await env.callable('getLoginPlayers')({});
    assert.deepEqual(events.map(x => x[0]), ['initialize', 'auth', 'firestore', 'functions', 'call']);
    sdk.app = () => ({ options: config });
    assert.throws(() => env.callable('saveScoreOperationsV2'));
});
test('emulator outage after bootstrap blocks sending before callable transport', async () =>
{
    const { sdk, events } = sdkFixture();
    let available = true;
    const env = create(profile({}), config, location, sdk, async () => { if (!available) throw new Error('down'); });
    await env.start();
    const call = env.callable('saveScoreOperationsV2');
    available = false;
    await assert.rejects(call({}), /down/);
    assert.equal(events.some(x => x[0] === 'call'), false);
});
test('server guard rejects Cloud, ADC and partial emulator profiles before SDK load', async () =>
{
    const env = { LIE_MODE: 'local', FUNCTIONS_EMULATOR: 'true', GCLOUD_PROJECT: PROJECT,
        FIRESTORE_EMULATOR_HOST: '127.0.0.1:8088', FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099' };
    assert.equal(serverGuard.validate(env).projectId, PROJECT);
    for (const patch of [{ GCLOUD_PROJECT: 'liescorecard-70c5e' }, { LIE_MODE: undefined }, { FUNCTIONS_EMULATOR: undefined },
        { GOOGLE_APPLICATION_CREDENTIALS: 'synthetic-denied-path' }, { FIRESTORE_EMULATOR_HOST: 'remote:8088' },
        { FIREBASE_AUTH_EMULATOR_HOST: undefined }, { FIREBASE_CONFIG: JSON.stringify({ projectId: 'foreign' }) }])
        assert.throws(() => serverGuard.validate({ ...env, ...patch }));
    assert.equal(await (await serverGuard.disabledMail()).text(), '{"success":true,"delivery":"local-disabled"}');
});
test('actual startup guard failure cannot reach legacy login-list fallback', async () =>
{
    const context = { app: { logic: {}, state: {} }, window: { location, firebaseConfig: config },
        navigator: {}, console: { log() {} }, LieEnvironment: { create() { throw new Error('blocked'); } },
        firebase: {}, document: { getElementById: () => ({ textContent: '' }) } };
    vm.createContext(context);
    vm.runInContext(fs.readFileSync(path.join(root, 'App_Start.js'), 'utf8'), context);
    context.app.logic.loadLoginPlayers = () => assert.fail('Cloud fallback');
    await context.app.initStart();
});
test('existing service worker blocks startup before SDK initialization or readiness fetch', async () =>
{
    const { sdk, events } = sdkFixture();
    const context = { app: { logic: {}, state: {} }, window: { location, firebaseConfig: config, LIE_LOCAL_PROFILE: profile({}) },
        navigator: { serviceWorker: { controller: {} } }, console: { log() {} }, LieEnvironment: { create }, firebase: sdk,
        fetch: () => assert.fail('readiness must not run under an old worker'),
        document: { getElementById: () => ({ textContent: '' }) } };
    vm.createContext(context);
    vm.runInContext(fs.readFileSync(path.join(root, 'App_Start.js'), 'utf8'), context);
    context.app.initCore = async () => context.app.environment.start();
    context.app.logic.loadLoginPlayers = () => assert.fail('login fallback');
    await context.app.initStart();
    assert.deepEqual(events, []);
});
function v1Fixture(saved = {})
{
    const calls = [], timers = [], listeners = {};
    const storage = new Map(Object.entries(saved));
    const context = { console, crypto: require("node:crypto").webcrypto, sessionStorage: { getItem() {}, setItem() {} }, navigator: { onLine: true, locks: { request: async (name, options, callback) => callback({ name }) } },
        localStorage: { get length() { return storage.size; }, key: i => [...storage.keys()][i], getItem: k => storage.get(k), setItem: (k, v) => storage.set(k, v) },
        document: { getElementById: () => null }, window: { addEventListener: (n, f) => { listeners[n] = f; } },
        setTimeout: f => { timers.push(f); return timers.length; }, clearTimeout() {}, setInterval: f => { timers.push(f); },
        app: { environment: { assertReady() {} }, logic: {}, state: { currentUser: { id: 'A' }, liveScores: {}, flights: [
            { id: 'FL-1', seq: 1, spieltagId: 'ST', spielerIdsCsv: 'A' }], spieler: [{ id: 'A', hcpLIE: 26 }],
            spieltage: [{ id: 'ST' }], scoreCards: [] } } };
    vm.createContext(context);
    vm.runInContext(fs.readFileSync(path.join(root, 'App_Logic_Scores.js'), 'utf8'), context);
    context.app.logic.apiRequest = async (...args) => { calls.push(args); return { success: true }; };
    return { context, calls, timers, listeners, storage };
}
test('legacy and foreign V1 buffers are untouched and never sent by retry/reconnect', () =>
{
    const raw = JSON.stringify({ pendingScoreKeys: { ST_A_1: 1 }, liveScores: { ST_A_1: 5 } });
    const f = v1Fixture({ lie_score_sync_v1: raw });
    f.context.app.state.activeScoreSpieltagId = 'ST';
    f.context.app.logic.initScoreAutoSync('ST');
    for (const run of [...f.timers]) run();
    f.listeners.online();
    assert.equal(f.storage.get('lie_score_sync_v1'), raw);
    assert.equal(f.calls.length, 0);
    const foreign = v1Fixture({ 'lie_score_sync_v1__local:demo-lie-scorecards-local': JSON.stringify({ environment: 'foreign', owner: 'A' }) });
    foreign.context.app.logic.restoreLocalScoreBuffer();
    assert.equal(foreign.context.app.state.scoreBufferOwner, null);
});
test('V1 pending timer cannot send after user switch', () =>
{
    const f = v1Fixture();
    f.context.app.state.liveScores.ST_A_1 = 5;
    f.context.app.logic.markScorePending('ST', 'ST_A_1');
    f.context.app.state.currentUser = { id: 'B' };
    for (const run of [...f.timers]) run();
    assert.equal(f.calls.length, 0);
});
test('V1 timer sends only owner-bound local changes; reload restores that owner partition', async () =>
{
    const f = v1Fixture();
    f.context.app.logic.initScoreAutoSync('ST');
    f.context.app.logic.calculateHoleVorgabe = () => 2;
    f.context.app.state.liveScores.ST_A_1 = 5;
    f.context.app.logic.markScorePending('ST', 'ST_A_1');
    const key = 'lie_score_sync_v1_s01__local:demo-lie-scorecards-local__A';
    assert.equal(JSON.parse(f.storage.get(key)).owner, 'A');
    const reload = v1Fixture(Object.fromEntries(f.storage));
    reload.context.app.logic.restoreLocalScoreBuffer();
    assert.equal(reload.context.app.state.liveScores.ST_A_1, 5);
    for (const run of [...f.timers]) run();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(f.calls.length, 1);
    assert.equal(f.calls[0][0], 'saveLiveScores');
    assert.equal(f.calls[0][1].payload[0].spielerId, 'A');
    reload.context.app.state.currentUser = { id: 'B' };
    reload.context.app.logic.restoreLocalScoreBuffer();
    assert.equal(Object.keys(reload.context.app.state.pendingScoreKeys).length, 0);
    assert.equal(JSON.parse(reload.storage.get(key)).liveScores.ST_A_1, 5);
});
test('late V1 ACK cannot erase or persist another user partition', async () =>
{
    const f = v1Fixture();
    f.context.app.logic.initScoreAutoSync('ST');
    f.context.app.logic.calculateHoleVorgabe = () => 2;
    let complete;
    f.context.app.logic.apiRequest = () => new Promise(resolve => { complete = resolve; });
    f.context.app.state.liveScores.ST_A_1 = 5;
    f.context.app.logic.markScorePending('ST', 'ST_A_1');
    f.context.app.logic.syncScoresWithServer('ST', 1, true);
    f.context.app.state.currentUser = { id: 'B' };
    f.context.app.logic.restoreLocalScoreBuffer();
    const pending = f.context.app.state.pendingScoreKeys;
    complete({ success: true });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(f.context.app.state.pendingScoreKeys, pending);
    assert.equal(Object.keys(f.context.app.state.pendingScoreKeys).length, 0);
    assert.equal(f.storage.has('lie_score_sync_v1_s01__local:demo-lie-scorecards-local__B'), false);
    assert.equal([...f.storage.keys()].some(key => key.startsWith('lie_score_sync_v1_s01__local:demo-lie-scorecards-local__B__')), false);
});
test('local server refuses readiness when emulator is missing and does not serve secrets', async () =>
{
    const { createServer } = require('../tools/local/server.cjs');
    const net = require('node:net');
    const occupied = net.createServer();
    await new Promise(resolve => occupied.listen(0, '127.0.0.1', resolve));
    const unavailable = occupied.address().port;
    await new Promise(resolve => occupied.close(resolve));
    const p = profile({ LIE_AUTH_PORT: String(unavailable) });
    const server = createServer(p);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    try
    {
        const base = 'http://127.0.0.1:' + server.address().port;
        assert.equal((await fetch(base + '/__local/ready')).status, 503);
        assert.equal((await fetch(base + '/functions/.env.local')).status, 503);
        assert.equal((await fetch(base + '/sw.js')).status, 503);
        const response = await fetch(base + '/');
        assert.equal(response.status, 200);
        assert.match(response.headers.get('Content-Security-Policy'), /worker-src 'none'/);
    }
    finally { await new Promise(resolve => server.close(resolve)); }
});
test('network guard negative control rejects remote socket without DNS or connection', () =>
{
    const { spawnSync } = require('node:child_process');
    const result = spawnSync(process.execPath, ['-e', "require('./tools/local/network-guard.cjs');try{require('node:net').connect(443,'script.google.com');process.exit(2)}catch(e){process.exit(e.message.includes('blocked')?0:3)}"], { cwd: root });
    assert.equal(result.status, 0);
});
