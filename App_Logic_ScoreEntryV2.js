// Explicit V2 read/local-write controller. No score transport, timers or automatic startup.
var app = app || {};

app.createScoreEntryV2Controller = function(options)
{
    'use strict';

    const store = options.store;
    let epoch = 0;
    let active = null;
    let actionTail = Promise.resolve();
    const fields = ['strokes', 'puts', 'lady', 'maxscore'];

    function requireValid(condition, message)
    {
        if (!condition)
        {
            throw new Error(message);
        }
    }

    function identifier(value)
    {
        return typeof value === 'string' && value.length > 0 && value.length <= 200
            && value.trim() === value && !/[\x00-\x1f/]/.test(value) && value !== '.' && value !== '..';
    }

    function invalidate()
    {
        epoch++;
        active = null;
    }

    async function identity()
    {
        const auth = await options.getIdentity();
        const state = options.getState();
        requireValid(auth && identifier(auth.ownerUid) && auth.ownerUid === auth.playerId
            && auth.mustChangePin !== true && String(state.currentUser?.id) === auth.playerId,
            'Invalid score entry identity.');
        return auth;
    }

    async function guard(ticket, expected)
    {
        const auth = await identity();
        requireValid(ticket === epoch && auth.ownerUid === expected.ownerUid
            && auth.playerId === expected.playerId, 'Stale score entry context.');
    }

    function ownContext(auth, spieltagId)
    {
        requireValid(identifier(spieltagId), 'Invalid round ID.');
        const flights = (options.getState().flights || []).filter(function(flight)
        {
            return flight.spieltagId === spieltagId && String(flight.spielerIdsCsv || '').split(',').map(function(id)
            {
                return id.trim();
            }).includes(auth.playerId);
        });
        requireValid(flights.length === 1, 'Missing or ambiguous own flight.');
        const flight = flights[0];
        const members = String(flight.spielerIdsCsv).split(',').map(function(id)
        {
            return id.trim();
        });
        requireValid(identifier(flight.id) && members.every(identifier)
            && new Set(members).size === members.length, 'Invalid own flight.');
        return { ownerUid: auth.ownerUid, playerId: auth.playerId, spieltagId: spieltagId,
            flightId: flight.id, mode: 'ownFlight', members: members };
    }

    function validateResponse(response, c)
    {
        requireValid(response && ['ownerUid', 'playerId', 'spieltagId', 'flightId'].every(function(key)
        {
            return response[key] === c[key];
        }), 'Read context mismatch.');
        requireValid(JSON.stringify(response.members) === JSON.stringify(c.members)
            && Number.isSafeInteger(response.flightSeq) && response.flightSeq > 0, 'Read flight mismatch.');
        const round = response.round;
        const ranges = { '18': [18, 1, 18], '9': [9, 1, 9], '9-Front': [9, 1, 9], '9-Back': [9, 10, 18] };
        const range = round && Object.hasOwn(ranges, round.rundenTyp) ? ranges[round.rundenTyp] : null;
        requireValid(range && round.bahnAnzahl === range[0] && round.status === 'Aktiv'
            && identifier(round.kursId), 'Invalid read round.');
        const holes = Array.from({ length: range[2] - range[1] + 1 }, function(_, index)
        {
            return range[1] + index;
        });
        requireValid(JSON.stringify(round.holes) === JSON.stringify(holes)
            && Array.isArray(round.holeData) && round.holeData.length === holes.length
            && round.holeData.every(function(hole, index)
            {
                return hole.nr === holes[index] && Number.isSafeInteger(hole.par) && hole.par > 0
                    && Number.isSafeInteger(hole.si) && hole.si > 0;
            }), 'Invalid read holes.');
        requireValid(Array.isArray(response.players) && response.players.length === c.members.length
            && response.players.every(function(player, index)
            {
                return player.id === c.members[index];
            }), 'Invalid read members.');
        requireValid(Array.isArray(response.cards) && response.cards.length === holes.length * c.members.length,
            'Incomplete authoritative read.');
        const seen = new Set();
        response.cards.forEach(function(card)
        {
            const id = 'SC-' + c.spieltagId + '-' + card.spielerId + '-' + card.hole;
            requireValid(c.members.includes(card.spielerId) && holes.includes(card.hole)
                && card.documentId === id && !seen.has(id) && typeof card.exists === 'boolean'
                && card.values && typeof card.values === 'object' && !Array.isArray(card.values)
                && card.fieldRevisions && Object.keys(card.fieldRevisions).length === 4
                && fields.every(function(field)
                {
                    return Number.isSafeInteger(card.fieldRevisions[field]) && card.fieldRevisions[field] >= 0;
                }) && typeof card.generation === 'string'
                && (card.exists ? /^(legacy:\d+:\d+|gen:[^/\s]+)$/.test(card.generation) : card.generation === 'absent'),
                'Invalid authoritative scorecard.');
            requireValid(Object.entries(card.values).every(function(entry)
            {
                return fields.includes(entry[0]) && (entry[0] === 'strokes' || entry[0] === 'puts'
                    ? Number.isSafeInteger(entry[1]) && entry[1] >= (entry[0] === 'strokes' ? 1 : 0)
                    : typeof entry[1] === 'boolean');
            }) && (card.exists || (Object.keys(card.values).length === 0 && fields.every(function(field)
            {
                return card.fieldRevisions[field] === 0;
            }))), 'Invalid score values or absence.');
            seen.add(id);
        });
    }

    async function open(input)
    {
        // Finish already accepted local input before replacing its context.
        await actionTail;
        invalidate();
        const ticket = epoch;
        const request = structuredClone(input);
        const auth = await identity();
        requireValid(ticket === epoch, 'Stale score entry context.');
        let c;
        let response;
        if (request.offline === true)
        {
            requireValid(options.contextStore, 'No offline context storage.');
            response = await options.contextStore.get({ ownerUid: auth.ownerUid, playerId: auth.playerId,
                spieltagId: request.spieltagId });
            await guard(ticket, auth);
            requireValid(response, 'No validated offline flight context.');
            c = { ownerUid: auth.ownerUid, playerId: auth.playerId, spieltagId: request.spieltagId,
                flightId: response.flightId, mode: 'ownFlight', members: response.members };
            requireValid(identifier(c.flightId) && Array.isArray(c.members) && c.members.includes(auth.playerId)
                && c.members.every(identifier) && new Set(c.members).size === c.members.length, 'Invalid offline flight.');
            validateResponse(response, c);
            active = { context: c, response: response, ticket: ticket, offline: true };
            return structuredClone(response);
        }
        c = ownContext(auth, request.spieltagId);
        response = structuredClone(await options.readTransport(
        {
            ownerUid: c.ownerUid, playerId: c.playerId, spieltagId: c.spieltagId
        }));
        await guard(ticket, c);
        validateResponse(response, c);
        requireValid(JSON.stringify(ownContext(auth, c.spieltagId)) === JSON.stringify(c), 'Flight changed during read.');
        // A previously absent card may have been created by another golfer.
        // Bind it only with no local work; never replace a known prior lifecycle.
        const createdElsewhere=new Set();
        for (const card of response.cards)
        {
            const local = await store.readScorecard(Object.assign({}, c, card));
            if(local.generation && local.generation!==card.generation)
            {
                requireValid(local.generation==='absent' && card.exists && !local.pendingOperations.length, 'Read generation mismatch; lokale Daten bleiben erhalten.');
                createdElsewhere.add(card.documentId);
            }
        }
        for (const card of response.cards)
        {
            await guard(ticket, c);
            if(createdElsewhere.has(card.documentId))
                await store.replaceServerGeneration(Object.assign({},c,card),card.values,card.fieldRevisions,{generation:card.generation,replacesGeneration:'absent'});
            else await store.putServerSnapshot(Object.assign({}, c, card), card.values, card.fieldRevisions,
                { generation: card.generation });
        }
        await guard(ticket, c);
        if (options.contextStore)
        {
            await options.contextStore.put(response);
        }
        await guard(ticket, c);
        active = { context: c, response: response, ticket: ticket, offline: false };
        return structuredClone(response);
    }

    function refresh()
    {
        requireValid(active, 'No active score entry context.');
        return open({ spieltagId: active.context.spieltagId });
    }

    async function readEntry(spielerId, hole)
    {
        requireValid(active, 'No active score entry context.');
        const selected = active;
        const c = selected.context;
        requireValid(c.members.includes(spielerId) && selected.response.round.holes.includes(hole), 'Invalid score entry target.');
        await guard(selected.ticket, c);
        if (!selected.offline)
        {
            requireValid(JSON.stringify(ownContext(await identity(), c.spieltagId)) === JSON.stringify(c),
                'Flight changed since authoritative read.');
        }
        const result = await store.readScorecard(Object.assign({}, c,
        {
            spielerId: spielerId, hole: hole, documentId: 'SC-' + c.spieltagId + '-' + spielerId + '-' + hole
        }));
        await guard(selected.ticket, c);
        return result;
    }

    function project(raw, hole)
    {
        const displayed = raw.displayed;
        const confirmed = Number.isSafeInteger(displayed.strokes) && displayed.strokes > 0;
        return { confirmed: confirmed, strokes: confirmed ? displayed.strokes : hole.par,
            puts: confirmed && Number.isSafeInteger(displayed.puts) ? displayed.puts : 2,
            lady: displayed.lady === true, maxscore: displayed.maxscore === true };
    }

    async function readAll()
    {
        requireValid(active, 'No active score entry context.');
        const selected = active;
        const entries = {};
        for (const player of selected.context.members)
        {
            for (const hole of selected.response.round.holes)
            {
                entries[player + '_' + hole] = await readEntry(player, hole);
            }
        }
        await guard(selected.ticket, selected.context);
        return entries;
    }

    function action(spielerId, hole, name, delta)
    {
        const selected = active;
        const work = async function()
        {
            requireValid(selected && selected === active, 'Stale score action.');
            requireValid(['confirm', 'strokes', 'puts', 'lady', 'strich'].includes(name), 'Invalid score action.');
            if (name === 'strokes' || name === 'puts')
            {
                requireValid(delta === 1 || delta === -1, 'Invalid score delta.');
            }
            const raw = await readEntry(spielerId, hole);
            const holeData = selected.response.round.holeData.find(function(item)
            {
                return item.nr === hole;
            });
            const entry = project(raw, holeData);
            const changes = [];
            function set(field, value)
            {
                changes.push({ field: field, operation: 'set', value: value });
            }
            if (name === 'confirm')
            {
                if (entry.confirmed)
                {
                    return raw;
                }
                set('strokes', holeData.par);
                set('puts', 2);
            }
            else if (name === 'lady')
            {
                set('lady', !entry.lady);
            }
            else if (name === 'strich')
            {
                if (entry.maxscore)
                {
                    changes.push({ field: 'strokes', operation: 'delete', value: null },
                        { field: 'puts', operation: 'delete', value: null });
                    set('maxscore', false);
                }
                else
                {
                    const allowance = options.calculateAllowance(spielerId, hole, selected.response);
                    requireValid(Number.isSafeInteger(allowance), 'Invalid hole allowance.');
                    set('strokes', holeData.par + allowance + 2);
                    set('puts', 3);
                    set('maxscore', true);
                }
            }
            else if (name === 'strokes')
            {
                set('strokes', Math.max(1, entry.strokes + delta));
                if (!Object.hasOwn(raw.displayed, 'puts'))
                {
                    set('puts', 2);
                }
                if (entry.maxscore)
                {
                    set('maxscore', false);
                }
            }
            else
            {
                if (!entry.confirmed)
                {
                    set('strokes', holeData.par);
                }
                set('puts', Math.max(0, entry.puts + delta));
            }
            await guard(selected.ticket, selected.context);
            requireValid(selected === active, 'Stale score action.');
            await store.appendChanges(Object.assign({}, selected.context,
            {
                spielerId: spielerId, hole: hole,
                documentId: 'SC-' + selected.context.spieltagId + '-' + spielerId + '-' + hole
            }), changes);
            // A committed operation remains in its original partition even after a view/user change.
            try
            {
                if (options.onAccepted) options.onAccepted(Object.freeze({...selected.context}));
                await guard(selected.ticket, selected.context);
                return await readEntry(spielerId, hole);
            }
            catch (error)
            {
                error.localCommit = true;
                throw error;
            }
        };
        const result = actionTail.then(work);
        actionTail = result.catch(function()
        {
        });
        return result;
    }

    return Object.freeze({ open: open, refresh: refresh, invalidate: invalidate,
        readEntry: readEntry, readAll: readAll, action: action, project: project });

};


