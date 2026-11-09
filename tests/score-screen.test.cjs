'use strict';
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');
const { scoreEntryFixtureData } = require('./score-entry-fixture.cjs');

async function fixture(type)
{
    const data = scoreEntryFixtureData(type);
    const app = {};
    vm.runInNewContext(fs.readFileSync('App_Logic_ScoreEntryV2.js', 'utf8'),
        { app: app, LieHcpRules:require("../functions/hcp-rules"), structuredClone: structuredClone });
    const cache = new Map();
    const operations = [];
    const batches = [];
    let fail = false;
    let block;
    const state = { currentUser: { id: 'A' }, flights: [{ id: data.flightId, spieltagId: 'ST', spielerIdsCsv: 'A,B,C,D' }] };
    const store = {
        readScorecard: async function(c)
        {
            const displayed = Object.assign({}, cache.get(c.documentId));
            operations.filter(function(op)
            {
                return op.documentId === c.documentId;
            }).forEach(function(op)
            {
                if (op.operation === 'delete')
                {
                    delete displayed[op.field];
                }
                else
                {
                    displayed[op.field] = op.value;
                }
            });
            return { displayed: displayed, pendingOperations: operations.filter(function(op)
            {
                return op.documentId === c.documentId;
            }) };
        },
        putServerSnapshot: async function(c, values)
        {
            cache.set(c.documentId, values);
        },
        appendChanges: async function(c, changes)
        {
            if (block)
            {
                await block;
            }
            if (fail)
            {
                throw new Error('IndexedDB failure');
            }
            batches.push(structuredClone(changes));
            changes.forEach(function(change)
            {
                operations.push(Object.assign({}, c, change));
            });
        }
    };
    const controller = app.createScoreEntryV2Controller({ store: store,
        getIdentity: async function()
        {
            return { ownerUid: state.currentUser.id, playerId: state.currentUser.id };
        },
        getState: function()
        {
            return state;
        }, readTransport: async function()
        {
            return data;
        },
        calculateAllowance: app.calculateScoreEntryAllowanceV2 });
    await controller.open({ spieltagId: 'ST' });
    return { controller, data, operations, batches, state, store, app,
        fail: function()
        {
            fail = true;
        }, block: function(promise)
        {
            block = promise;
        },
        entry: async function(id = 'A', hole = data.round.holes[0])
        {
            return structuredClone(controller.project(await controller.readEntry(id, hole), data.round.holeData.find(function(item)
            {
                return item.nr === hole;
            })));
        },
        input: function(action, delta = 0, id = 'A', hole = data.round.holes[0])
        {
            return controller.action(id, hole, action, delta);
        } };
}

test('open/render/read defaults create no operations', async function()
{
    const f = await fixture();
    assert.deepEqual(await f.entry(), { confirmed: false, strokes: 4, puts: 2, lady: false, maxscore: false });
    await f.controller.readAll();
    assert.equal(f.operations.length, 0);
});

for (const [action, delta, strokes, puts] of [['confirm',0,4,2], ['strokes',1,5,2], ['strokes',-1,3,2], ['puts',1,4,3], ['puts',-1,4,1]])
{
    test(action + ' creates complete score in one append', async function()
    {
        const f = await fixture();
        await f.input(action, delta);
        assert.equal((await f.entry()).strokes, strokes);
        assert.equal((await f.entry()).puts, puts);
        assert.equal((await f.entry()).confirmed, true);
        assert.equal(f.batches.length, 1);
        assert.equal(f.batches[0].length, 2);
    });
}

test('Lady only; Strich exact deletes, no restoration; reconfirmation', async function()
{
    const f = await fixture();
    await f.input('lady');
    assert.equal((await f.entry()).confirmed, false);
    assert.equal(f.batches[0].length, 1);
    await f.input('strokes', 1);
    await f.input('strokes', 1);
    await f.input('puts', -1);
    await f.input('strich');
    assert.deepEqual(f.batches.at(-1).map(function(op)
    {
        return [op.field, op.value];
    }),
        [['strokes',7],['puts',3],['maxscore',true]]);
    await f.input('strich');
    assert.deepEqual(f.batches.at(-1).map(function(op)
    {
        return [op.field, op.operation, op.value];
    }),
        [['strokes','delete',null],['puts','delete',null],['maxscore','set',false]]);
    assert.deepEqual(await f.entry(), { confirmed: false, strokes: 4, puts: 2, lady: true, maxscore: false });
    await f.input('lady');
    assert.equal((await f.entry()).confirmed, false);
    await f.input('confirm');
    assert.equal((await f.entry()).confirmed, true);
});

test('rapid queued actions use latest persisted projection', async function()
{
    const f = await fixture();
    await Promise.all([f.input('strokes',1), f.input('strokes',1), f.input('strokes',-1)]);
    assert.equal((await f.entry()).strokes, 5);
    await Promise.all([f.input('puts',1), f.input('puts',1), f.input('puts',-1)]);
    assert.equal((await f.entry()).puts, 3);
    await Promise.all([f.input('strich'), f.input('strich')]);
    assert.equal((await f.entry()).confirmed, false);
});

