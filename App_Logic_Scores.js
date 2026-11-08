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

app.logic.scoreSyncStorageKey = 'lie_score_sync_v1__local:demo-lie-scorecards-local';

app.logic.restoreLocalScoreBuffer = function()
{
    const activeOwner = app.state.currentUser && String(app.state.currentUser.id);
    if (app.state.scoreSyncRestored && app.state.scoreRestoredOwner === activeOwner) return;
    if (app.state.scoreRestoredOwner !== activeOwner)
    {
        app.state.liveScores = {};
        app.state.pendingScoreKeys = {};
    }
    app.state.scoreRestoredOwner = activeOwner;
    app.state.scoreSyncRestored = true;
    app.state.scoreBufferOwner = null;
    app.state.pendingScoreKeys = app.state.pendingScoreKeys || {};

    try
    {
        const raw = localStorage.getItem(app.logic.scoreSyncStorageKey + "__" + encodeURIComponent(activeOwner));
        if (!raw)
        {
            return;
        }

        const saved = JSON.parse(raw);
        const owner = app.state.currentUser && String(app.state.currentUser.id);
        if (saved.environment !== 'local:demo-lie-scorecards-local' || saved.owner !== owner) return;
        app.state.scoreBufferOwner = owner;
        app.state.liveScores = Object.assign({}, saved.liveScores || {}, app.state.liveScores || {});
        app.state.pendingScoreKeys = Object.assign({}, saved.pendingScoreKeys || {});
    }
    catch (err)
    {
        console.warn('[ScoreSync] Lokaler Score-Puffer konnte nicht geladen werden:', err);
    }
};

app.logic.persistLocalScoreBuffer = function()
{
    try
    {
        const owner = app.state.currentUser && String(app.state.currentUser.id);
        if (!owner || app.state.scoreBufferOwner !== owner) return;
        localStorage.setItem(
            app.logic.scoreSyncStorageKey + "__" + encodeURIComponent(owner),
            JSON.stringify(
                {
                    environment: 'local:demo-lie-scorecards-local',
                    owner: app.state.currentUser && String(app.state.currentUser.id),
                    liveScores: app.state.liveScores || {},
                    pendingScoreKeys: app.state.pendingScoreKeys || {},
                    savedAt: new Date().toISOString()
                }
            )
        );
    }
    catch (err)
    {
        console.warn('[ScoreSync] Lokaler Score-Puffer konnte nicht gespeichert werden:', err);
    }
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

    return parseInt(flight.seq || flight.flightSeq || String(flight.id || '').split('-').pop()) || 0;
};