// Same distribution as calculateHoleVorgabe, using only authoritative context inputs.
app.calculateScoreEntryAllowanceV2 = function(playerId,hole,response)
{
    const given=response.round.holeAllowances?.[playerId]?.[String(hole)];
    if(Number.isSafeInteger(given)&&given>=0)return given;
    const start=response.round.hcpStart?.[playerId];
    if(typeof start!=='number')throw new Error('Autoritativer Rundenstart fehlt.');
    return LieHcpRules.snapshot(response.round,response.round.holeData,start,response.handicaps || []).holeAllowances[String(hole)];
};

app.createFirebaseScoreEntryV2Controller = function()
{
    return app.createScoreEntryV2Controller(
    {
        store: app.scoreSyncStore,
        contextStore: app.createScoreEntryContextStore(),
        getState: function()
        {
            return app.state;
        },
        getIdentity: async function()
        {
            const user = firebase.auth().currentUser;
            if (!user)
            {
                return null;
            }
            if (navigator.onLine === false)
            {
                // Local-only access: the controller additionally requires this UID's
                // persisted authoritative context. This never authorizes a network send.
                return { ownerUid: user.uid, playerId: user.uid };
            }
            const token = await user.getIdTokenResult();
            if (firebase.auth().currentUser !== user)
            {
                return null;
            }
            return { ownerUid: user.uid, playerId: token.claims.playerId,
                mustChangePin: token.claims.mustChangePin };
        },
        readTransport: app.scoreSyncV2ReadCallableTransport,
        onAccepted: c => { if(app.scoreAutoSyncV2)app.scoreAutoSyncV2.notify(c); },
        calculateAllowance: function(playerId,hole,response)
        {
            const given=response.round.holeAllowances?.[playerId]?.[String(hole)];
            if(!Number.isSafeInteger(given) || given<0)throw new Error('Autoritative Rundenstart-Lochvorgabe fehlt (S06).');
            return given;
        }
    });
};


// Narrow offline bootstrap. No V1 restore, network read or score send.
app.openOfflineScoreEntryV2 = async function(user)
{
    if (!user || navigator.onLine !== false)
    {
        return false;
    }
    const contexts = app.createScoreEntryContextStore();
    let records;
    try
    {
        records = await contexts.list(user.uid);
    }
    finally
    {
        await contexts.close();
    }
    const record = records[0];
    const actor = record && record.response.players.find(function(player)
    {
        return player.id === user.uid;
    });
    if (!actor || record.response.ownerUid !== user.uid || record.response.playerId !== user.uid)
    {
        return false;
    }
    if (firebase.auth().currentUser !== user)
    {
        return false;
    }
    app.state.currentUser = Object.assign({}, actor,
    {
        mustChangePin: false,
        role: ['Spieler', 'Spielleiter', 'Admin'].includes(record.response.actorRole)
            ? record.response.actorRole : 'Spieler'
    });
    app.router.navigate('score_eingabe', { id: record.spieltagId, hole: record.response.round.holes[0] });
    return true;
};
