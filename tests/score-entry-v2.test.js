'use strict';
window.scoreEntryV2Tests = (async function()
{
    let checks = 0;
    function check(value, message)
    {
        if (!value)
        {
            throw new Error(message);
        }
        checks++;
    }
    async function rejects(work, message)
    {
        let rejected = false;
        try
        {
            await work();
        }
        catch (error)
        {
            rejected = true;
        }
        check(rejected, message);
    }
    const store = app.createScoreSyncStore('phase-b-' + crypto.randomUUID());
    const state = { currentUser: { id: 'A' }, flights: [{ id: 'F-1', spieltagId: 'ST', spielerIdsCsv: 'A,B' }] };
    let auth = { ownerUid: 'A', playerId: 'A' };
    const context = { ownerUid: 'A', playerId: 'A', spieltagId: 'ST', flightId: 'F-1', mode: 'ownFlight' };
    const cardContext = Object.assign({}, context, { spielerId: 'A', hole: 1, documentId: 'SC-ST-A-1' });
    function response()
    {
        return Object.assign({}, context, { flightSeq: 1, members: ['A', 'B'], players: [{ id: 'A' }, { id: 'B' }],
            round: { kursId: 'K', status: 'Aktiv', rundenTyp: '9', bahnAnzahl: 9,
                holes: [1,2,3,4,5,6,7,8,9], holeData: Array.from({ length: 9 }, function(_, index)
                {
                    return { nr: index + 1, par: 4, si: index + 1 };
                }) },
            cards: ['A', 'B'].flatMap(function(id)
            {
                return Array.from({ length: 9 }, function(_, index)
                {
                    return { spielerId: id, hole: index + 1, documentId: 'SC-ST-' + id + '-' + (index + 1),
                        exists: false, values: {}, metadata: {}, generation: 'absent',
                        fieldRevisions: { strokes: 0, puts: 0, lady: 0, maxscore: 0 } };
                });
            }) });
    }
    let transport = async function()
    {
        return response();
    };
    let calls = 0;
    const controller = app.createScoreEntryV2Controller({ store: store,
        getIdentity: async function() { return auth; }, getState: function() { return state; },
        readTransport: async function(request)
        {
            check(!Object.hasOwn(request, 'flightId'), 'read never selects flight');
            calls++;
            return transport(request);
        } });
    check(calls === 0, 'controller construction is lazy');
    await controller.open({ spieltagId: 'ST' });
    const entry = await controller.readEntry('A', 1);
    check(entry.generation === 'absent' && Object.keys(entry.displayed).length === 0, 'confirmed absence without defaults');
    let data = await store.inspect(context);
    check(data.pendingOperations.length === 0 && data.requestSnapshots.length === 0, 'read creates no operations or requests');
    check(data.serverCache.length === 18, 'complete flight cache');
    await rejects(function() { return controller.readEntry('OUTSIDE', 1); }, 'foreign player rejected');
    await rejects(function() { return controller.readEntry('A', 10); }, 'invalid hole rejected');
    const savedFlights = structuredClone(state.flights);
    state.flights = [];
    await rejects(function() { return controller.open({ spieltagId: 'ST' }); }, 'missing flight rejected');
    state.flights = savedFlights.concat([{ id: 'F-2', spieltagId: 'ST', spielerIdsCsv: 'A' }]);
    await rejects(function() { return controller.open({ spieltagId: 'ST' }); }, 'ambiguous flight rejected');
    state.flights = savedFlights;
    state.currentUser.id = 'B';
    await rejects(function() { return controller.open({ spieltagId: 'ST' }); }, 'app mismatch rejected');
    state.currentUser.id = 'A';
    auth = { ownerUid: 'B', playerId: 'A' };
    await rejects(function() { return controller.open({ spieltagId: 'ST' }); }, 'UID mismatch rejected');
    auth = { ownerUid: 'A', playerId: 'A' };
    for (const mutate of [
        function(reply) { reply.flightId = '1'; },
        function(reply) { reply.cards.pop(); },
        function(reply) { reply.cards[0].values.strokes = 4; },
        function(reply) { reply.cards[0].generation = 'invented'; }])
    {
        transport = async function()
        {
            const reply = response();
            mutate(reply);
            return reply;
        };
        await rejects(function() { return controller.open({ spieltagId: 'ST' }); }, 'invalid response rejected before caching');
    }
    await store.replaceServerGeneration(cardContext,{strokes:4},{strokes:0,puts:0,lady:0,maxscore:0},{generation:'legacy:0:0',replacesGeneration:'absent'});
    transport = async function()
    {
        const reply = response();
        reply.cards[0].exists = true;
        reply.cards[0].generation = 'legacy:1:0';
        reply.cards[0].values = { strokes: 5 };
        return reply;
    };
    await rejects(function() { return controller.open({ spieltagId: 'ST' }); }, 'different cached generation not replaced');
    check((await store.readScorecard(cardContext)).generation === 'legacy:0:0', 'known prior lifecycle retained');
    await store.replaceServerGeneration(cardContext,{},{strokes:0,puts:0,lady:0,maxscore:0},{generation:'absent',replacesGeneration:'legacy:0:0'});

    const unknown = Object.assign({}, cardContext, { spielerId: 'B', documentId: 'SC-ST-B-1', spieltagId: 'NEW' });
    unknown.documentId = 'SC-NEW-B-1';
    await store.appendChanges(unknown, [{ field: 'strokes', operation: 'set', value: 6 }]);
    const before = (await store.readScorecard(unknown)).pendingOperations[0];
    // Authoritative seeding uses the same production cache API and must not rebase pending.
    await store.putServerSnapshot(unknown, { strokes: 5 }, { strokes: 0, puts: 0, lady: 0, maxscore: 0 }, { generation: 'legacy:2:0' });
    const after = await store.readScorecard(unknown);
    check(after.pendingOperations[0].baseFieldRevision === before.baseFieldRevision
        && after.pendingOperations[0].baseDocumentGeneration === null && after.displayed.strokes === 6, 'basisless pending remains unchanged');
    // Separate clean store verifies actual controller legacy cache ingestion.
    const legacyStore = app.createScoreSyncStore('phase-b-legacy-' + crypto.randomUUID());
    const legacy = app.createScoreEntryV2Controller({ store: legacyStore,
        getIdentity: async function() { return auth; }, getState: function() { return state; },
        readTransport: async function() { return transport(); } });
    await legacyStore.appendChanges(cardContext, [{ field: 'strokes', operation: 'set', value: 6 }]);
    await legacy.open({ spieltagId: 'ST' });
    const merged = await legacy.readEntry('A', 1);
    check(merged.confirmed.strokes === 5 && merged.displayed.strokes === 6, 'legacy cache plus pending read projection');
    check(merged.pendingOperations[0].baseFieldRevision === null
        && merged.pendingOperations[0].baseDocumentGeneration === null, 'controller read never rebases basisless operation');
    check((await legacyStore.inspect(context)).requestSnapshots.length === 0, 'controller creates no send snapshot');
    await legacy.refresh();
    for (const scenario of ['invalidate', 'user', 'round'])
    {
        let release;
        let started;
        const ready = new Promise(function(resolve) { started = resolve; });
        transport = function()
        {
            started();
            return new Promise(function(resolve) { release = resolve; });
        };
        const pending = controller.open({ spieltagId: 'ST' });
        await ready;
        if (scenario === 'invalidate')
        {
            controller.invalidate();
        }
        else if (scenario === 'user')
        {
            auth = { ownerUid: 'B', playerId: 'B' };
            state.currentUser.id = 'B';
        }
        else
        {
            const failed = controller.open({ spieltagId: 'OTHER' }).catch(function() {});
            await failed;
        }
        release(response());
        await rejects(function() { return pending; }, 'stale read blocked: ' + scenario);
        auth = { ownerUid: 'A', playerId: 'A' };
        state.currentUser.id = 'A';
    }
    await store.close();
    await legacyStore.close();
    return { passed: checks, failed: 0 };
})();
