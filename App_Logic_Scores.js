// =========================================================================
// BMAssistent / LIE Scorecard - Live-Scoring & Calculations (mit 9/18 Loch Support)
// App_Logic_Scores.js
// BSD (Allman) Style
// =========================================================================

var app = app || {};
app.logic = app.logic || {};


// =========================================================================
// Lokaler Score-Puffer & automatischer Flight-Sync
// =========================================================================

// S01 journal: immutable per-change/per-request records. Old bundles are quarantined.
app.logic.scoreSyncStorageKey = 'lie_score_sync_v1_s01__local:demo-lie-scorecards-local';
app.logic.v1Environment = 'local:demo-lie-scorecards-local';
app.logic.v1Fields = ['strokes', 'puts', 'lady', 'maxscore'];
app.logic.v1Own = function(value, key) { return Object.prototype.hasOwnProperty.call(value, key); };
app.logic.v1Freeze = function(value)
{
    if (value && typeof value === 'object')
    {
        Object.values(value).forEach(app.logic.v1Freeze);
        Object.freeze(value);
    }
    return value;
};
app.logic.v1Key = function(round, key)
{
    if (typeof round !== 'string' || !round || /[/_\s]/.test(round) || !key.startsWith(round + '_')) throw new Error('Ungültiger Spieltag.');
    const parts = key.slice(round.length + 1).split('_');
    if (parts.length < 2 || parts.length > 3 || !parts[0] || /[/\s]/.test(parts[0]) || !/^[1-9]\d*$/.test(parts[1])
        || Number(parts[1]) > 18 || (parts.length === 3 && !['puts', 'lady', 'maxscore'].includes(parts[2]))) throw new Error('Ungültiger Scoreschlüssel.');
    return { spieltagId: round, spielerId: parts[0], hole: Number(parts[1]), field: parts[2] || 'strokes' };
};
app.logic.createV1ScoreJournal = function(owner)
{
    const prefix = app.logic.scoreSyncStorageKey + '__' + encodeURIComponent(owner);
    let sequence = 0;
    const page = crypto.randomUUID();
    let writer = page;
    try
    {
        const key = app.logic.scoreSyncStorageKey + '__writer';
        writer = sessionStorage.getItem(key) || page;
        sessionStorage.setItem(key, writer);
    }
    catch (_) { /* Different page IDs force a conflict rather than unsafe adoption. */ }
    function write(kind, id, data)
    {
        const key = prefix + '__' + kind + '__' + id;
        const json = JSON.stringify(data), previous = localStorage.getItem(key);
        if (previous !== null && previous !== undefined && previous !== json) throw new Error('Widersprüchlicher lokaler Beleg.');
        localStorage.setItem(key, json);
    }
    function read()
    {
        const ops = [], requests = [], receipts = [];
        for (let i = 0; i < localStorage.length; i++)
        {
            const key = localStorage.key(i);
            if (!key || !key.startsWith(prefix + '__')) continue;
            const value = JSON.parse(localStorage.getItem(key));
            if (!value || value.owner !== owner || value.environment !== app.logic.v1Environment || value.schemaVersion !== 1) throw new Error('Lokaler Puffer ist beschädigt.');
            if (key.startsWith(prefix + '__op__')) ops.push(value);
            else if (key.startsWith(prefix + '__group__') && Array.isArray(value.operations)) ops.push(...value.operations);
            else if (key.startsWith(prefix + '__request__')) requests.push(value);
            else if (key.startsWith(prefix + '__receipt__')) receipts.push(value);
            else throw new Error('Unbekannter lokaler Beleg.');
        }
        const byId = new Map(ops.map(op => [op.changeId, op]));
        const acked = new Set(), superseded = new Set(), blocked = new Set(), reserved = new Set();
        for (const op of ops)
        {
            if (typeof op.changeId !== 'string' || !op.changeId || !Number.isSafeInteger(op.sequence)
                || !['set', 'delete'].includes(op.operation) || !Array.isArray(op.supersedes)) throw new Error('Ungültige lokale Änderung.');
            const context = app.logic.v1Key(op.spieltagId, op.key);
            if (op.owner !== owner || op.environment !== app.logic.v1Environment || op.schemaVersion !== 1
                || context.spielerId !== op.spielerId || context.hole !== op.hole || context.field !== op.field
                || typeof op.page !== 'string' || typeof op.writer !== 'string'
                || (op.operation === 'delete' ? op.value !== null : ['lady', 'maxscore'].includes(op.field)
                    ? typeof op.value !== 'boolean' : !Number.isSafeInteger(op.value) || op.value < (op.field === 'strokes' ? 1 : 0))) throw new Error('Beschädigte lokale Feldoperation.');
            sequence = Math.max(sequence, op.sequence);
            for (const id of op.supersedes)
            {
                if (!byId.has(id) || byId.get(id).key !== op.key) throw new Error('Ungültiger lokaler Vorgänger.');
                superseded.add(id);
            }
        }
        for (const req of requests)
        {
            if (!req.wire || req.requestId !== req.wire.requestId || req.wire.owner !== owner || req.wire.environment !== app.logic.v1Environment) throw new Error('Ungültiger lokaler Request.');
            const ids = req.wire.payload.flatMap(card => card.changes.map(op => op.changeId));
            if (new Set(ids).size !== ids.length || ids.some(id => !byId.has(id))) throw new Error('Request ohne eindeutige lokale Änderung.');
            for (const card of req.wire.payload)
                for (const change of card.changes)
                {
                    const op = byId.get(change.changeId);
                    if (op.spieltagId !== req.wire.spieltagId || op.spieltagId !== card.spieltagId || op.spielerId !== card.spielerId
                        || op.hole !== card.hole || op.field !== change.field || op.operation !== change.operation || op.value !== change.value) throw new Error('Request widerspricht lokaler Änderung.');
                }
            const matching = receipts.filter(r => r.requestId === req.requestId);
            if (matching.length > 1) throw new Error('Mehrdeutige Bestätigung.');
            const receipt = matching[0];
            if (!receipt)
            {
                ids.forEach(id => { reserved.add(id); blocked.add(byId.get(id).key); });
            }
            else if (receipt.outcome === 'not-applied')
            {
                if (!receipt.retryable) ids.forEach(id => blocked.add(byId.get(id).key));
            }
            else
            {
                if (receipt.outcome !== 'acknowledged' || !Array.isArray(receipt.acknowledgedChangeIds)
                    || new Set(receipt.acknowledgedChangeIds).size !== receipt.acknowledgedChangeIds.length
                    || receipt.acknowledgedChangeIds.some(id => !ids.includes(id))) throw new Error('Fremde Bestätigung.');
                receipt.acknowledgedChangeIds.forEach(id => acked.add(id));
                ids.filter(id => !acked.has(id)).forEach(id => { reserved.add(id); blocked.add(byId.get(id).key); });
            }
        }
        if (receipts.some(r => !requests.some(q => q.requestId === r.requestId))) throw new Error('Bestätigung ohne Request.');
        const active = ops.filter(op => !acked.has(op.changeId) && !superseded.has(op.changeId));
        const groups = new Map();
        active.forEach(op => { const list = groups.get(op.key) || []; list.push(op); groups.set(op.key, list); });
        for (const [key, list] of groups)
            if (new Set(list.map(op => op.page)).size > 1 && new Set(list.map(op => op.writer)).size > 1) blocked.add(key);
        const latest = [...groups.values()].map(list => list.sort((a, b) => a.sequence - b.sequence || a.changeId.localeCompare(b.changeId)).at(-1));
        return { ops, requests, receipts, active, latest, acked, blocked, reserved };
    }
    function append(round, edits)
    {
        const state = read();
        const changes = edits.map(edit =>
        {
            const context = app.logic.v1Key(round, edit.key);
            const operation = edit.deleted ? 'delete' : 'set';
            const value = edit.deleted ? null : edit.value;
            if (operation === 'set' && (['lady', 'maxscore'].includes(context.field) ? typeof value !== 'boolean'
                : !Number.isSafeInteger(value) || value < (context.field === 'strokes' ? 1 : 0))) throw new Error('Ungültiger Scorewert.');
            return Object.assign(context, { key: edit.key, operation, value });
        });
        if (!changes.length || new Set(changes.map(edit => edit.key)).size !== changes.length) throw new Error('Ungültige Feldgruppe.');
        const operations = changes.map(edit => Object.assign(edit, { schemaVersion: 1, owner, environment: app.logic.v1Environment,
            changeId: crypto.randomUUID(), sequence: ++sequence, page, writer,
            supersedes: state.active.filter(old => old.key === edit.key && old.writer === writer && !state.reserved.has(old.changeId)).map(old => old.changeId) }));
        // Atomic acceptance of compound actions: quota failure cannot persist half a Strich.
        if (operations.length === 1) write('op', operations[0].changeId, operations[0]);
        else write('group', crypto.randomUUID(), { schemaVersion: 1, owner, environment: app.logic.v1Environment, operations });
        return operations;
    }

    function prepare(wire)
    {
        write('request', wire.requestId, { schemaVersion: 1, owner, environment: app.logic.v1Environment, requestId: wire.requestId, wire });
    }
    function acknowledge(wire, response)
    {
        if (!response || response.requestId !== wire.requestId) throw new Error('Requestausgang unklar.');
        const ids = wire.payload.flatMap(card => card.changes.map(op => op.changeId));
        let receipt;
        if (response.success !== true && response.definitelyNotApplied === true)
            receipt = { outcome: 'not-applied', retryable: response.retryable === true, acknowledgedChangeIds: [] };
        else
        {
            if (response.success !== true || !Array.isArray(response.acknowledgedChangeIds)
                || new Set(response.acknowledgedChangeIds).size !== response.acknowledgedChangeIds.length
                || response.acknowledgedChangeIds.some(id => !ids.includes(id))) throw new Error('Requestausgang unklar.');
            receipt = { outcome: 'acknowledged', acknowledgedChangeIds: ids.filter(id => response.acknowledgedChangeIds.includes(id)) };
        }
        Object.assign(receipt, { schemaVersion: 1, owner, environment: app.logic.v1Environment, requestId: wire.requestId });
        write('receipt', wire.requestId, receipt);
        return receipt;
    }
    return { owner, prefix, read, append, prepare, acknowledge };
};
app.logic.refreshV1ScoreProjection = function(journal)
{
    if (journal !== app.state.v1Journal || journal.owner !== String(app.state.currentUser && app.state.currentUser.id)) return;
    const data = journal.read();
    app.state.liveScores = {};
    app.state.pendingScoreKeys = {};
    app.state.v1DeletedKeys = {};
    data.latest.forEach(op =>
    {
        app.state.pendingScoreKeys[op.key] = op.changeId;
        if (op.operation === 'delete') app.state.v1DeletedKeys[op.key] = true;
        else app.state.liveScores[op.key] = op.value;
    });
    app.state.v1JournalState = data;
    if (data.ops.length) app.state.scoreBufferOwner = journal.owner;
    // Non-authoritative checkpoint only; operation records are the recovery source.
    try { if (data.ops.length) localStorage.setItem(journal.prefix, JSON.stringify({ owner: journal.owner, environment: app.logic.v1Environment,
        liveScores: app.state.liveScores, pendingScoreKeys: app.state.pendingScoreKeys })); } catch (_) { /* journal remains durable */ }
};
app.logic.restoreLocalScoreBuffer = function()
{
    const owner = app.state.currentUser && String(app.state.currentUser.id);
    if (!owner) return;
    if (!app.state.v1Journal || app.state.v1Journal.owner !== owner || !app.state.scoreSyncRestored)
    {
        app.state.v1Journal = app.logic.createV1ScoreJournal(owner);
        app.state.scoreBufferOwner = null;
        app.state.v1PersistenceError = null;
        app.state.v1WaitingKeys = new Set();
        app.state.scoreRestoredOwner = owner;
        app.state.scoreSyncRestored = true;
    }
    try
    {
        const old = 'lie_score_sync_v1__local:demo-lie-scorecards-local__' + encodeURIComponent(owner);
        app.state.v1LegacyBuffer = !!(localStorage.getItem(old) || localStorage.getItem('lie_score_sync_v1'));
        app.logic.refreshV1ScoreProjection(app.state.v1Journal);
    }
    catch (error) { app.state.v1PersistenceError = 'Speicherfehler – lokaler Puffer gesperrt.'; }
};
app.logic.persistLocalScoreBuffer = function()
{
    try { app.logic.refreshV1ScoreProjection(app.state.v1Journal); return !app.state.v1PersistenceError; }
    catch (_) { app.state.v1PersistenceError = 'Speicherfehler – nicht gespeichert.'; return false; }
};
app.logic.getV1DisplayedValue = function(key, fallback)
{
    if (app.state.v1DeletedKeys && app.state.v1DeletedKeys[key]) return undefined;
    return app.logic.v1Own(app.state.liveScores || {}, key) ? app.state.liveScores[key] : fallback;
};

