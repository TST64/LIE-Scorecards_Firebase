'use strict';

window.scoreSyncV2Tests = (async function()
{
    const output = document.getElementById('result');
    const summary = { passed: 0, failed: 0, tests: [] };

    function check(value, message)
    {
        if (!value)
        {
            throw new Error(message);
        }
    }

    function equal(actual, expected, message)
    {
        check(JSON.stringify(actual) === JSON.stringify(expected), message);
    }

    async function rejects(work, code)
    {
        let rejected = false;
        try
        {
            await work();
        }
        catch (error)
        {
            rejected = true;
            if (code)
            {
                check(error.code === code, 'Expected error code ' + code + ', got ' + error.code);
            }
        }
        check(rejected, 'Expected rejection');
    }

    function response(request, statuses)
    {
        return { requestId: request.requestId, results: request.operations.map(function(op, index)
        {
            return { changeId: op.changeId, documentId: op.documentId, field: op.field,
                status: statuses ? statuses[index] : 'acknowledged',
                currentServerRevision: op.baseFieldRevision + 1,
                appliedFieldRevision: op.baseFieldRevision + 1,
                appliedDocumentGeneration: op.baseDocumentGeneration === 'absent' ? 'gen:fake' : op.baseDocumentGeneration,
                currentDocumentGeneration: op.baseDocumentGeneration === 'absent' ? 'gen:fake' : op.baseDocumentGeneration,
                currentServerDeleted: op.operation === 'delete',
                currentServerValue: op.operation === 'delete' ? null : op.value };
        }) };
    }

    async function fixture(transport)
    {
        const store = app.createScoreSyncStore('lie_score_sync_adapter_test_' + crypto.randomUUID());
        const c = { ownerUid: 'A', playerId: 'A', spieltagId: 'TEST', flightId: 'F1',
            spielerId: 'A', hole: 1, documentId: 'SC-TEST-A-1', mode: 'ownFlight' };
        await store.putServerSnapshot(c, { strokes: 4, puts: 2, lady: true, maxscore: false },
            { strokes: 0, puts: 0, lady: 0, maxscore: 0 }, { generation: 'gen:fixture' });
        const adapter = app.createScoreSyncV2Adapter(
        {
            store: store,
            transport: transport || (async function(request) { return response(request); }),
            getIdentity: async function() { return { ownerUid: 'A', playerId: 'A' }; }
        });
        return { store: store, c: c, adapter: adapter };
    }

    async function test(name, work)
    {
        try
        {
            await work();
            summary.passed++;
            summary.tests.push({ name: name, status: 'PASS' });
        }
        catch (error)
        {
            summary.failed++;
            summary.tests.push({ name: name, status: 'FAIL', error: error.stack || error.message });
        }
        output.textContent = JSON.stringify(summary, null, 2);
    }

    await test('ACK updates cache value/revision and removes only its exact change ID', async function()
    {
        const f = await fixture();
        try
        {
            await f.store.appendChanges(f.c, [{ field: 'strokes', operation: 'set', value: 5 }]);
            await f.adapter.sync(f.c);
            const state = await f.store.readScorecard(f.c);
            equal(state.pendingOperations, [], 'ACK removes pending');
            check(state.confirmed.strokes === 5 && state.fieldRevisions.strokes === 1, 'Cache updated');
            check(state.confirmed.puts === 2 && state.confirmed.lady === true, 'Other fields unchanged');
        }
        finally
        {
            await f.store.close();
        }
    });

    await test('5 in flight, then 6: ACK retains newer operation and display', async function()
    {
        let sent;
        let release;
        const entered = new Promise(function(resolve) { sent = resolve; });
        const f = await fixture(async function(request)
        {
            sent(request);
            return new Promise(function(resolve) { release = function() { resolve(response(request)); }; });
        });
        try
        {
            await f.store.appendChanges(f.c, [{ field: 'strokes', operation: 'set', value: 5 }]);
            const syncing = f.adapter.sync(f.c);
            const request = await entered;
            const newer = await f.store.appendChanges(f.c, [{ field: 'strokes', operation: 'set', value: 6 }]);
            check(Object.isFrozen(request) && Object.isFrozen(request.operations[0]), 'Frozen request');
            check(request.operations[0].value === 5, 'Snapshot unchanged');
            release();
            await syncing;
            const state = await f.store.readScorecard(f.c);
            check(state.confirmed.strokes === 5 && state.displayed.strokes === 6, 'Confirmed versus overlay');
            equal(state.pendingOperations.map(function(op) { return op.changeId; }),
                [newer[0].changeId], 'Only newer operation remains');
            check(state.fieldRevisions.strokes === 1, 'ACK revision persisted');
        }
        finally
        {
            await f.store.close();
        }
    });

    for (const status of ['conflict', 'rejected'])
    {
        await test(status + ' remains pending and locally inspectable after reopen', async function()
        {
            let calls = 0;
            const f = await fixture(async function(request)
            {
                calls++;
                return response(request, [status]);
            });
            try
            {
                await f.store.appendChanges(f.c, [{ field: 'strokes', operation: 'set', value: 5 }]);
                await f.adapter.sync(f.c);
                await f.store.close();
                const state = await f.store.readScorecard(f.c);
                check(state.pendingOperations.length === 1 && state.syncIssues[0].status === status, 'Issue retained');
                check(state.confirmed.strokes === 4, 'Unacknowledged value not confirmed');
                check((await f.adapter.sync(f.c)).blocked && calls === 1, 'No implicit rebase or retry');
            }
            finally
            {
                await f.store.close();
            }
        });
    }

    await test('Network failure persists request; reload/retry uses identical request and change IDs', async function()
    {
        let original;
        const f = await fixture(async function(request)
        {
            original = JSON.stringify(request);
            throw new Error('Simulated network loss');
        });
        try
        {
            await f.store.appendChanges(f.c, [{ field: 'puts', operation: 'set', value: 1 }]);
            await rejects(function() { return f.adapter.sync(f.c); });
            let data = await f.store.inspect(f.c);
            check(data.pendingOperations.length === 1 && data.requestSnapshots.length === 1, 'Both persisted');
            const id = data.requestSnapshots[0].requestId;
            await f.store.close();
            const retry = app.createScoreSyncV2Adapter(
            {
                store: f.store,
                getIdentity: async function() { return { ownerUid: 'A', playerId: 'A' }; },
                transport: async function(request)
                {
                    equal(JSON.stringify(request), original, 'Exact wire request preserved');
                    return response(request);
                }
            });
            await retry.retry(f.c, id);
            data = await f.store.inspect(f.c);
            check(data.pendingOperations.length === 0, 'Retry ACK committed');
            check(data.requestSnapshots[0].lastOutcome === 'acknowledged'
                && data.requestSnapshots[0].lastFailure.outcome === 'failed', 'Current success and historical failure are separate');
            await f.store.markRequestOutcome(f.c, id, 'failed');
            check((await f.store.getRequestSnapshot(f.c, id)).lastOutcome === 'acknowledged',
                'Late failed duplicate cannot replace terminal success status');
            await retry.retry(f.c, id);
            check((await f.store.inspect(f.c)).pendingOperations.length === 0, 'Duplicate retry safe');
        }
        finally
        {
            await f.store.close();
        }
    });

    await test('Partial ACK retains conflict and commits only acknowledged field', async function()
    {
        const f = await fixture(async function(request) { return response(request, ['acknowledged', 'conflict']); });
        try
        {
            await f.store.appendChanges(f.c, [
                { field: 'puts', operation: 'set', value: 1 },
                { field: 'strokes', operation: 'set', value: 5 }
            ]);
            await f.adapter.sync(f.c);
            const state = await f.store.readScorecard(f.c);
            check(state.pendingOperations.length === 1 && state.pendingOperations[0].field === 'strokes', 'Partial removal');
            check(state.confirmed.puts === 1 && state.confirmed.strokes === 4, 'Partial cache update');
        }
        finally
        {
            await f.store.close();
        }
    });

    await test('Flights run independently; user B and flight B data are untouched by flight A', async function()
    {
        let unblock;
        let entered;
        const ready = new Promise(function(resolve) { entered = resolve; });
        const f = await fixture(async function(request)
        {
            if (request.flightId === 'F1')
            {
                entered();
                await new Promise(function(resolve) { unblock = resolve; });
            }
            return response(request);
        });
        try
        {
            const flightB = Object.assign({}, f.c, { flightId: 'F2' });
            const userB = Object.assign({}, f.c, { ownerUid: 'B', playerId: 'B' });
            await f.store.putServerSnapshot(flightB, { puts: 2 }, { puts: 0 }, { generation: 'gen:fixture' });
            await f.store.appendChanges(f.c, [{ field: 'puts', operation: 'set', value: 1 }]);
            await f.store.appendChanges(flightB, [{ field: 'puts', operation: 'set', value: 0 }]);
            await f.store.appendChanges(userB, [{ field: 'puts', operation: 'set', value: 3 }]);
            const waiting = f.adapter.sync(f.c);
            await ready;
            await f.adapter.sync(flightB);
            check((await f.store.readScorecard(flightB)).confirmed.puts === 0, 'Flight B not blocked by A');
            unblock();
            await waiting;
            check((await f.store.readScorecard(flightB)).confirmed.puts === 0, 'Flight A leaves B unchanged');
            check((await f.store.inspect(userB)).pendingOperations.length === 1, 'Other user pending untouched');
            await rejects(function() { return f.adapter.sync(userB); });
        }
        finally
        {
            await f.store.close();
        }
    });

    await test('Only putts transmitted, using confirmed revision; delete stays delete', async function()
    {
        const payloads = [];
        const f = await fixture(async function(request)
        {
            payloads.push(request);
            return response(request);
        });
        try
        {
            await f.store.putServerSnapshot(f.c, { puts: 2, strokes: 8 }, { puts: 7, strokes: 3 }, { generation: 'gen:fixture' });
            await f.store.appendChanges(f.c, [{ field: 'puts', operation: 'set', value: 1 }]);
            await f.adapter.sync(f.c);
            check(payloads[0].operations.length === 1 && payloads[0].operations[0].field === 'puts'
                && payloads[0].operations[0].baseFieldRevision === 7, 'Explicit fields and known revision only');
            await f.store.appendChanges(f.c, [{ field: 'puts', operation: 'delete', value: null }]);
            await f.adapter.sync(f.c);
            check(payloads[1].operations[0].operation === 'delete'
                && payloads[1].operations[0].value === null, 'No delete conversion');
            const state = await f.store.readScorecard(f.c);
            check(!Object.hasOwn(state.confirmed, 'puts') && state.fieldRevisions.puts === 9, 'Delete cached');
            check(state.confirmed.strokes === 8, 'Strokes unchanged');
        }
        finally
        {
            await f.store.close();
        }
    });

    await test('Legacy cache with unknown revision cannot generate a network request', async function()
    {
        let calls = 0;
        const f = await fixture(async function() { calls++; });
        try
        {
            const unknown = Object.assign({}, f.c, { hole: 2, documentId: 'SC-TEST-A-2' });
            await f.store.putServerSnapshot(unknown, { puts: 2 });
            await f.store.appendChanges(unknown, [{ field: 'puts', operation: 'set', value: 1 }]);
            check((await f.adapter.sync(f.c)).blocked, 'Missing basis is field-blocked');
            const data = await f.store.inspect(f.c);
            check(calls === 0 && data.pendingOperations.length === 1 && data.requestSnapshots.length === 0,
                'No invented revision or incomplete request');
        }
        finally
        {
            await f.store.close();
        }
    });

    await test('Malformed/foreign ACK fails atomically; pending and cache remain intact', async function()
    {
        const f = await fixture(async function(request)
        {
            const reply = response(request);
            reply.results.push(Object.assign({}, reply.results[0], { changeId: 'foreign' }));
            return reply;
        });
        try
        {
            await f.store.appendChanges(f.c, [{ field: 'puts', operation: 'set', value: 1 }]);
            await rejects(function() { return f.adapter.sync(f.c); });
            const state = await f.store.readScorecard(f.c);
            check(state.pendingOperations.length === 1 && state.confirmed.puts === 2
                && state.fieldRevisions.puts === 0, 'Atomic rejection');
        }
        finally
        {
            await f.store.close();
        }
    });

    await test('Late ACK never regresses a newer cached server revision/value', async function()
    {
        const f = await fixture(async function(request)
        {
            await f.store.putServerSnapshot(f.c, { puts: 3 }, { puts: 10 }, { generation: 'gen:fixture' });
            return response(request);
        });
        try
        {
            await f.store.appendChanges(f.c, [{ field: 'puts', operation: 'set', value: 1 }]);
            await f.adapter.sync(f.c);
            const state = await f.store.readScorecard(f.c);
            check(state.confirmed.puts === 3 && state.fieldRevisions.puts === 10, 'Monotonic cache');
        }
        finally
        {
            await f.store.close();
        }
    });

    await test('Old queued revisions send oldest edit first, then use the actual ACK revision', async function()
    {
        const payloads = [];
        const f = await fixture(async function(request)
        {
            payloads.push(request);
            return response(request);
        });
        try
        {
            await f.store.appendChanges(f.c, [{ field: 'strokes', operation: 'set', value: 5 }]);
            await f.store.appendChanges(f.c, [{ field: 'strokes', operation: 'set', value: 6 }]);
            await f.adapter.sync(f.c);
            check(payloads[0].operations.length === 1 && payloads[0].operations[0].value === 5, 'No field compaction');
            await f.adapter.sync(f.c);
            check(payloads[1].operations[0].value === 6 && payloads[1].operations[0].baseFieldRevision === 1,
                'Second operation uses confirmed revision');
        }
        finally
        {
            await f.store.close();
        }
    });

    await test('Retry ACK uses authoritative current server value rather than old request value', async function()
    {
        const f = await fixture(async function(request)
        {
            const reply = response(request);
            reply.results[0].currentServerRevision = 9;
            reply.results[0].currentServerValue = 3;
            return reply;
        });
        try
        {
            await f.store.appendChanges(f.c, [{ field: 'puts', operation: 'set', value: 1 }]);
            await f.adapter.sync(f.c);
            const state = await f.store.readScorecard(f.c);
            check(state.confirmed.puts === 3 && state.fieldRevisions.puts === 9,
                'Current server state wins over historical mutation payload');
        }
        finally
        {
            await f.store.close();
        }
    });

    await test('Missing context or a stale authenticated user cannot send another user queue', async function()
    {
        let calls = 0;
        const f = await fixture(async function() { calls++; });
        try
        {
            await f.store.appendChanges(f.c, [{ field: 'puts', operation: 'set', value: 1 }]);
            await rejects(function() { return f.adapter.sync(Object.assign({}, f.c, { flightId: '' })); });
            await rejects(function() { return f.adapter.sync(Object.assign({}, f.c, { mode: undefined })); });
            const otherIdentity = app.createScoreSyncV2Adapter(
            {
                store: f.store,
                transport: async function() { calls++; },
                getIdentity: async function() { return { ownerUid: 'B', playerId: 'B' }; }
            });
            await rejects(function() { return otherIdentity.sync(f.c); });
            check(calls === 0 && (await f.store.inspect(f.c)).pendingOperations.length === 1, 'No unauthorized send');
        }
        finally
        {
            await f.store.close();
        }
    });

    await test('Editing basis is captured atomically at input, never moved by a cache refresh', async function()
    {
        const f = await fixture();
        try
        {
            const added = await f.store.appendChanges(f.c, [{ field: 'strokes', operation: 'set', value: 5 }]);
            check(added[0].baseFieldRevision === 0, 'Basis stored at editing time');
            await f.store.putServerSnapshot(f.c, { strokes: 7 }, { strokes: 1 }, { generation: 'gen:fixture' });
            const snapshot = await f.store.createRequestSnapshot(f.c, { protocol: 'score-v2' });
            check(snapshot.operations[0].baseFieldRevision === 0 && snapshot.operations[0].value === 5,
                'New cache revision did not rebase the operation');
        }
        finally
        {
            await f.store.close();
        }
    });

    await test('Cache is fieldwise monotonic, preserves known metadata and rejects equal-revision contradictions', async function()
    {
        const f = await fixture();
        try
        {
            await f.store.putServerSnapshot(f.c, { strokes: 7 }, { strokes: 2 }, { generation: 'gen:fixture' });
            await f.store.putServerSnapshot(f.c, { strokes: 5, puts: 1 }, { strokes: 1, puts: 1 }, { generation: 'gen:fixture' });
            await f.store.putServerSnapshot(f.c, { strokes: 9 }, undefined, { generation: 'gen:fixture' });
            let state = await f.store.readScorecard(f.c);
            check(state.confirmed.strokes === 7 && state.fieldRevisions.strokes === 2, 'Older/unknown revisions ignored');
            check(state.confirmed.puts === 1 && state.fieldRevisions.puts === 1, 'Independent newer field accepted');
            await rejects(function() { return f.store.putServerSnapshot(f.c, { strokes: 8 }, { strokes: 2 }, { generation: 'gen:fixture' }); });
            state = await f.store.readScorecard(f.c);
            check(state.confirmed.strokes === 7, 'Contradiction did not commit');
        }
        finally
        {
            await f.store.close();
        }
    });

    await test('Two adapters/connections atomically reserve one immutable request', async function()
    {
        const payloads = [];
        let release;
        const gate = new Promise(function(resolve) { release = resolve; });
        let entered;
        const both = new Promise(function(resolve) { entered = resolve; });
        const transport = async function(request)
        {
            payloads.push(request);
            if (payloads.length === 2)
            {
                entered();
            }
            await gate;
            return response(request);
        };
        const f = await fixture(transport);
        const second = app.createScoreSyncStore(f.store.databaseName);
        try
        {
            await f.store.appendChanges(f.c, [{ field: 'puts', operation: 'set', value: 1 }]);
            const adapter = app.createScoreSyncV2Adapter({ store: second, transport: transport,
                getIdentity: async function() { return { ownerUid: 'A', playerId: 'A' }; } });
            const running = [f.adapter.sync(f.c), adapter.sync(f.c)];
            await both;
            equal(payloads[0], payloads[1], 'Both transports use the same reserved snapshot');
            check((await f.store.inspect(f.c)).requestSnapshots.length === 1, 'Exactly one request persisted');
            release();
            await Promise.all(running);
            check((await second.inspect(f.c)).pendingOperations.length === 0, 'Duplicate ACK remains idempotent');
        }
        finally
        {
            release();
            await f.store.close();
            await second.close();
        }
    });

    await test('Conflict and missing basis block only their field; explicit rebase archives old IDs', async function()
    {
        const payloads = [];
        const f = await fixture(async function(request)
        {
            payloads.push(request);
            return response(request, request.operations.map(function(op)
            {
                return op.field === 'strokes' && op.baseFieldRevision === 0 ? 'conflict' : 'acknowledged';
            }));
        });
        try
        {
            const old = await f.store.appendChanges(f.c, [{ field: 'strokes', operation: 'set', value: 5 }]);
            await f.adapter.sync(f.c);
            await f.store.appendChanges(f.c, [{ field: 'puts', operation: 'set', value: 1 }]);
            await f.adapter.sync(f.c);
            check(payloads[1].operations.length === 1 && payloads[1].operations[0].field === 'puts', 'Independent field sent');
            const unknown = Object.assign({}, f.c, { hole: 2, documentId: 'SC-TEST-A-2' });
            await f.store.appendChanges(unknown, [{ field: 'puts', operation: 'set', value: 3 }]);
            await f.store.appendChanges(f.c, [{ field: 'lady', operation: 'set', value: false }]);
            await f.adapter.sync(f.c);
            check(payloads[2].operations[0].field === 'lady', 'Missing basis does not block a known field');
            await f.store.putServerSnapshot(f.c, { strokes: 7 }, { strokes: 1 }, { generation: 'gen:fixture' });
            const expected = (await f.store.readScorecard(f.c)).resolutionExpectations.strokes;
            const rebased = await f.adapter.resolveField(f.c, 'strokes', 'rebase', expected);
            check(rebased.changeId !== old[0].changeId && rebased.baseFieldRevision === 1, 'Explicit resolution gets a new ID');
            await f.adapter.sync(f.c);
            const data = await f.store.inspect(f.c);
            check(data.operationReceipts.some(function(receipt)
            {
                return receipt.changeId === old[0].changeId && receipt.status === 'superseded';
            }), 'Superseded edit retained in history');
            check((await f.store.readScorecard(f.c)).confirmed.strokes === 5, 'Explicitly chosen rebase applied');
        }
        finally
        {
            await f.store.close();
        }
    });

    async function api(path, data)
    {
        const reply = await fetch('/test-api/' + path,
            { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data || {}) });
        if (!reply.ok)
        {
            throw new Error('Local test-core transport failed: ' + await reply.text());
        }
        return reply.json();
    }

    async function integratedFixture(hook)
    {
        const seeded = await api('seed');
        const c = seeded.context;
        const state = await api('read', c);
        const store = app.createScoreSyncStore('lie_score_sync_core_test_' + crypto.randomUUID());
        await store.putServerSnapshot(c, state.values, state.fieldRevisions, { generation: state.generation });
        const payloads = [];
        const adapter = app.createScoreSyncV2Adapter(
        {
            store: store,
            getIdentity: async function() { return { ownerUid: 'A', playerId: 'A' }; },
            transport: async function(request)
            {
                payloads.push(request);
                const reply = await api('call', request);
                return hook ? hook(reply, request) : reply;
            }
        });
        async function remote(field, value)
        {
            const current = await api('read', c);
            return api('call', Object.assign({}, c, { requestId: crypto.randomUUID(), operations: [Object.assign({}, c,
            {
                changeId: crypto.randomUUID(), field: field, operation: 'set', value: value,
                baseFieldRevision: current.fieldRevisions[field], baseDocumentGeneration: current.generation
            })] }));
        }
        return { c: c, store: store, adapter: adapter, remote: remote, payloads: payloads };
    }

    await test('INTEGRATION: local 5/Rev0 versus server 7/Rev1 conflicts; independent puts still ACK', async function()
    {
        const f = await integratedFixture();
        try
        {
            await f.store.appendChanges(f.c, [{ field: 'strokes', operation: 'set', value: 5 }]);
            await f.remote('strokes', 7);
            const refreshed = await api('read', f.c);
            await f.store.putServerSnapshot(f.c, refreshed.values, refreshed.fieldRevisions, { generation: refreshed.generation });
            const reply = await f.adapter.sync(f.c);
            check(f.payloads[0].operations[0].baseFieldRevision === 0 && reply.results[0].status === 'conflict', 'Actual server rejects stale editing basis');
            await f.store.appendChanges(f.c, [{ field: 'puts', operation: 'set', value: 1 }]);
            const next = await f.adapter.sync(f.c);
            check(next.results[0].status === 'acknowledged' && next.results[0].field === 'puts', 'Actual server accepts independent field');
            const current = await api('read', f.c);
            check(current.values.strokes === 7 && current.values.puts === 1, 'Server 7 preserved');
            check(current.raw.hcpStart === 20 && current.raw.strokesGiven === 1, 'Calculated fields preserved');
        }
        finally
        {
            await f.store.close();
        }
    });

    await test('INTEGRATION: own successor uses applied Rev1, never foreign current Rev2 from a retry', async function()
    {
        let lose = true;
        const f = await integratedFixture(function(reply)
        {
            if (lose)
            {
                lose = false;
                throw new Error('Response lost after actual server commit');
            }
            return reply;
        });
        try
        {
            const first = await f.store.appendChanges(f.c, [{ field: 'strokes', operation: 'set', value: 5 }]);
            await rejects(function() { return f.adapter.sync(f.c); });
            const second = await f.store.appendChanges(f.c, [{ field: 'strokes', operation: 'set', value: 6 }]);
            check(second[0].predecessorChangeId === first[0].changeId, 'Explicit own predecessor');
            await f.remote('strokes', 7);
            const snapshot = (await f.store.inspect(f.c)).requestSnapshots[0];
            const retry = await f.adapter.retry(f.c, snapshot.requestId);
            check(retry.results[0].appliedFieldRevision === 1 && retry.results[0].currentServerRevision === 2, 'Historical ACK separates applied/current revisions');
            const reply = await f.adapter.sync(f.c);
            check(f.payloads[2].operations[0].baseFieldRevision === 1 && reply.results[0].status === 'conflict', 'Successor does not inherit foreign Rev2');
            check((await api('read', f.c)).values.strokes === 7, 'Foreign server value remains intact');
        }
        finally
        {
            await f.store.close();
        }
    });

    await test('INTEGRATION: physical deletion/recreation rejects old receipts without false ACK or automatic retry loop', async function()
    {
        let lose = true;
        const f = await integratedFixture(function(reply)
        {
            if (lose)
            {
                lose = false;
                throw new Error('Lost ACK');
            }
            return reply;
        });
        try
        {
            await f.store.appendChanges(f.c, [{ field: 'strokes', operation: 'set', value: 5 }]);
            await rejects(function() { return f.adapter.sync(f.c); });
            const request = (await f.store.inspect(f.c)).requestSnapshots[0];
            const expected = (await f.store.readScorecard(f.c)).resolutionExpectations.strokes;
            await rejects(function() { return f.adapter.resolveField(f.c, 'strokes', 'discard', expected); });
            await api('delete', f.c);
            const deleted = await f.adapter.retry(f.c, request.requestId);
            check(deleted.results[0].status === 'rejected' && deleted.results[0].reason === 'document-deleted', 'Missing lifecycle rejected');
            const count = f.payloads.length;
            check((await f.adapter.sync(f.c)).blocked && f.payloads.length === count, 'No automatic retry loop');
            await api('recreate', f.c);
            const recreated = await f.adapter.retry(f.c, request.requestId);
            check(recreated.results[0].reason === 'document-generation-mismatch', 'Recreated lifecycle rejects historical mutation');
            check((await api('read', f.c)).values.strokes === 9, 'Recreated data untouched');
        }
        finally
        {
            await f.store.close();
        }
    });

    await test('Late cache inconsistency aborts the entire multi-field ACK transaction', async function()
    {
        const f = await fixture(async function(request)
        {
            await f.store.putServerSnapshot(f.c, { strokes: 7 }, { strokes: 1 }, { generation: 'gen:fixture' });
            return response(request);
        });
        try
        {
            await f.store.appendChanges(f.c, [
                { field: 'puts', operation: 'set', value: 1 },
                { field: 'strokes', operation: 'set', value: 5 }
            ]);
            await rejects(function() { return f.adapter.sync(f.c); });
            const data = await f.store.inspect(f.c);
            const state = await f.store.readScorecard(f.c);
            check(data.pendingOperations.length === 2 && data.operationReceipts.length === 0, 'No partial receipt or deletion');
            check(state.confirmed.puts === 2 && state.fieldRevisions.puts === 0, 'Earlier cache write rolled back');
            check(state.confirmed.strokes === 7, 'Independent confirmed refresh retained');
            check(data.requestSnapshots[0].acknowledgedChangeIds.length === 0
                && data.requestSnapshots[0].status === 'prepared', 'Snapshot ACK state rolled back');
        }
        finally
        {
            await f.store.close();
        }
    });

    await test('INTEGRATION: confirmed absence creates fresh generation and field delete preserves it', async function()
    {
        const f = await integratedFixture();
        try
        {
            const old = await api('read', f.c);
            await api('delete', f.c);
            const absent = await api('read', f.c);
            await f.store.replaceServerGeneration(f.c, absent.values, absent.fieldRevisions,
                { generation: absent.generation, replacesGeneration: old.generation });
            await f.store.appendChanges(f.c, [{ field: 'strokes', operation: 'set', value: 5 }]);
            const created = await f.adapter.sync(f.c);
            const generation = created.results[0].currentDocumentGeneration;
            check(generation.startsWith('gen:') && (await f.store.readScorecard(f.c)).generation === generation,
                'Client/server agree on fresh generation');
            await f.store.appendChanges(f.c, [{ field: 'strokes', operation: 'delete', value: null }]);
            await f.adapter.sync(f.c);
            const current = await api('read', f.c);
            check(current.generation === generation && !Object.hasOwn(current.values, 'strokes'), 'Field deletion keeps lifecycle');
        }
        finally
        {
            await f.store.close();
        }
    });

    await test('Explicit discard archives the operation and prevents a later resend of its old rejected request', async function()
    {
        let calls = 0;
        const f = await fixture(async function(request)
        {
            calls++;
            return response(request, ['rejected']);
        });
        try
        {
            await f.store.appendChanges(f.c, [{ field: 'strokes', operation: 'set', value: 5 }]);
            const reply = await f.adapter.sync(f.c);
            const expected = (await f.store.readScorecard(f.c)).resolutionExpectations.strokes;
            await f.adapter.resolveField(f.c, 'strokes', 'discard', expected);
            await rejects(function() { return f.adapter.retry(f.c, reply.requestId); });
            check(calls === 1 && (await f.store.inspect(f.c)).pendingOperations.length === 0,
                'Resolved historical request cannot revive a discarded edit');
        }
        finally
        {
            await f.store.close();
        }
    });

    for (const action of ['discard', 'rebase'])
    {
        await test('Stale tab cannot ' + action + ' an unseen newer edit from another connection', async function()
        {
            const f = await fixture(async function(request)
            {
                return response(request, ['conflict']);
            });
            const other = app.createScoreSyncStore(f.store.databaseName);
            try
            {
                await f.store.appendChanges(f.c, [{ field: 'strokes', operation: 'set', value: 5 }]);
                await f.adapter.sync(f.c);
                const seen = (await f.store.readScorecard(f.c)).resolutionExpectations.strokes;
                const newer = await other.appendChanges(f.c, [{ field: 'strokes', operation: 'set', value: 6 }]);
                const before = await other.inspect(f.c);
                await rejects(function()
                {
                    return f.adapter.resolveField(f.c, 'strokes', action, seen);
                }, 'stale-resolution');
                equal(await other.inspect(f.c), before, 'Stale resolution changes no store');
                const state = await other.readScorecard(f.c);
                check(state.pendingOperations.some(function(op)
                {
                    return op.changeId === newer[0].changeId;
                }) && state.displayed.strokes === 6, 'Newer edit remains pending and displayed');
            }
            finally
            {
                await f.store.close();
                await other.close();
            }
        });

        await test('A new document generation makes the observed ' + action + ' decision stale', async function()
        {
            const f = await fixture(async function(request)
            {
                return response(request, ['conflict']);
            });
            try
            {
                await f.store.appendChanges(f.c, [{ field: 'strokes', operation: 'set', value: 5 }]);
                await f.adapter.sync(f.c);
                const seen = (await f.store.readScorecard(f.c)).resolutionExpectations.strokes;
                await f.store.replaceServerGeneration(f.c, { strokes: 9 },
                    { strokes: 0, puts: 0, lady: 0, maxscore: 0 },
                    { generation: 'gen:B', replacesGeneration: 'gen:fixture' });
                const before = await f.store.inspect(f.c);
                await rejects(function()
                {
                    return f.adapter.resolveField(f.c, 'strokes', action, seen);
                }, 'stale-resolution');
                equal(await f.store.inspect(f.c), before, 'Generation race does not resolve old work');
            }
            finally
            {
                await f.store.close();
            }
        });
    }

    await test('A new confirmed server revision makes rebase stale even without a new local edit', async function()
    {
        const f = await fixture(async function(request)
        {
            return response(request, ['conflict']);
        });
        try
        {
            await f.store.appendChanges(f.c, [{ field: 'strokes', operation: 'set', value: 5 }]);
            await f.adapter.sync(f.c);
            const seen = (await f.store.readScorecard(f.c)).resolutionExpectations.strokes;
            await f.store.putServerSnapshot(f.c, { strokes: 7 }, { strokes: 1 }, { generation: 'gen:fixture' });
            const before = await f.store.inspect(f.c);
            await rejects(function()
            {
                return f.adapter.resolveField(f.c, 'strokes', 'rebase', seen);
            }, 'stale-resolution');
            equal(await f.store.inspect(f.c), before, 'Server revision race leaves queue and receipts intact');
            const fresh = (await f.store.readScorecard(f.c)).resolutionExpectations.strokes;
            const chosen = await f.adapter.resolveField(f.c, 'strokes', 'rebase', fresh);
            check(chosen.baseFieldRevision === 1 && !seen.changeIds.includes(chosen.changeId), 'A renewed decision may rebase explicitly');
        }
        finally
        {
            await f.store.close();
        }
    });

    await test('Foreign-generation and generation-less refreshes cannot change a versioned cache', async function()
    {
        const f = await fixture();
        try
        {
            await f.store.replaceServerGeneration(f.c, { strokes: 4, puts: 2, lady: true, maxscore: false },
                { strokes: 0, puts: 0, lady: 0, maxscore: 0 },
                { generation: 'gen:B', replacesGeneration: 'gen:fixture' });
            const before = await f.store.inspect(f.c);
            await rejects(function()
            {
                return f.store.putServerSnapshot(f.c, { strokes: 3 }, { strokes: 99 }, { generation: 'gen:A' });
            }, 'generation-mismatch');
            await rejects(function()
            {
                return f.store.putServerSnapshot(f.c, { strokes: 3 }, { strokes: 99 },
                    { generation: 'gen:A', replacesGeneration: 'gen:B' });
            }, 'generation-mismatch');
            await rejects(function()
            {
                return f.store.putServerSnapshot(f.c, { strokes: 3 }, { strokes: 99 });
            }, 'generation-required');
            await rejects(function()
            {
                return f.store.putServerSnapshot(f.c, { strokes: 3 });
            }, 'generation-required');
            equal(await f.store.inspect(f.c), before, 'No refresh bypasses lifecycle binding');
            await f.store.putServerSnapshot(f.c, { strokes: 7 }, { strokes: 2 }, { generation: 'gen:B' });
            await f.store.putServerSnapshot(f.c, { strokes: 3 }, { strokes: 1 }, { generation: 'gen:B' });
            check((await f.store.readScorecard(f.c)).confirmed.strokes === 7, 'Same-generation revisions stay monotonic');
        }
        finally
        {
            await f.store.close();
        }
    });

    await test('Unversioned legacy values stay unsendable and require a complete authoritative generation binding', async function()
    {
        const f = await fixture();
        const c = Object.assign({}, f.c, { hole: 2, documentId: 'SC-TEST-A-2' });
        try
        {
            await f.store.putServerSnapshot(c, { strokes: 8, puts: 3 });
            await f.store.putServerSnapshot(c, { puts: 2 });
            let state = await f.store.readScorecard(c);
            check(!state.generation && Object.keys(state.fieldRevisions).length === 0, 'Legacy reads invent no revisions or generation');
            await rejects(function()
            {
                return f.store.putServerSnapshot(c, { puts: 1 }, { puts: 0 }, { generation: 'gen:bound' });
            }, 'legacy-snapshot-incomplete');
            await f.store.putServerSnapshot(c, { puts: 1 }, { strokes: 0, puts: 0, lady: 0, maxscore: 0 },
                { generation: 'gen:bound' });
            state = await f.store.readScorecard(c);
            equal(state.confirmed, { puts: 1 }, 'Old unknown values are not carried into a versioned lifecycle');
            check(state.generation === 'gen:bound' && state.fieldRevisions.strokes === 0, 'Confirmed absence is explicit');
        }
        finally
        {
            await f.store.close();
        }
    });

    async function seedOldDatabase(name, version, c)
    {
        const pending = Object.assign({}, c, { sequence: 7, changeId: 'old-change-' + version,
            field: 'strokes', operation: 'set', value: 5, createdAt: '2026-01-01T00:00:00.000Z' });
        const cache = Object.assign({}, c, { values: { strokes: 4, puts: 2 }, cachedAt: pending.createdAt });
        if (version === 2)
        {
            cache.fieldRevisions = { strokes: 0, puts: 0 };
        }
        const request = Object.assign({}, c, { requestId: 'old-request', protocol: 'score-v2', createdAt: pending.createdAt,
            status: 'prepared', acknowledgedChangeIds: [], changeIds: [pending.changeId], operations: [pending],
            wireRequest: Object.assign({}, c, { requestId: 'old-request', operations: [pending] }) });
        await new Promise(function(resolve, reject)
        {
            const opening = indexedDB.open(name, version);
            opening.onupgradeneeded = function()
            {
                const db = opening.result;
                const ops = db.createObjectStore('pendingOperations', { keyPath: 'sequence', autoIncrement: true });
                ops.createIndex('changeId', 'changeId', { unique: true });
                ops.createIndex('partition', ['ownerUid', 'playerId', 'spieltagId', 'flightId']);
                const cards = db.createObjectStore('serverCache',
                    { keyPath: ['ownerUid', 'playerId', 'spieltagId', 'flightId', 'documentId'] });
                cards.createIndex('partition', ['ownerUid', 'playerId', 'spieltagId', 'flightId']);
                if (version === 2)
                {
                    const requests = db.createObjectStore('requestSnapshots', { keyPath: 'requestId' });
                    requests.createIndex('partition', ['ownerUid', 'playerId', 'spieltagId', 'flightId']);
                }
            };
            opening.onerror = function()
            {
                reject(opening.error);
            };
            opening.onsuccess = function()
            {
                const db = opening.result;
                const scope = version === 2 ? ['pendingOperations', 'serverCache', 'requestSnapshots']
                    : ['pendingOperations', 'serverCache'];
                const tx = db.transaction(scope, 'readwrite');
                tx.objectStore('pendingOperations').add(pending);
                tx.objectStore('serverCache').put(cache);
                if (version === 2)
                {
                    tx.objectStore('requestSnapshots').add(request);
                }
                tx.oncomplete = function()
                {
                    db.close();
                    resolve();
                };
                tx.onabort = function()
                {
                    db.close();
                    reject(tx.error);
                };
            };
        });
        return { pending: pending, cache: cache, request: request };
    }

    for (const version of [1, 2])
    {
        await test('Real IndexedDB upgrade ' + version + ' to 3 preserves historical pending/cache/request data', async function()
        {
            const name = 'lie_score_sync_upgrade_test_' + crypto.randomUUID();
            const c = { ownerUid: 'A', playerId: 'A', spieltagId: 'OLD', flightId: 'F1',
                spielerId: 'A', hole: 1, documentId: 'SC-OLD-A-1', mode: 'ownFlight' };
            const old = await seedOldDatabase(name, version, c);
            const store = app.createScoreSyncStore(name);
            try
            {
                check((await store.open()).version === 3, 'Native IndexedDB performed the upgrade');
                let data = await store.inspect(c);
                equal(data.pendingOperations, [old.pending], 'Historical operation preserved byte-for-byte');
                equal(data.serverCache, [old.cache], 'Historical cache preserved byte-for-byte');
                equal(data.requestSnapshots, version === 2 ? [old.request] : [], 'Historical request preserved where the old schema supported it');
                equal(data.operationReceipts, [], 'New receipt store starts empty');
                equal(data.operationIssues, [], 'New issue store starts empty');
                await store.close();
                data = await store.inspect(c);
                equal(data.pendingOperations, [old.pending], 'Upgrade survives reopening');
                if (version === 2)
                {
                    const before = await store.inspect(c);
                    await rejects(function()
                    {
                        return store.putServerSnapshot(c, { strokes: 8 });
                    }, 'generation-required');
                    equal(await store.inspect(c), before, 'Versioned legacy metadata cannot be erased by compatibility input');
                    equal((await store.getRequestSnapshot(c, 'old-request')).wireRequest, old.request.wireRequest,
                        'Upgrade never rewrites a prepared wire request');
                }
                await store.putServerSnapshot(c, { strokes: 7, puts: 1 },
                    { strokes: 1, puts: 0, lady: 0, maxscore: 0 }, { generation: 'gen:authoritative' });
                const stillOld = (await store.inspect(c)).pendingOperations[0];
                check(!Object.hasOwn(stillOld, 'baseFieldRevision') && !Object.hasOwn(stillOld, 'baseDocumentGeneration'),
                    'Migration/refresh never invents an editing basis for historical work');
            }
            finally
            {
                await store.close();
            }
        });
    }

    await test('INTEGRATION: three local successors survive an interleaved duplicate ACK and a server refresh', async function()
    {
        let releaseFirst;
        let releaseDuplicate;
        const firstGate = new Promise(function(resolve)
        {
            releaseFirst = resolve;
        });
        const duplicateGate = new Promise(function(resolve)
        {
            releaseDuplicate = resolve;
        });
        let entered;
        const both = new Promise(function(resolve)
        {
            entered = resolve;
        });
        let calls = 0;
        const sharedHook = async function(reply, request)
        {
            if (request.operations[0].value === 5)
            {
                const order = ++calls;
                if (calls === 2)
                {
                    entered();
                }
                await (order === 1 ? firstGate : duplicateGate);
            }
            return reply;
        };
        const f = await integratedFixture(sharedHook);
        const other = app.createScoreSyncStore(f.store.databaseName);
        let firstSync;
        let duplicateSync;
        try
        {
            const first = await f.store.appendChanges(f.c, [{ field: 'strokes', operation: 'set', value: 5 }]);
            const second = await f.store.appendChanges(f.c, [{ field: 'strokes', operation: 'set', value: 6 }]);
            const adapter = app.createScoreSyncV2Adapter(
            {
                store: other,
                getIdentity: async function()
                {
                    return { ownerUid: 'A', playerId: 'A' };
                },
                transport: async function(request)
                {
                    return sharedHook(await api('call', request), request);
                }
            });
            firstSync = f.adapter.sync(f.c);
            duplicateSync = adapter.sync(f.c);
            await both;
            const third = await other.appendChanges(f.c, [{ field: 'strokes', operation: 'set', value: 7 }]);
            check(second[0].predecessorChangeId === first[0].changeId
                && third[0].predecessorChangeId === second[0].changeId, 'Full own mutation lineage retained');
            const refreshed = await api('read', f.c);
            await f.store.putServerSnapshot(f.c, refreshed.values, refreshed.fieldRevisions,
                { generation: refreshed.generation });
            releaseFirst();
            await firstSync;
            await f.adapter.sync(f.c);
            let state = await other.readScorecard(f.c);
            check(state.confirmed.strokes === 6 && state.fieldRevisions.strokes === 2
                && state.displayed.strokes === 7, 'Second ACK coexists with third pending edit');
            releaseDuplicate();
            await duplicateSync;
            state = await f.store.readScorecard(f.c);
            check(state.confirmed.strokes === 6 && state.fieldRevisions.strokes === 2
                && state.pendingOperations[0].changeId === third[0].changeId, 'Late first ACK cannot reset second ACK or delete third edit');
            await f.adapter.sync(f.c);
            state = await f.store.readScorecard(f.c);
            check(state.pendingOperations.length === 0 && state.confirmed.strokes === 7
                && state.fieldRevisions.strokes === 3, 'All three edits acknowledged in order');
            equal(f.payloads.map(function(request)
            {
                return request.operations[0].baseFieldRevision;
            }), [0, 1, 2], 'Each successor uses its actual own predecessor revision');
            check((await api('read', f.c)).values.strokes === 7, 'Real server core agrees with cache');
        }
        finally
        {
            releaseFirst();
            releaseDuplicate();
            await Promise.allSettled([firstSync, duplicateSync]);
            await f.store.close();
            await other.close();
        }
    });

    for (const change of ['logout', 'login-B'])
    {
        await test('Identity ' + change + ' during a transport keeps the late ACK in user A partition', async function()
        {
            const f = await fixture();
            let identity = { ownerUid: 'A', playerId: 'A' };
            let entered;
            const started = new Promise(function(resolve)
            {
                entered = resolve;
            });
            let release;
            const gate = new Promise(function(resolve)
            {
                release = resolve;
            });
            let calls = 0;
            const adapter = app.createScoreSyncV2Adapter(
            {
                store: f.store,
                getIdentity: async function()
                {
                    return identity;
                },
                transport: async function(request)
                {
                    calls++;
                    if (request.ownerUid === 'A')
                    {
                        entered();
                        await gate;
                    }
                    return response(request);
                }
            });
            let syncing;
            try
            {
                const b = Object.assign({}, f.c, { ownerUid: 'B', playerId: 'B', spielerId: 'B', documentId: 'SC-TEST-B-1' });
                await f.store.putServerSnapshot(b, { strokes: 8 }, { strokes: 0 }, { generation: 'gen:user-B' });
                await f.store.appendChanges(b, [{ field: 'strokes', operation: 'set', value: 9 }]);
                await f.store.appendChanges(f.c, [{ field: 'strokes', operation: 'set', value: 5 }]);
                syncing = adapter.sync(f.c);
                await started;
                identity = change === 'logout' ? null : { ownerUid: 'B', playerId: 'B' };
                const beforeB = await f.store.inspect(b);
                release();
                await syncing;
                equal(await f.store.inspect(b), beforeB, 'Late A response never changes B cache/queue/requests');
                check((await f.store.readScorecard(f.c)).confirmed.strokes === 5, 'A response stays bound to A');
                await rejects(function()
                {
                    return adapter.sync(f.c);
                });
                check(calls === 1, 'Old A queue cannot send under a different identity');
                identity = { ownerUid: 'B', playerId: 'B' };
                await adapter.sync(b);
                check((await f.store.readScorecard(b)).confirmed.strokes === 9, 'B can independently synchronize its own work');
            }
            finally
            {
                release();
                await Promise.allSettled([syncing]);
                await f.store.close();
            }
        });
    }

    await test('Resolution expectation is mandatory and captured before asynchronous identity validation', async function()
    {
        const f = await fixture(async function(request)
        {
            return response(request, ['conflict']);
        });
        let release;
        const gate = new Promise(function(resolve)
        {
            release = resolve;
        });
        try
        {
            await f.store.appendChanges(f.c, [{ field: 'strokes', operation: 'set', value: 5 }]);
            await f.adapter.sync(f.c);
            await rejects(function()
            {
                return f.adapter.resolveField(f.c, 'strokes', 'discard');
            }, 'invalid-resolution-expectation');
            const seen = structuredClone((await f.store.readScorecard(f.c)).resolutionExpectations.strokes);
            const adapter = app.createScoreSyncV2Adapter(
            {
                store: f.store,
                transport: async function(request)
                {
                    return response(request);
                },
                getIdentity: async function()
                {
                    await gate;
                    return { ownerUid: 'A', playerId: 'A' };
                }
            });
            const resolving = adapter.resolveField(f.c, 'strokes', 'discard', seen);
            const rejected = rejects(function()
            {
                return resolving;
            }, 'stale-resolution');
            await f.store.appendChanges(f.c, [{ field: 'strokes', operation: 'set', value: 6 }]);
            seen.changeIds = (await f.store.readScorecard(f.c)).resolutionExpectations.strokes.changeIds.slice();
            release();
            await rejected;
            check((await f.store.readScorecard(f.c)).pendingOperations.length === 2,
                'Mutating caller-owned expectations after invocation cannot bypass the observed-state guard');
        }
        finally
        {
            release();
            await f.store.close();
        }
    });

    await test('INTEGRATION: stale rebase cannot overwrite a newer real server revision; a renewed decision can proceed', async function()
    {
        const f = await integratedFixture();
        try
        {
            const original = await f.store.appendChanges(f.c, [{ field: 'strokes', operation: 'set', value: 5 }]);
            await f.remote('strokes', 7);
            await f.adapter.sync(f.c);
            let server = await api('read', f.c);
            await f.store.putServerSnapshot(f.c, server.values, server.fieldRevisions, { generation: server.generation });
            const seen = (await f.store.readScorecard(f.c)).resolutionExpectations.strokes;
            await f.remote('strokes', 8);
            server = await api('read', f.c);
            await f.store.putServerSnapshot(f.c, server.values, server.fieldRevisions, { generation: server.generation });
            const before = await f.store.inspect(f.c);
            await rejects(function()
            {
                return f.adapter.resolveField(f.c, 'strokes', 'rebase', seen);
            }, 'stale-resolution');
            equal(await f.store.inspect(f.c), before, 'Stale real-server decision does not create or remove any operation');
            check((await api('read', f.c)).values.strokes === 8, 'Newer server value remains untouched');
            const fresh = (await f.store.readScorecard(f.c)).resolutionExpectations.strokes;
            const replacement = await f.adapter.resolveField(f.c, 'strokes', 'rebase', fresh);
            check(replacement.baseFieldRevision === 2 && replacement.changeId !== original[0].changeId,
                'Freshly confirmed decision has its own ID and exact basis');
            await f.adapter.sync(f.c);
            check((await api('read', f.c)).values.strokes === 5
                && (await f.store.readScorecard(f.c)).fieldRevisions.strokes === 3,
                'Only an explicit renewed decision overwrites the current server value');
        }
        finally
        {
            await f.store.close();
        }
    });

    return summary;
})();
