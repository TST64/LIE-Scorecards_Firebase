// =========================================================================
// Isolated V2 client adapter. No timers, views or V1 synchronization hooks.
// =========================================================================
var app = app || {};

app.createScoreSyncV2Adapter = function(options)
{
    'use strict';

    if (!options || !options.store || typeof options.transport !== 'function'
        || typeof options.getIdentity !== 'function')
    {
        throw new Error('V2 sync requires storage, transport and an identity provider.');
    }
    const store = options.store;
    const transport = options.transport;
    const getIdentity = options.getIdentity;
    const running = new Map();

    function context(input)
    {
        const c = {};
        ['ownerUid', 'playerId', 'spieltagId', 'flightId'].forEach(function(key)
        {
            const value = input && input[key];
            if (typeof value !== 'string' || !value || value.trim() !== value
                || value.length > 200 || /[\x00-\x1f/]/.test(value) || value === '.' || value === '..')
            {
                throw new Error('Invalid explicit V2 context: ' + key);
            }
            c[key] = value;
        });
        if (!['ownFlight', 'selectedFlight'].includes(input.mode))
        {
            throw new Error('Explicit V2 flight mode is required.');
        }
        c.mode = input.mode;
        return Object.freeze(c);
    }

    async function requireIdentity(c)
    {
        const identity = await getIdentity();
        if (!identity || identity.ownerUid !== c.ownerUid || identity.playerId !== c.playerId)
        {
            throw new Error('V2 request does not belong to the active authenticated user.');
        }
    }

    async function send(c, snapshot)
    {
        if (snapshot.protocol !== 'score-v2' || snapshot.mode !== c.mode || !snapshot.wireRequest)
        {
            throw new Error('Request is not an immutable V2 snapshot of this mode.');
        }
        let response;
        try
        {
            await requireIdentity(c);
            // getRequestSnapshot freezes the complete persisted wire payload on retries.
            response = await transport(snapshot.wireRequest);
            if (!response || response.requestId !== snapshot.requestId || !Array.isArray(response.results))
            {
                throw new Error('Invalid or ambiguous V2 server response.');
            }
            const acknowledgedIds = response.results.filter(function(entry)
            {
                return entry && entry.status === 'acknowledged';
            }).map(function(entry)
            {
                return entry.changeId;
            });
            // Cache values/revisions, result states and exact-ID deletions commit atomically.
            // A late response remains bound to its original user even after logout.
            await store.acknowledgeRequest(c, snapshot.requestId, acknowledgedIds, response.results);
        }
        catch (error)
        {
            await store.markRequestOutcome(c, snapshot.requestId, 'failed');
            throw error;
        }
        return response;
    }

    function exclusive(c, work)
    {
        const key = JSON.stringify([c.ownerUid, c.playerId, c.spieltagId, c.flightId]);
        if (running.has(key))
        {
            return Promise.reject(new Error('A V2 request is already running for this flight context.'));
        }
        const promise = Promise.resolve().then(work).finally(function()
        {
            running.delete(key);
        });
        running.set(key, promise);
        return promise;
    }

    function sync(input)
    {
        const c = context(input);
        return exclusive(c, async function()
        {
            await requireIdentity(c);
            // Selection and reservation live in one IndexedDB transaction, across tabs.
            const snapshot = await store.createRequestSnapshot(c, { protocol: 'score-v2' });
            if (snapshot)
            {
                return send(c, snapshot);
            }
            const data = await store.inspect(c);
            const issues = data.operationIssues.filter(function(entry)
            {
                return data.pendingOperations.some(function(op) { return op.changeId === entry.changeId; });
            });
            return { requestId: null, blocked: issues.length > 0, results: issues };
        });
    }

    function retry(input, requestId)
    {
        const c = context(input);
        return exclusive(c, async function()
        {
            await requireIdentity(c);
            return send(c, await store.prepareRequestRetry(c, requestId));
        });
    }

    function resolveField(input, field, action, expectation)
    {
        const c = context(input);
        const card = Object.assign({}, input, c);
        const expected = expectation === undefined ? undefined : structuredClone(expectation);
        return exclusive(c, async function()
        {
            await requireIdentity(c);
            return store.resolveField(card, field, action, expected);
        });
    }

    return Object.freeze({ sync: sync, retry: retry, resolveField: resolveField });
};

// Lazy production transport: merely loading this file never contacts Firebase.
app.scoreSyncV2CallableTransport = async function(request)
{
    const user = firebase.auth().currentUser;
    if (!user || user.uid !== request.ownerUid)
    {
        throw new Error('No matching Firebase session for V2 request.');
    }
    const callable = firebase.app().functions('europe-west1').httpsCallable('saveScoreOperationsV2');
    const response = await callable(request);
    return response.data;
};

app.createFirebaseScoreSyncV2Adapter = function()
{
    return app.createScoreSyncV2Adapter(
    {
        store: app.scoreSyncStore,
        transport: app.scoreSyncV2CallableTransport,
        getIdentity: async function()
        {
            const user = firebase.auth().currentUser;
            if (!user)
            {
                return null;
            }
            const token = await user.getIdTokenResult();
            return { ownerUid: user.uid, playerId: token.claims.playerId };
        }
    });
};


// Read-only transport; never creates a score operation or sends a write request.
app.scoreSyncV2ReadCallableTransport = async function(request)
{
    const user = firebase.auth().currentUser;
    if (!user || user.uid !== request.ownerUid)
    {
        throw new Error('No matching Firebase session for V2 read.');
    }
    const token = await user.getIdTokenResult();
    if (firebase.auth().currentUser !== user || token.claims.playerId !== request.playerId
        || user.uid !== token.claims.playerId || token.claims.mustChangePin === true)
    {
        throw new Error('V2 read identity changed or is invalid.');
    }
    const callable = firebase.app().functions('europe-west1').httpsCallable('readOwnFlightScoresV2');
    const response = await callable(request);
    return response.data;
};
