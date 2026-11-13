'use strict';
window.scoreScreenTests = (async function()
{
    let checks = 0;
    const writes = { v1: 0, v2: 0 };
    function forbidden(kind)
    {
        return function()
        {
            writes[kind]++;
            throw new Error('Forbidden score transport ' + kind);
        };
    }
    function check(value, label)
    {
        if (!value)
        {
            throw new Error(label);
        }
        checks++;
    }
    function frame()
    {
        return new Promise(function(resolve)
        {
            requestAnimationFrame(function()
            {
                requestAnimationFrame(resolve);
            });
        });
    }
    const namespace = 'phase-c-' + innerWidth;
    const reloaded = sessionStorage.getItem(namespace) === 'reload';
    let offline = reloaded;
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: function()
    {
        return !offline;
    } });
    const fixture = scoreEntryFixtureData();
    const v1 = '{"liveScores":{"ST_A_1":99},"pendingScoreKeys":{"ST_A_1":123}}';
    if (!reloaded)
    {
        localStorage.setItem('lie_score_sync_v1', v1);
    }
    app.state = { currentUser: { id: 'A', role: 'Spieler' }, flights: [
        { id: fixture.flightId, spieltagId: 'ST', spielerIdsCsv: 'A,B,C,D' }],
        liveScores: { ST_A_1: 99 }, pendingScoreKeys: { ST_A_1: 123 } };
    app.logic = app.logic || {};
    app.logic.syncScoresWithServer = forbidden('v1');
    app.logic.initScoreAutoSync = forbidden('v1');
    app.logic.markScorePending = forbidden('v1');
    app.logic.syncAllPendingScoreFlights = forbidden('v1');
    app.logic.apiRequest = forbidden('v1');
    app.scoreSyncV2CallableTransport = forbidden('v2');
    app.createFirebaseScoreSyncV2Adapter = function()
    {
        return { sync: forbidden('v2'), retry: forbidden('v2') };
    };
    const errors = [];
    app.logic.showToast = function(message)
    {
        errors.push(message);
    };
    app.scoreSyncStore = app.createScoreSyncStore(namespace);
    const realAppend = app.scoreSyncStore.appendChanges;
    let failAppend = false;
    let delayAppend = null;
    let appendStarted = null;
    const store = Object.assign({}, app.scoreSyncStore, { appendChanges: async function(c, changes)
    {
        if (appendStarted)
        {
            appendStarted();
        }
        if (delayAppend)
        {
            await delayAppend;
        }
        if (failAppend)
        {
            throw new Error('Injected IndexedDB failure');
        }
        return realAppend(c, changes);
    } });
    const contexts = app.createScoreEntryContextStore(namespace + '-context');
    app.scoreEntryV2Controller = app.createScoreEntryV2Controller(
    {
        store: store, contextStore: contexts,
        getIdentity: async function()
        {
            return { ownerUid: app.state.currentUser.id, playerId: app.state.currentUser.id };
        },
        getState: function()
        {
            return app.state;
        },
        readTransport: async function()
        {
            check(!offline, 'offline open never calls read transport');
            return structuredClone(fixture);
        },
        calculateAllowance: app.calculateScoreEntryAllowanceV2
    });
    const c = { ownerUid: 'A', playerId: 'A', spieltagId: 'ST', flightId: fixture.flightId };
    app.views.dashboard = function()
    {
        return '<p>Andere View</p>';
    };
    app.logic.startLivePolling = forbidden('v1');
    async function navigate(hole)
    {
        app.router.navigate('score_eingabe', { id: 'ST', hole: hole, flightSeq: 99 });
        await app.logic.scoreScreenReady;
        await frame();
        check(document.querySelector('.lie-player'), 'score screen ready');
    }
    let lastInput;
    const input = app.logic.scoreScreenInput;
    app.logic.scoreScreenInput = function()
    {
        lastInput = input.apply(null, arguments);
        return lastInput;
    };
    async function click(id)
    {
        document.getElementById(id).click();
        await lastInput;
        await frame();
    }
    function entry(id, hole = 1)
    {
        return app.logic.scoreScreenEntry(app.logic.scoreScreenContext('ST', hole), id, hole);
    }
    await navigate(1);
    if (!reloaded)
    {
        check(entry('A').strokes === 4 && !entry('A').confirmed, 'V1 values ignored, defaults open');
        check((await store.inspect(c)).pendingOperations.length === 0, 'render writes no operations');
        await click('lie-lady-D');
        check(!entry('D').confirmed && entry('D').lady, 'Lady only remains open');
        await click('lie-avatar-A');
        check(entry('A').confirmed && entry('A').strokes === 4 && entry('A').puts === 2, 'avatar complete score');
        document.getElementById('lie-strokes-plus-A').click();
        const plus1 = lastInput;
        document.getElementById('lie-strokes-plus-A').click();
        const plus2 = lastInput;
        document.getElementById('lie-strokes-minus-A').click();
        await Promise.all([plus1, plus2, lastInput]);
        check(entry('A').strokes === 5, 'rapid +/+/- deterministic');
        await click('lie-puts-minus-A');
        check(entry('A').puts === 1, 'putts change');
        await click('lie-strokes-plus-A');
        check(entry('A').strokes === 6, 'manual 6/1');
        await click('lie-lady-A');
        for (const id of ['B','C','D'])
        {
            await click('lie-avatar-' + id);
        }
        check(app.logic.scoreScreenHoleState(app.logic.scoreScreenContext('ST', 1), 1) === 'complete', 'hole complete');
        window.scrollTo(0, document.documentElement.scrollHeight);
        await frame();
        function geometry()
        {
            return JSON.stringify(Array.from(document.querySelectorAll('.lie-player, .lie-stepper, .lie-hole-sticky, .lie-round-nav')).map(function(node)
            {
                const r = node.getBoundingClientRect();
                return [r.x,r.y,r.width,r.height];
            }));
        }
        for (const enabled of [true,false])
        {
            const before = geometry();
            const y = scrollY;
            await click('lie-strich-A');
            check(entry('A').confirmed === enabled && entry('A').strokes === (enabled ? 7 : 4)
                && entry('A').puts === (enabled ? 3 : 2) && entry('A').lady, 'Strich semantics');
            check(geometry() === before && scrollY === y, 'Strich geometry and scroll unchanged');
        }
        check(app.logic.scoreScreenHoleState(app.logic.scoreScreenContext('ST', 1), 1) === 'open', 'Strich reopens hole');
        await navigate(2);
        check(document.querySelector('[aria-label="Loch 1, verlassen, unvollständig"]'), 'incomplete hole marker');
        await navigate(1);
        check(!entry('A').confirmed && entry('A').puts === 2, 'view switch retains deletes');
        // Delayed append is committed to hole 1, never painted over hole 2.
        let release;
        let start;
        const started = new Promise(function(resolve)
        {
            start = resolve;
        });
        appendStarted = start;
        delayAppend = new Promise(function(resolve)
        {
            release = resolve;
        });
        document.getElementById('lie-strokes-plus-B').click();
        const pending = lastInput;
        await started;
        await navigate(2);
        release();
        await pending;
        appendStarted = null;
        delayAppend = null;
        check(app.state.scoreScreenContext.hole === 2 && !entry('B',2).confirmed, 'late old-hole result cannot replace selected hole');
        await navigate(1);
        check(entry('B').strokes === 5, 'old-hole commit retained');
        failAppend = true;
        await click('lie-strokes-plus-B');
        check(entry('B').strokes === 5 && errors.some(function(message)
        {
            return message.includes('nicht gespeichert');
        }), 'failed append not falsely confirmed');
        failAppend = false;
        await click('lie-strokes-plus-B');
        check(entry('B').strokes === 6, 'queue recovers after append failure');
        // Real router view leave during a pending append; return reloads the context.
        let releaseView;
        let startView;
        const viewStarted = new Promise(function(resolve)
        {
            startView = resolve;
        });
        appendStarted = startView;
        delayAppend = new Promise(function(resolve)
        {
            releaseView = resolve;
        });
        document.getElementById('lie-puts-plus-B').click();
        const viewPending = lastInput;
        await viewStarted;
        app.router.navigate('dashboard');
        releaseView();
        await viewPending;
        appendStarted = null;
        delayAppend = null;
        check(!document.querySelector('.lie-player'), 'late result does not replace another view');
        await navigate(1);
        check(entry('B').puts === 3, 'committed append survives real router view leave/return');
        let releaseUser;
        let startUser;
        const userStarted = new Promise(function(resolve)
        {
            startUser = resolve;
        });
        appendStarted = startUser;
        delayAppend = new Promise(function(resolve)
        {
            releaseUser = resolve;
        });
        document.getElementById('lie-strokes-plus-C').click();
        const userPending = lastInput;
        await userStarted;
        app.state.currentUser = { id: 'B', role: 'Spieler' };
        app.router.navigate('dashboard');
        releaseUser();
        await userPending;
        appendStarted = null;
        delayAppend = null;
        check(!document.querySelector('.lie-player'), 'user switch cannot receive old screen result');
        const originalPartition = await store.inspect(c);
        check(originalPartition.pendingOperations.some(function(op)
        {
            return op.spielerId === 'C' && op.field === 'strokes' && op.value === 5 && op.ownerUid === 'A';
        }), 'committed user-change operation remains in A partition');
        app.state.currentUser = { id: 'A', role: 'Spieler' };
        await navigate(1);
        check(entry('C').strokes === 5, 'returning owner recovers committed input');
        // Leave A open and D Lady-only on hole 2 for full offline reload.
        await navigate(2);
        await click('lie-lady-D');
        await navigate(1);
        const count = (await store.inspect(c)).pendingOperations.length;
        await navigate(2);
        await navigate(1);
        check((await store.inspect(c)).pendingOperations.length === count, 'rerenders add no operations');
        check(localStorage.getItem('lie_score_sync_v1') === v1, 'V1 buffer byte-identical');
        check(writes.v1 === 0 && writes.v2 === 0, 'zero score transport calls');
        sessionStorage.setItem(namespace, 'reload');
        await store.close();
        await contexts.close();
        return { stage: 'reload', checks: checks };
    }
    check(!entry('A').confirmed && entry('A').strokes === 4 && entry('A').puts === 2 && entry('A').lady,
        'Strich AUS survives full offline reload');
    check(entry('B').strokes === 6, 'completed changes survive full offline reload');
    await navigate(2);
    check(entry('D',2).lady && !entry('D',2).confirmed, 'Lady-only survives reload open');
    await click('lie-strokes-plus-D');
    check(entry('D',2).strokes === 5, 'offline edit persistent');
    await navigate(1);
    await click('lie-avatar-A');
    check(app.logic.scoreScreenHoleState(app.logic.scoreScreenContext('ST',1),1) === 'complete', 'avatar completes reopened hole');
    const cards = Array.from(document.querySelectorAll('.lie-player'));
    check(cards.length === 4, 'four cards');
    check(cards.map(function(card)
    {
        return card.querySelector('.lie-player-position').textContent;
    }).join(',') === '1,2,3,4', 'position axis');
    for (const card of cards)
    {
        const r = card.getBoundingClientRect();
        check(r.height >= 142 && r.height <= 146, 'card geometry');
        check(card.querySelector('.lie-avatar').getBoundingClientRect().width === 48, 'avatar touch width');
        check(card.querySelector('.lie-avatar span').getBoundingClientRect().width === 34, 'badge geometry');
        check(getComputedStyle(card).borderTopColor === 'rgb(216, 224, 229)', 'card edge');
    }
    for (const button of document.querySelectorAll('.lie-stepper button'))
    {
        const r = button.getBoundingClientRect();
        check(r.width >= 44 && r.height >= 48, 'stepper touch');
    }
    for (const label of document.querySelectorAll('.lie-checkboxes label'))
    {
        check(label.getBoundingClientRect().height >= 44, 'Lady/Strich touch');
    }
    const sticky = document.querySelector('.lie-hole-sticky');
    const nav = document.querySelector('.lie-round-nav');
    check(sticky.contains(document.querySelector('.lie-progress')) && sticky.contains(document.querySelector('.lie-hole-context')), 'shared sticky');
    check(getComputedStyle(sticky).backgroundColor === 'rgb(247, 248, 250)' && Number(getComputedStyle(sticky).zIndex) === 20, 'opaque sticky stack');
    check(nav.getBoundingClientRect().height >= 50, 'bottom touch size');
    check(getComputedStyle(nav.querySelector('.lie-next')).backgroundColor === 'rgb(8, 127, 59)', 'primary bottom green');
    window.scrollTo(0, document.documentElement.scrollHeight);
    await frame();
    check(cards[3].getBoundingClientRect().bottom <= nav.getBoundingClientRect().top, 'fourth card clears footer');
    check(sticky.getBoundingClientRect().top >= document.querySelector('header').getBoundingClientRect().bottom, 'sticky clears global header');
    check(sticky.getBoundingClientRect().bottom < nav.getBoundingClientRect().top, 'sticky/footer do not collide');
    window.scrollTo(0,0);
    const players = app.state.scoreEntryV2.response.players;
    players[2].nickname = 'AlexandervonderLangenNamensfamilie';
    players[3].nickname = 'Maximilian mit einem sehr langen Spielernamen';
    players[0].avatarUrl = 'https://example.invalid/photo.png';
    await navigate(1);
    const photo = document.querySelector('.lie-avatar img');
    check(photo, 'photo element');
    photo.hidden = false;
    check(photo.getBoundingClientRect().width === 34, 'photo badge');
    photo.dispatchEvent(new Event('error'));
    check(photo.hidden && document.querySelector('.lie-avatar span').textContent === 'AN', 'broken photo fallback');
    check(document.documentElement.scrollWidth <= innerWidth, 'long names no overflow');
    for (const heading of document.querySelectorAll('.lie-player-heading'))
    {
        check(heading.querySelector('h3').getBoundingClientRect().bottom <= heading.querySelector('.lie-player-status').getBoundingClientRect().top, 'name above status');
    }
    delete players[0].avatarUrl;
    players[2].nickname = 'Chris';
    players[3].nickname = 'Dora';
    await navigate(1);
    check(localStorage.getItem('lie_score_sync_v1') === v1, 'old V1 buffer retained after reload');
    check(writes.v1 === 0 && writes.v2 === 0, 'zero V1/V2 writes after offline reload');
    // Persisted offline edits are verified again by reopening both databases.
    await store.close();
    await contexts.close();
    app.state.scoreEntryV2 = null;
    await navigate(2);
    check(entry('D',2).strokes === 5, 'offline append survives database reopen');
    await navigate(1);
    const emptyQueue = app.createScoreSyncStore(namespace + '-unknown-basis');
    const offlineController = app.createScoreEntryV2Controller(
    {
        store: emptyQueue, contextStore: contexts,
        getIdentity: async function()
        {
            return { ownerUid: 'A', playerId: 'A' };
        },
        getState: function()
        {
            return { currentUser: { id: 'A' }, flights: [] };
        },
        readTransport: forbidden('v2'), calculateAllowance: app.calculateScoreEntryAllowanceV2
    });
    await offlineController.open({ spieltagId: 'ST', offline: true });
    await offlineController.action('A', 1, 'strokes', 1);
    const unknownRaw = await offlineController.readEntry('A',1);
    check(unknownRaw.pendingOperations.every(function(op)
    {
        return op.baseFieldRevision === null && op.baseDocumentGeneration === null;
    }), 'offline unknown server basis never invented');
    check((await emptyQueue.inspect(c)).requestSnapshots.length === 0, 'unknown basis never produces send snapshot');
    const foreignController = app.createScoreEntryV2Controller(
    {
        store: emptyQueue, contextStore: contexts,
        getIdentity: async function()
        {
            return { ownerUid: 'B', playerId: 'B' };
        },
        getState: function()
        {
            return { currentUser: { id: 'B' }, flights: [] };
        },
        readTransport: forbidden('v2')
    });
    let refused = false;
    try
    {
        await foreignController.open({ spieltagId: 'ST', offline: true });
    }
    catch (error)
    {
        refused = true;
    }
    check(refused, 'foreign user cannot reuse A offline context');
    await emptyQueue.close();
    return { stage: 'done', checks: checks, writes: writes };
})();