app.logic.getOwnFlightForSpieltag = function(spieltagId)
{
    if (!app.state.currentUser)
    {
        return null;
    }

    const currentPlayerId = String(app.state.currentUser.id || '').trim();

    return (app.state.flights || []).find(
        function(flight)
        {
            if (String(flight.spieltagId || '').trim() !== String(spieltagId || '').trim())
            {
                return false;
            }

            const ids = String(flight.spielerIdsCsv || '')
                .split(',')
                .map(function(id) { return String(id).trim(); })
                .filter(Boolean);

            return ids.includes(currentPlayerId);
        }
    ) || null;
};


app.logic.getFlightForPlayer = function(spieltagId, spielerId)
{
    const targetPlayerId = String(spielerId || '').trim();

    return (app.state.flights || []).find(
        function(flight)
        {
            if (String(flight.spieltagId || '').trim() !== String(spieltagId || '').trim())
            {
                return false;
            }

            const ids = String(flight.spielerIdsCsv || '')
                .split(',')
                .map(function(id) { return String(id).trim(); })
                .filter(Boolean);

            return ids.includes(targetPlayerId);
        }
    ) || null;
};

app.logic.getFlightSeq = function(flight)
{
    if (!flight)
    {
        return 0;
    }

    const value = flight.seq ?? flight.flightSeq ?? String(flight.id || '').split('-').pop();
    return /^[1-9]\d*$/.test(String(value)) && Number.isSafeInteger(Number(value)) ? Number(value) : 0;
};