app.logic.syncAllPendingScoreFlights = function(spieltagId)
{
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

app.logic.updateScoreSyncStatus = function(spieltagId, state, pendingCount)
{
    const el = document.getElementById('score-sync-status');
    if (!el)
    {
        return;
    }

    const count = pendingCount !== undefined
        ? pendingCount
        : Object.keys(app.state.pendingScoreKeys || {}).filter(function(key)
        {
            return key.startsWith(String(spieltagId) + '_');
        }).length;

    if (!navigator.onLine)
    {
        el.className = 'text-xs bg-zinc-100 text-zinc-600 font-bold px-3 py-2 rounded-xl shadow-3xs';
        el.innerHTML = '<i class="fas fa-cloud mr-1"></i> Offline · lokal';
        return;
    }

    if (state === 'syncing')
    {
        el.className = 'text-xs bg-amber-100 text-amber-800 font-bold px-3 py-2 rounded-xl shadow-3xs';
        el.innerHTML = `<i class="fas fa-circle-notch fa-spin mr-1"></i> ${count || ''} Sync`;
        return;
    }

    if (state === 'error')
    {
        el.className = 'text-xs bg-red-100 text-red-700 font-bold px-3 py-2 rounded-xl shadow-3xs';
        el.innerHTML = '<i class="fas fa-triangle-exclamation mr-1"></i> Sync-Fehler';
        return;
    }

    if (count > 0)
    {
        el.className = 'text-xs bg-amber-100 text-amber-800 font-bold px-3 py-2 rounded-xl shadow-3xs';
        el.innerHTML = `<i class="fas fa-cloud-arrow-up mr-1"></i> ${count} offen`;
        return;
    }

    el.className = 'text-xs bg-emerald-100 text-emerald-800 font-bold px-3 py-2 rounded-xl shadow-3xs';
    el.innerHTML = '<i class="fas fa-cloud-circle-check mr-1"></i> Synchronisiert';
};

app.logic.markScorePending = function(spieltagId, key)
{
    const owner = app.state.currentUser && String(app.state.currentUser.id);
    if (app.state.scoreRestoredOwner !== owner)
    {
        // A screen must restore its own partition before accepting input.
        app.logic.restoreLocalScoreBuffer();
    }
    app.state.scoreBufferOwner = owner;
    app.state.pendingScoreKeys = app.state.pendingScoreKeys || {};
    app.state.scoreAutoSyncTimers = app.state.scoreAutoSyncTimers || {};
    app.state.pendingScoreKeys[key] = Date.now();
    app.logic.persistLocalScoreBuffer();
    app.logic.updateScoreSyncStatus(spieltagId);

    const parts = key.split('_');
    const flight = app.logic.getFlightForPlayer(spieltagId, parts[1]);
    const flightSeq = app.logic.getFlightSeq(flight);

    if (flightSeq <= 0)
    {
        return;
    }

    const timerKey = `${spieltagId}_${flightSeq}`;
    clearTimeout(app.state.scoreAutoSyncTimers[timerKey]);
    app.state.scoreAutoSyncTimers[timerKey] = setTimeout(
        function()
        {
            delete app.state.scoreAutoSyncTimers[timerKey];
            app.logic.syncScoresWithServer(spieltagId, flightSeq, true, true);
        },
        1500
    );
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

    app.state.liveScores[key] = neuerScore;
    app.logic.markScorePending(spieltagId, key);

    const scoreEl = document.getElementById(`score-val-${spielerId}`);
    if (scoreEl) 
    {
        scoreEl.innerText = neuerScore;
    }

    if (app.state.liveScores[maxScoreKey])
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
    
    let currentVal = app.state.liveScores[key];
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
    app.logic.markScorePending(spieltagId, key);
    
    const element = document.getElementById(`${field}-val-${spielerId}`);
    if (element)
    {
        element.innerText = newVal;
    }
};

app.logic.toggleLiveBoolean = function(spieltagId, spielerId, holeNr, field)
{
    const key = `${spieltagId}_${spielerId}_${holeNr}_${field}`;
    
    const currentVal = !!app.state.liveScores[key];
    const newVal = !currentVal;
    
    app.state.liveScores[key] = newVal;
    app.logic.markScorePending(spieltagId, key);
    
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
    
    const currentMax = !!app.state.liveScores[maxScoreKey];
    const newMax = !currentMax;
    
    app.state.liveScores[maxScoreKey] = newMax;
    app.logic.markScorePending(spieltagId, maxScoreKey);
    
    const scoreValElement = document.getElementById(`score-val-${spielerId}`);
    const maxBtn = document.getElementById(`maxscore-btn-${spielerId}`);
    
    if (newMax)
    {
        app.state.liveScores[scoreKey] = maxScoreValue;
        app.logic.markScorePending(spieltagId, scoreKey);
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
        app.logic.markScorePending(spieltagId, scoreKey);
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

app.logic.syncScoresWithServer = function(spieltagId, flightSeq, silent, allowSelectedFlight)
{
    app.environment.assertReady();
    app.logic.restoreLocalScoreBuffer();
    if (app.state.scoreBufferOwner !== (app.state.currentUser && String(app.state.currentUser.id))) return;

    if (app.state.scoreSyncInProgress)
    {
        return;
    }

    let ownFlight = app.logic.getOwnFlightForSpieltag(spieltagId);

    if (allowSelectedFlight && flightSeq)
    {
        const selectedSeq = parseInt(flightSeq);
        const selectedFlight = (app.state.flights || []).find(
            function(flight)
            {
                if (String(flight.spieltagId || '').trim() !== String(spieltagId || '').trim())
                {
                    return false;
                }

                const seq = parseInt(flight.seq || flight.flightSeq || String(flight.id || '').split('-').pop()) || 0;
                return seq === selectedSeq;
            }
        );

        if (selectedFlight)
        {
            ownFlight = selectedFlight;
        }
    }

    if (!ownFlight)
    {
        app.logic.updateScoreSyncStatus(spieltagId, 'error');
        if (!silent)
        {
            app.logic.showToast('Flight konnte nicht ermittelt werden.', 'error');
        }
        return;
    }

    const ownPlayerIds = String(ownFlight.spielerIdsCsv || '')
        .split(',')
        .map(function(id) { return String(id).trim(); })
        .filter(Boolean);

    const pendingKeys = Object.keys(app.state.pendingScoreKeys || {}).filter(
        function(key)
        {
            if (!key.startsWith(String(spieltagId) + '_'))
            {
                return false;
            }

            const parts = key.split('_');
            return ownPlayerIds.includes(String(parts[1] || '').trim());
        }
    );

    if (pendingKeys.length === 0)
    {
        app.logic.updateScoreSyncStatus(spieltagId);
        return;
    }

    if (!navigator.onLine)
    {
        app.logic.persistLocalScoreBuffer();
        app.logic.updateScoreSyncStatus(spieltagId, 'offline', pendingKeys.length);
        return;
    }

    const scoresPayload = [];
    const processedHoles = {};
    const ownFlightSeq = parseInt(ownFlight.seq || ownFlight.flightSeq || String(ownFlight.id || '').split('-').pop()) || parseInt(flightSeq) || 1;

    pendingKeys.forEach(
        function(key)
        {
            const parts = key.split('_');
            const spielerId = parts[1];
            const holeNr = parseInt(parts[2]);
            const uniqueHoleKey = `${spielerId}_${holeNr}`;

            if (processedHoles[uniqueHoleKey])
            {
                return;
            }
            processedHoles[uniqueHoleKey] = true;

            const scoreKey = `${spieltagId}_${spielerId}_${holeNr}`;
            const ladyKey = `${spieltagId}_${spielerId}_${holeNr}_lady`;
            const putsKey = `${spieltagId}_${spielerId}_${holeNr}_puts`;
            const maxScoreKey = `${spieltagId}_${spielerId}_${holeNr}_maxscore`;

            const strokes = app.state.liveScores[scoreKey];
            if (strokes === undefined || strokes === null || parseInt(strokes) <= 0)
            {
                return;
            }

            const spieler = (app.state.spieler || []).find(function(s)
            {
                return String(s.id).trim() === String(spielerId).trim();
            });
            const spieltag = (app.state.spieltage || []).find(function(st)
            {
                return String(st.id).trim() === String(spieltagId).trim();
            });

            if (!spieler || !spieltag)
            {
                return;
            }

            scoresPayload.push(
                {
                    id: `SC-${spieltagId}-${spielerId}-${holeNr}`,
                    spieltagId: spieltagId,
                    flightSeq: ownFlightSeq,
                    spielerId: spielerId,
                    hole: holeNr,
                    strokes: parseInt(strokes),
                    strokesGiven: app.logic.calculateHoleVorgabe(spieler, spieltag, holeNr),
                    hcpStart: parseInt(spieler.hcpLIE),
                    lady: !!app.state.liveScores[ladyKey],
                    puts: app.state.liveScores[putsKey] !== undefined ? parseInt(app.state.liveScores[putsKey]) : 2,
                    maxscore: !!app.state.liveScores[maxScoreKey]
                }
            );
        }
    );

    if (scoresPayload.length === 0)
    {
        app.logic.updateScoreSyncStatus(spieltagId, 'error', pendingKeys.length);
        return;
    }

    app.state.scoreSyncInProgress = true;
    app.logic.updateScoreSyncStatus(spieltagId, 'syncing', pendingKeys.length);

    const sendingOwner = app.state.scoreBufferOwner;
    const sendingPending = app.state.pendingScoreKeys;
    app.logic.apiRequest('saveLiveScores', { payload: scoresPayload })
        .then(
            function(response)
            {
                if (!response || !response.success)
                {
                    throw new Error(response ? response.error : 'Unbekannter Sync-Fehler');
                }

                if (app.state.scoreBufferOwner !== sendingOwner || app.state.pendingScoreKeys !== sendingPending
                    || String(app.state.currentUser && app.state.currentUser.id) !== sendingOwner) return;
                pendingKeys.forEach(function(key)
                {
                    delete app.state.pendingScoreKeys[key];
                });

                scoresPayload.forEach(function(item)
                {
                    const idx = app.state.scoreCards.findIndex(function(sc)
                    {
                        return String(sc.id).trim() === String(item.id).trim();
                    });

                    if (idx !== -1)
                    {
                        app.state.scoreCards[idx] = item;
                    }
                    else
                    {
                        app.state.scoreCards.push(item);
                    }
                });

                app.logic.persistLocalScoreBuffer();
                app.logic.updateScoreSyncStatus(spieltagId);

                if (!silent)
                {
                    app.logic.showToast('Scores synchronisiert.', 'success');
                }
            }
        )
        .catch(
            function(err)
            {
                console.error('[ScoreSync] Synchronisation fehlgeschlagen:', err);
                app.logic.persistLocalScoreBuffer();
                app.logic.updateScoreSyncStatus(spieltagId, 'error', pendingKeys.length);

                if (!silent)
                {
                    app.logic.showToast('Synchronisation fehlgeschlagen – Daten bleiben lokal gespeichert.', 'error');
                }
            }
        )
        .finally(
            function()
            {
                app.state.scoreSyncInProgress = false;
            }
        );
};