for (const round of ['18', '9', '9-Front', '9-Back'])
{
    test('maximum unchanged ' + round, async function()
    {
        const f = await fixture(round);
        await f.input('strich');
        assert.equal((await f.entry()).strokes, 7);
    });
}

test('manual strokes cancel maxscore; lower bounds retained', async function()
{
    const f = await fixture();
    await f.input('strich');
    await f.input('strokes', -1);
    assert.equal((await f.entry()).maxscore, false);
    for (let i = 0; i < 10; i++)
    {
        await f.input('strokes', -1);
        await f.input('puts', -1);
    }
    assert.equal((await f.entry()).strokes, 1);
    assert.equal((await f.entry()).puts, 0);
});

test('foreign targets, context/user switches and invalid actions rejected', async function()
{
    const f = await fixture();
    await assert.rejects(f.input('strokes', 1, 'OUTSIDE'));
    await assert.rejects(f.input('strokes', 1, 'A', 19));
    await assert.rejects(f.input('evil'));
    await assert.rejects(f.input('puts', 9));
    f.state.currentUser.id = 'B';
    await assert.rejects(f.input('confirm'));
    assert.equal(f.operations.length, 0);
});

test('append failure does not confirm and subsequent input is not lost', async function()
{
    const f = await fixture();
    f.fail();
    await assert.rejects(f.input('confirm'), /IndexedDB/);
    assert.equal((await f.entry()).confirmed, false);
    assert.equal(f.operations.length, 0);
});

test('late commit after user switch stays in original partition, no stale projection', async function()
{
    const f = await fixture();
    let release;
    let started;
    const ready = new Promise(function(resolve)
    {
        started = resolve;
    });
    const original = f.store.appendChanges;
    f.store.appendChanges = async function(c, changes)
    {
        started();
        await new Promise(function(resolve)
        {
            release = resolve;
        });
        return original(c, changes);
    };
    const pending = f.input('confirm');
    await ready;
    f.state.currentUser.id = 'B';
    release();
    await assert.rejects(pending);
    assert.ok(f.operations.every(function(op)
    {
        return op.ownerUid === 'A';
    }));
});


test('maximum distribution equals unchanged legacy calculation across handicap and round variants', async function()
{
    const sandbox = { LieHcpRules:require('../functions/hcp-rules'), app: { logic: {}, state: {} } };
    vm.runInNewContext(fs.readFileSync('App_Logic_Scores.js', 'utf8'), sandbox);
    const f = await fixture();
    for (const type of ['18', '9', '9-Front', '9-Back'])
    {
        const data = scoreEntryFixtureData(type);
        data.calculationHoles = scoreEntryFixtureData('18').round.holeData.map(function(hole)
        {
            return { nr: hole.nr, par: hole.par, si: 19 - hole.nr };
        });
        sandbox.app.state.bahnen = data.calculationHoles.map(function(hole)
        {
            return Object.assign({ kursId: 'K' }, hole);
        });
        data.handicaps = [{ kursId: 'K', vorgabe: 20, spielvorgabe: 23 }];
        sandbox.app.state.handicaps = data.handicaps;
        for (const hcp of [0,2,18,20,36,54])
        {
            data.players[0].hcpLIE = hcp;
            data.round.hcpStart.A = hcp;
            data.round.holeData=data.calculationHoles.filter(h=>data.round.holes.includes(h.nr));
            for (const hole of data.round.holes)
            {
                assert.equal(f.app.calculateScoreEntryAllowanceV2('A', hole, data),
                    sandbox.app.logic.calculateHoleVorgabe(data.players[0], data.round, hole));
            }
        }
    }
});

test('context invalidation prevents queued stale input', async function()
{
    const f = await fixture();
    f.controller.invalidate();
    await assert.rejects(f.input('confirm'));
    assert.equal(f.operations.length, 0);
});

test('round switch waits for accepted append and preserves original card', async function()
{
    const f = await fixture();
    let release;
    let started;
    const ready = new Promise(function(resolve)
    {
        started = resolve;
    });
    const original = f.store.appendChanges;
    f.store.appendChanges = async function(c, changes)
    {
        started();
        await new Promise(function(resolve)
        {
            release = resolve;
        });
        return original(c, changes);
    };
    const pending = f.input('confirm');
    await ready;
    const reopening = f.controller.open({ spieltagId: 'ST' });
    release();
    await pending;
    await reopening;
    assert.equal((await f.entry()).confirmed, true);
});