app.logic.syncAllPendingScoreFlights = function(spieltagId)
{
    const owner = String(app.state.currentUser && app.state.currentUser.id);
    app.logic.restoreLocalScoreBuffer();
    if (!navigator.onLine)
    {
        app.logic.updateScoreSyncStatus(spieltagId);
        return;
    }

    const flightSeqs = [];

    Object.keys(app.state.pendingScoreKeys || {}).forEach(
        function(key)
        {
            if (!key.startsWith(String(spieltagId) + '_'))
            {
                return;
            }

            const parts = key.split('_');
            const flight = app.logic.getFlightForPlayer(spieltagId, parts[1]);
            const seq = app.logic.getFlightSeq(flight);

            if (seq > 0 && !flightSeqs.includes(seq))
            {
                flightSeqs.push(seq);
            }
        }
    );

    const syncNext = function(index)
    {
        if (owner !== String(app.state.currentUser && app.state.currentUser.id)) return;
        if (index >= flightSeqs.length)
        {
            app.logic.updateScoreSyncStatus(spieltagId);
            return;
        }

        if (app.state.scoreSyncInProgress)
        {
            setTimeout(function() { syncNext(index); }, 300);
            return;
        }

        app.logic.syncScoresWithServer(spieltagId, flightSeqs[index], true, true);

        const waitForFinish = function()
        {
            if (app.state.scoreSyncInProgress)
            {
                setTimeout(waitForFinish, 300);
                return;
            }

            syncNext(index + 1);
        };

        setTimeout(waitForFinish, 300);
    };

    syncNext(0);
};