test('renderer has no V1 or V2 send calls and emitted handlers compile', async function()
{
    const f = await fixture();
    f.app.state = { currentUser: { id: 'A', role: 'Spieler' }, currentView: 'score_eingabe',
        scoreEntryV2: { status: 'ready', owner: 'A', id: 'ST', response: f.data, entries: await f.controller.readAll() } };
    f.app.logic = {};
    f.app.scoreEntryV2Controller = f.controller;
    const source = fs.readFileSync('Views_ScoreEingabe.js', 'utf8');
    assert.doesNotMatch(source, /initScoreAutoSync|markScorePending|pendingScoreKeys|scoreScreenConfirmed|scoreScreenOpen|syncScoresWithServer|saveLiveScores/);
    vm.runInNewContext(source, { app: f.app, document: { getElementById: function()
    {
        return null;
    } } });
    const html = f.app.views.score_eingabe('ST', 1);
    assert.match(html, /Spielerposition 4: Dora/);
    assert.match(html, /Noch offen/);
    for (const match of html.matchAll(/(?:onclick|onchange|onerror)="([^"]*)"/g))
    {
        const code = match[1].replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
        assert.doesNotThrow(function()
        {
            new vm.Script(code);
        });
    }
});


test('global legacy maxscore handler contract remains untouched', function()
{
    const app = { logic: {}, state: { liveScores: {}, scoreCards: [] } };
    vm.runInNewContext(fs.readFileSync('App_Logic_Scores.js', 'utf8'), { app: app, LieHcpRules:require('../functions/hcp-rules'), document: { getElementById: function()
    {
        return null;
    } } });
    app.logic.markScoreFieldsPending = function()
    {
    };
    app.state.liveScores.ST_A_1_puts = 1;
    app.logic.toggleMaxScore('ST','A',1,7,4,1);
    assert.equal(app.state.liveScores.ST_A_1, 7);
    app.logic.toggleMaxScore('ST','A',1,7,4,1);
    assert.equal(app.state.liveScores.ST_A_1, 4);
    assert.equal(app.state.liveScores.ST_A_1_puts, 1);
});

test('own-flight reorder preserves ID-based score identity', async function()
{
    const f = await fixture();
    f.state.flights[0].spielerIdsCsv = 'D,B,C,A';
    f.data.members = ['D','B','C','A'];
    f.data.players.sort(function(a,b)
    {
        return f.data.members.indexOf(a.id) - f.data.members.indexOf(b.id);
    });
    await f.controller.open({ spieltagId: 'ST' });
    await f.input('strokes', 1, 'D');
    assert.equal((await f.entry('D')).strokes, 5);
    assert.equal((await f.entry('A')).confirmed, false);
    assert.equal(f.operations[0].spielerId, 'D');
});

test('missing and ambiguous own flights reject before any score append', async function()
{
    const f = await fixture();
    f.state.flights = [];
    await assert.rejects(f.controller.open({ spieltagId: 'ST' }));
    f.state.flights = [{ id: 'F-1', spieltagId: 'ST', spielerIdsCsv: 'A' },
        { id: 'F-2', spieltagId: 'ST', spielerIdsCsv: 'A' }];
    await assert.rejects(f.controller.open({ spieltagId: 'ST' }));
    assert.equal(f.operations.length, 0);
});


test('offline app bootstrap uses only the restored Firebase UID own validated context', async function()
{
    const data = scoreEntryFixtureData();
    let currentUser = { uid: 'A' };
    let navigation;
    const app = { state: {}, router: { navigate: function(view, params)
    {
        navigation = { view, params };
    } } };
    vm.runInNewContext(fs.readFileSync('App_Logic_ScoreEntryV2.js', 'utf8'),
    {
        app: app, structuredClone: structuredClone, navigator: { onLine: false },
        firebase: { auth: function()
        {
            return { currentUser: currentUser };
        } }
    });
    app.createScoreEntryContextStore = function()
    {
        return { list: async function(uid)
        {
            return uid === 'A' ? [{ spieltagId: 'ST', response: data }] : [];
        }, close: async function()
        {
        } };
    };
    assert.equal(await app.openOfflineScoreEntryV2(currentUser), true);
    assert.equal(navigation.view, 'score_eingabe');
    assert.equal(app.state.currentUser.id, 'A');
    currentUser = { uid: 'B' };
    navigation = null;
    assert.equal(await app.openOfflineScoreEntryV2(currentUser), false);
    assert.equal(navigation, null);
});

test('escaped names and safe avatar fallback retained in V2 renderer', async function()
{
    const f = await fixture();
    f.data.players[0].nickname = 'A " <script>';
    f.data.players[0].avatarUrl = 'javascript:alert(1)';
    f.app.state = { currentUser: { id: 'A' }, currentView: 'score_eingabe',
        scoreEntryV2: { status: 'ready', owner: 'A', id: 'ST', response: f.data, entries: await f.controller.readAll() } };
    f.app.logic = {};
    f.app.scoreEntryV2Controller = f.controller;
    vm.runInNewContext(fs.readFileSync('Views_ScoreEingabe.js', 'utf8'),
        { app: f.app, document: { getElementById: function()
        {
            return null;
        } } });
    const html = f.app.views.score_eingabe('ST',1);
    assert.match(html, /&quot; &lt;script&gt;/);
    assert.doesNotMatch(html, /<img/);
    f.data.players[0].avatarUrl = 'https://example.invalid/photo.png';
    assert.match(f.app.views.score_eingabe('ST',1), /onerror="this.hidden=true"/);
});