app.logic.updateScoreSyncStatus = function(spieltagId, state)
{
    const el = document.getElementById('score-sync-status');
    if (!el || (app.state.activeScoreSpieltagId && String(app.state.activeScoreSpieltagId) !== String(spieltagId))) return;
    const keys = Object.keys(app.state.pendingScoreKeys || {}).filter(k => k.startsWith(String(spieltagId) + '_'));
    const blocked = app.state.v1JournalState && keys.some(k => app.state.v1JournalState.blocked.has(k));
    let text;
    if (app.state.v1PersistenceError) text = app.state.v1PersistenceError;
    else if (blocked && !app.state.scoreSyncInProgress) text = 'Konflikt / Ausgang unklar – ' + keys.length + ' ausstehend; Senden gesperrt.';
    else if (state === 'locking') text = 'Senden gesperrt – sichere Tabsperre fehlt.';
    else if (state === 'error') text = 'Sync-Fehler – Änderungen bleiben ausstehend.';
    else if (state === 'syncing' || app.state.scoreSyncInProgress) text = 'Lokal gespeichert · ' + keys.length + ' ausstehend · sende …';
    else if (keys.length) text = 'Lokal gespeichert · ' + keys.length + ' ausstehend' + (!navigator.onLine ? ' · offline' : '')
        + (app.state.v1WaitingKeys && keys.some(k => app.state.v1WaitingKeys.has(k)) ? ' · wartet auf gültige Schlagbasis' : '');
    else if (app.state.v1JournalState && app.state.v1JournalState.ops.some(op => op.spieltagId === String(spieltagId) && app.state.v1JournalState.acked.has(op.changeId))) text = 'Serverbestätigt';
    else text = 'Bereit – keine neuen Eingaben';
    if (app.state.v1LegacyBuffer) text += ' · alter Puffer getrennt, Wiederherstellung prüfen';
    el.className = 'text-xs font-bold px-3 py-2 rounded-xl ' + (/Fehler|fehler|gesperrt|Konflikt/.test(text) ? 'bg-red-100 text-red-800' : keys.length ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800');
    el.innerHTML = text;
};
app.logic.markScorePending = function(spieltagId, key)
{
    return app.logic.markScoreFieldsPending(spieltagId, [key]);
};
app.logic.markScoreFieldsPending = function(spieltagId, keys)
{
    const edits = keys.map(key => ({ key, deleted: !app.logic.v1Own(app.state.liveScores || {}, key), value: app.state.liveScores && app.state.liveScores[key] }));
    app.logic.restoreLocalScoreBuffer();
    if (app.state.v1PersistenceError) { app.logic.updateScoreSyncStatus(spieltagId); return false; }
    try
    {
        app.state.v1Journal.append(String(spieltagId), edits);
        app.logic.refreshV1ScoreProjection(app.state.v1Journal);
    }
    catch (error)
    {
        try { app.logic.refreshV1ScoreProjection(app.state.v1Journal); } catch (_) {}
        app.state.v1PersistenceError = 'Speicherfehler – Eingabe nicht gespeichert.';
        if (app.logic.showToast) app.logic.showToast(app.state.v1PersistenceError, 'error');
        app.logic.updateScoreSyncStatus(spieltagId);
        return false;
    }
    app.logic.updateScoreSyncStatus(spieltagId);
    const owner = app.state.v1Journal.owner;
    const parsed = app.logic.v1Key(String(spieltagId), keys[0]);
    const flight = app.logic.getFlightForPlayer(spieltagId, parsed.spielerId);
    const seq = app.logic.getFlightSeq(flight);
    if (seq > 0)
    {
        app.state.scoreAutoSyncTimers = app.state.scoreAutoSyncTimers || {};
        const timerKey = owner + ':' + spieltagId + ':' + seq;
        clearTimeout(app.state.scoreAutoSyncTimers[timerKey]);
        app.state.scoreAutoSyncTimers[timerKey] = setTimeout(function()
        {
            delete app.state.scoreAutoSyncTimers[timerKey];
            if (String(app.state.currentUser && app.state.currentUser.id) === owner)
                app.logic.syncScoresWithServer(spieltagId, seq, true, true);
        }, 1500);
    }
    return true;
};

app.logic.initScoreAutoSync = function(spieltagId)
{
    app.logic.restoreLocalScoreBuffer();
    app.logic.updateScoreSyncStatus(spieltagId);

    if (!app.state.scoreSyncListenersReady)
    {
        app.state.scoreSyncListenersReady = true;

        window.addEventListener('online', function()
        {
            const currentSpieltagId = app.state.activeScoreSpieltagId;
            if (currentSpieltagId)
            {
                app.logic.updateScoreSyncStatus(currentSpieltagId);
                app.logic.syncAllPendingScoreFlights(currentSpieltagId);
            }
        });

        window.addEventListener('offline', function()
        {
            if (app.state.activeScoreSpieltagId)
            {
                app.logic.updateScoreSyncStatus(app.state.activeScoreSpieltagId);
            }
        });

        app.state.scorePeriodicSyncId = setInterval(function()
        {
            const currentSpieltagId = app.state.activeScoreSpieltagId;
            if (currentSpieltagId && navigator.onLine)
            {
                app.logic.syncAllPendingScoreFlights(currentSpieltagId);
            }
        }, 30000);
    }

    app.state.activeScoreSpieltagId = spieltagId;
};

app.logic.calculateHoleVorgabe = function(spieler, spieltag, holeNr)
{
    if (!spieler || !spieltag)
    {
        return 0;
    }

    const kursId = spieltag.kursId;
    const hcp = parseFloat(spieler.hcpLIE);

    if (isNaN(hcp))
    {
        return 0;
    }

    // Spielvorgabe für den Kurs ermitteln
    const hcpsForKurs = (app.state.handicaps || []).filter(function(h)
    {
        return String(h.kursId).trim() === String(kursId).trim();
    });

    const vorgabeMatch = hcpsForKurs.find(function(h)
    {
        return parseFloat(h.vorgabe) === hcp;
    });

    let spielvorgabeTotal = vorgabeMatch
        ? parseInt(vorgabeMatch.spielvorgabe)
        : Math.round(hcp);

    // Alle Bahnen des ausgewählten Kurses
    let gespielteBahnen = (app.state.bahnen || []).filter(function(b)
    {
        return String(b.kursId).trim() === String(kursId).trim();
    });

    const is9Loch = (
        spieltag.bahnAnzahl === 9 ||
        String(spieltag.rundenTyp || '').startsWith('9')
    );

    // Bei Front-/Back-Nine nur die tatsächlich gespielten Bahnen verwenden
    if (spieltag.rundenTyp === '9-Front')
    {
        gespielteBahnen = gespielteBahnen.filter(function(b)
        {
            return parseInt(b.nr) <= 9;
        });
    }
    else if (spieltag.rundenTyp === '9-Back')
    {
        gespielteBahnen = gespielteBahnen.filter(function(b)
        {
            return parseInt(b.nr) >= 10;
        });
    }

    // Bei einer 9-Loch-Runde wird die Spielvorgabe halbiert
    if (is9Loch)
    {
        spielvorgabeTotal = Math.round(spielvorgabeTotal / 2);
    }

    if (gespielteBahnen.length === 0)
    {
        return 0;
    }

    // Die tatsächlich gespielten Bahnen nach SI sortieren.
    // Damit entsteht für eine 9-Loch-Runde automatisch die Rangfolge 1..9.
    gespielteBahnen.sort(function(a, b)
    {
        return parseInt(a.si) - parseInt(b.si);
    });

    const bahnIndex = gespielteBahnen.findIndex(function(b)
    {
        return parseInt(b.nr) === parseInt(holeNr);
    });

    if (bahnIndex < 0)
    {
        return 0;
    }

    const anzahlBahnen = gespielteBahnen.length;

    const basisSchlaege = Math.floor(spielvorgabeTotal / anzahlBahnen);
    const restSchlaege = spielvorgabeTotal % anzahlBahnen;

    let holeVorgabe = basisSchlaege;

    // Die schwierigsten Bahnen erhalten die verbleibenden Schläge.
    // Durch die SI-Sortierung entsprechen die ersten Einträge
    // den niedrigsten Stroke-Index-Werten.
    if (bahnIndex < restSchlaege)
    {
        holeVorgabe += 1;
    }

    return holeVorgabe;
};

app.logic.calculateNettoStableford = function(strokes, par, holeVorgabe)
{
    if (!strokes || strokes <= 0) 
    {
        return 0;
    }
    
    let persoenlichesPar = parseInt(par) + parseInt(holeVorgabe);
    let differenz = persoenlichesPar - parseInt(strokes);
    
    let punkte = 2 + differenz;
    return punkte < 0 ? 0 : punkte;
};

app.logic.adjustScore = function(spieltagId, spielerId, holeNr, delta, par, spielvorgabe)
{
    const key = `${spieltagId}_${spielerId}_${holeNr}`;
    const maxScoreKey = `${spieltagId}_${spielerId}_${holeNr}_maxscore`;
    
    const dbScores = app.state.scoreCards.filter(function(sc) { return String(sc.spieltagId) === String(spieltagId) && String(sc.spielerId) === String(spielerId); });
    const dbMatch = dbScores.find(function(sc) { return sc.hole !== undefined && parseInt(sc.hole) === holeNr; });
    const hatDbScore = dbMatch ? parseInt(dbMatch.strokes) : undefined;

    let aktuellerScore = app.state.liveScores[key] || hatDbScore || parseInt(par);
    let neuerScore = aktuellerScore + delta;
    if (neuerScore < 1) 
    {
        neuerScore = 1;
    }

    const clearsMax = !!app.logic.getV1DisplayedValue(maxScoreKey, dbMatch && dbMatch.maxscore);
    app.state.liveScores[key] = neuerScore;
    if (clearsMax) app.state.liveScores[maxScoreKey] = false;
    if (app.logic.markScoreFieldsPending(spieltagId, clearsMax ? [key, maxScoreKey] : [key]) === false) return false;

    const scoreEl = document.getElementById(`score-val-${spielerId}`);
    if (scoreEl) 
    {
        scoreEl.innerText = neuerScore;
    }

    if (clearsMax)
    {
        app.state.liveScores[maxScoreKey] = false;
        const maxBtn = document.getElementById(`maxscore-btn-${spielerId}`);
        if (maxBtn)
        {
            maxBtn.style.backgroundColor = "#ffffff";
            maxBtn.style.borderColor = "#d4d4d8";
            maxBtn.style.color = "#57534e";
            maxBtn.classList.remove("animate-pulse");
            maxBtn.querySelector('i').className = "fas fa-ban";
            maxBtn.querySelector('span').innerText = "Max Ø";
        }
    }

    const nettoPkt = app.logic.calculateNettoStableford(neuerScore, par, spielvorgabe);
    const badgeEl = document.getElementById(`netto-badge-${spielerId}`);
    if (badgeEl) 
    {
        badgeEl.innerText = `${nettoPkt} Netto-Pkt`;
    }
};

app.logic.adjustLiveValue = function(spieltagId, spielerId, holeNr, field, delta)
{
    const key = `${spieltagId}_${spielerId}_${holeNr}_${field}`;
    
    const cached = (app.state.scoreCards || []).find(c => String(c.spieltagId) === String(spieltagId) && String(c.spielerId) === String(spielerId) && Number(c.hole) === Number(holeNr));
    let currentVal = app.logic.getV1DisplayedValue(key, cached && cached[field]);
    if (currentVal === undefined)
    {
        currentVal = 2; 
    }
    
    let newVal = parseInt(currentVal) + delta;
    if (newVal < 0) 
    {
        newVal = 0;
    }
    
    app.state.liveScores[key] = newVal;
    if (app.logic.markScorePending(spieltagId, key) === false) return false;
    
    const element = document.getElementById(`${field}-val-${spielerId}`);
    if (element)
    {
        element.innerText = newVal;
    }
};

app.logic.toggleLiveBoolean = function(spieltagId, spielerId, holeNr, field)
{
    const key = `${spieltagId}_${spielerId}_${holeNr}_${field}`;
    
    const cached = (app.state.scoreCards || []).find(c => String(c.spieltagId) === String(spieltagId) && String(c.spielerId) === String(spielerId) && Number(c.hole) === Number(holeNr));
    const currentVal = !!app.logic.getV1DisplayedValue(key, cached && cached[field]);
    const newVal = !currentVal;
    
    app.state.liveScores[key] = newVal;
    if (app.logic.markScorePending(spieltagId, key) === false) return false;
    
    const btn = document.getElementById(`${field}-btn-${spielerId}`);
    if (btn)
    {
        if (newVal)
        {
            btn.style.backgroundColor = "#ef4444";
            btn.style.borderColor = "#dc2626";
            btn.style.color = "#ffffff";
            btn.style.fontWeight = "900";
            btn.querySelector('i').className = "fas fa-beer-mug-empty";
            btn.querySelector('span').innerText = "🍻";
        }
        else
        {
            btn.style.backgroundColor = "#ffffff";
            btn.style.borderColor = "#d4d4d8";
            btn.style.color = "#737373";
            btn.style.fontWeight = "900";
            btn.querySelector('i').className = "fas fa-wine-glass-empty";
            btn.querySelector('span').innerText = "Lady";
        }
    }
};

app.logic.toggleMaxScore = function(spieltagId, spielerId, holeNr, maxScoreValue, par, spielvorgabe)
{
    const maxScoreKey = `${spieltagId}_${spielerId}_${holeNr}_maxscore`;
    const scoreKey = `${spieltagId}_${spielerId}_${holeNr}`;
    
    const cached = (app.state.scoreCards || []).find(c => String(c.spieltagId) === String(spieltagId) && String(c.spielerId) === String(spielerId) && Number(c.hole) === Number(holeNr));
    const currentMax = !!app.logic.getV1DisplayedValue(maxScoreKey, cached && cached.maxscore);
    const newMax = !currentMax;
    
    app.state.liveScores[maxScoreKey] = newMax;
    app.state.liveScores[scoreKey] = newMax ? maxScoreValue : par;
    if (app.logic.markScoreFieldsPending(spieltagId, [maxScoreKey, scoreKey]) === false) return false;
    
    const scoreValElement = document.getElementById(`score-val-${spielerId}`);
    const maxBtn = document.getElementById(`maxscore-btn-${spielerId}`);
    
    if (newMax)
    {
        app.state.liveScores[scoreKey] = maxScoreValue;

        if (scoreValElement) 
        {
            scoreValElement.innerText = maxScoreValue;
        }
        
        if (maxBtn)
        {
            maxBtn.style.backgroundColor = "#f59e0b";
            maxBtn.style.borderColor = "#d97706";
            maxBtn.style.color = "#ffffff";
            maxBtn.style.fontWeight = "900";
            maxBtn.classList.add("animate-pulse");
            maxBtn.querySelector('i').className = "fas fa-stroke";
            maxBtn.querySelector('span').innerText = "Strich";
        }
    }
    else
    {
        app.state.liveScores[scoreKey] = par;

        if (scoreValElement) 
        {
            scoreValElement.innerText = par;
        }
        
        if (maxBtn)
        {
            maxBtn.style.backgroundColor = "#ffffff";
            maxBtn.style.borderColor = "#d4d4d8";
            maxBtn.style.color = "#57534e";
            maxBtn.style.fontWeight = "900";
            maxBtn.classList.remove("animate-pulse");
            maxBtn.querySelector('i').className = "fas fa-ban";
            maxBtn.querySelector('span').innerText = "Max Ø";
        }
    }
    
    const neuerScore = app.state.liveScores[scoreKey];
    const neueNettoPunkte = app.logic.calculateNettoStableford(neuerScore, par, spielvorgabe);
    const nettoBadge = document.getElementById(`netto-badge-${spielerId}`);
    if (nettoBadge)
    {
        nettoBadge.innerText = `${neueNettoPunkte} Netto-Pkt`;
    }
};

app.logic.syncScoresWithServer = async function(spieltagId, flightSeq, silent, allowSelectedFlight)
{
    const roundId = String(spieltagId);
    const owner = String(app.state.currentUser && app.state.currentUser.id);
    try
    {
        app.environment.assertReady();
        app.logic.restoreLocalScoreBuffer();
        if (app.state.v1PersistenceError || !navigator.onLine) { app.logic.updateScoreSyncStatus(roundId); return; }
        if (!navigator.locks || typeof navigator.locks.request !== 'function') { app.logic.updateScoreSyncStatus(roundId, 'locking'); return; }
        const own = app.logic.getOwnFlightForSpieltag(roundId);
        const candidates = (app.state.flights || []).filter(f => String(f.spieltagId) === roundId && app.logic.getFlightSeq(f) === Number(flightSeq));
        const selected = allowSelectedFlight ? candidates[0] : own;
        if (!Number.isInteger(Number(flightSeq)) || Number(flightSeq) < 1 || candidates.length !== 1 || !selected
            || (!allowSelectedFlight && selected !== candidates[0])) throw new Error('Flight nicht eindeutig.');
        const members = String(selected.spielerIdsCsv || '').split(',').map(x => x.trim());
        if (members.some(x => !x || /[/_\s]/.test(x)) || new Set(members).size !== members.length) throw new Error('Ungültige Flight-Mitglieder.');
        if (!members.includes(owner) && !['Admin', 'Spielleiter'].includes(app.state.currentUser.role)) throw new Error('Fremder Flight.');
        if (members.some(id => (app.state.flights || []).filter(f => String(f.spieltagId) === roundId
            && String(f.spielerIdsCsv || '').split(',').map(x => x.trim()).includes(id)).length !== 1)) throw new Error('Mehrdeutige Flight-Mitgliedschaft.');
        const journal = app.state.v1Journal;
        return await navigator.locks.request(journal.prefix + ':' + roundId + ':' + selected.id, { ifAvailable: true }, async function(lock)
        {
            if (!lock || owner !== String(app.state.currentUser && app.state.currentUser.id) || journal !== app.state.v1Journal) return;
            const data = journal.read(), grouped = new Map();
            app.state.v1WaitingKeys = new Set();
            for (const op of data.latest)
            {
                if (op.spieltagId !== roundId || !members.includes(op.spielerId) || data.blocked.has(op.key)) continue;
                const id = 'SC-' + roundId + '-' + op.spielerId + '-' + op.hole;
                const cached = (app.state.scoreCards || []).filter(c => c.id === id);
                if (cached.length > 1 || cached.some(c => String(c.spieltagId) !== roundId || String(c.spielerId) !== op.spielerId || Number(c.hole) !== op.hole)) throw new Error('Widersprüchliche Scoreidentität.');
                const stroke = data.latest.find(p => p.spieltagId === roundId && p.spielerId === op.spielerId && p.hole === op.hole && p.field === 'strokes');
                if (op.field !== 'strokes' && !cached.some(c => Number.isSafeInteger(c.strokes) && c.strokes > 0)
                    && !(stroke && stroke.operation === 'set' && !data.blocked.has(stroke.key))) { app.state.v1WaitingKeys.add(op.key); continue; }
                if (!grouped.has(id))
                {
                    const player = (app.state.spieler || []).filter(p => String(p.id) === op.spielerId);
                    const rounds = (app.state.spieltage || []).filter(r => String(r.id) === roundId);
                    if (player.length !== 1 || rounds.length !== 1) throw new Error('Spieler/Runde nicht eindeutig.');
                    grouped.set(id, { id, spieltagId: roundId, spielerId: op.spielerId, hole: op.hole, flightSeq: Number(flightSeq),
                        creation: { hcpStart: player[0].hcpLIE == null ? NaN : Number(player[0].hcpLIE), strokesGiven: app.logic.calculateHoleVorgabe(player[0], rounds[0], op.hole) }, changes: [] });
                }
                grouped.get(id).changes.push({ changeId: op.changeId, field: op.field, operation: op.operation, value: op.value });
            }
            if (!grouped.size) { app.logic.refreshV1ScoreProjection(journal); app.logic.updateScoreSyncStatus(roundId); return; }
            const wire = app.logic.v1Freeze({ protocol: 'v1-s01', requestId: crypto.randomUUID(), owner, environment: app.logic.v1Environment,
                spieltagId: roundId, flightId: String(selected.id), flightSeq: Number(flightSeq), payload: [...grouped.values()] });
            // Must be durable before the first possible network send.
            try { journal.prepare(wire); }
            catch (error)
            {
                app.state.v1PersistenceError = 'Speicherfehler – Request nicht gesendet.';
                throw error;
            }
            app.state.v1RequestsRunning = (app.state.v1RequestsRunning || 0) + 1;
            app.state.scoreSyncInProgress = true;
            try
            {
                app.logic.updateScoreSyncStatus(roundId, 'syncing');
                const response = await app.logic.apiRequest('saveLiveScores', wire);
                const receipt = journal.acknowledge(wire, response);
                if (journal === app.state.v1Journal && owner === String(app.state.currentUser && app.state.currentUser.id))
                {
                    if (receipt.outcome === 'acknowledged')
                        wire.payload.forEach(card =>
                        {
                            const applied = card.changes.filter(op => receipt.acknowledgedChangeIds.includes(op.changeId));
                            if (!applied.length) return;
                            let target = (app.state.scoreCards || []).find(c => c.id === card.id);
                            if (!target)
                            {
                                target = { id: card.id, spieltagId: card.spieltagId, spielerId: card.spielerId, hole: card.hole, flightSeq: card.flightSeq, ...card.creation };
                                app.state.scoreCards.push(target);
                            }
                            applied.forEach(op => { if (op.operation === 'delete') delete target[op.field]; else target[op.field] = op.value; });
                        });
                    app.logic.refreshV1ScoreProjection(journal);
                }
            }
            catch (error)
            {
                // Prepared record stays durable. Unknown outcomes cannot be blindly retried.
                if (journal === app.state.v1Journal) app.logic.refreshV1ScoreProjection(journal);
            }
            finally
            {
                app.state.v1RequestsRunning--;
                app.state.scoreSyncInProgress = app.state.v1RequestsRunning > 0;
                if (journal === app.state.v1Journal) app.logic.updateScoreSyncStatus(roundId);
            }
        });
    }
    catch (error)
    {
        if (app.logic.showToast && !silent) app.logic.showToast('V1 nicht gesendet: ' + error.message, 'error');
        try { app.logic.updateScoreSyncStatus(roundId, 'error'); } catch (_) { /* UI failure cannot retain the flight lock. */ }
        return { success: false };
    }
};
