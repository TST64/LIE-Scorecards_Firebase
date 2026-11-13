// BMAssistent / LIE Scorecard - Live-Scoring & Calculations (mit V2-Status & Offline-Queue)
// App_Logic_Scores.js
// BSD (Allman) Style
// =========================================================================

var app = app || {};
app.logic = app.logic || {};

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

    const hcpsForKurs = (app.state.handicaps || []).filter(h => String(h.kursId).trim() === String(kursId).trim());
    const vorgabeMatch = hcpsForKurs.find(h => parseFloat(h.vorgabe) === hcp);

    let spielvorgabeTotal = vorgabeMatch ? parseInt(vorgabeMatch.spielvorgabe) : Math.round(hcp);

    let gespielteBahnen = (app.state.bahnen || []).filter(b => String(b.kursId).trim() === String(kursId).trim());

    const is9Loch = (
        spieltag.bahnAnzahl === 9 ||
        String(spieltag.rundenTyp || '').startsWith('9')
    );

    if (spieltag.rundenTyp === '9-Front')
    {
        gespielteBahnen = gespielteBahnen.filter(b => parseInt(b.nr) <= 9);
    }
    else if (spieltag.rundenTyp === '9-Back')
    {
        gespielteBahnen = gespielteBahnen.filter(b => parseInt(b.nr) >= 10);
    }

    if (is9Loch)
    {
        spielvorgabeTotal = Math.round(spielvorgabeTotal / 2);
    }

    if (gespielteBahnen.length === 0)
    {
        return 0;
    }

    gespielteBahnen.sort((a, b) => parseInt(a.si) - parseInt(b.si));

    const bahnIndex = gespielteBahnen.findIndex(b => parseInt(b.nr) === parseInt(holeNr));
    if (bahnIndex < 0)
    {
        return 0;
    }

    const anzahlBahnen = gespielteBahnen.length;
    const basisSchlaege = Math.floor(spielvorgabeTotal / anzahlBahnen);
    const restSchlaege = spielvorgabeTotal % anzahlBahnen;

    let holeVorgabe = basisSchlaege;
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

// =========================================================================
// V2 Erfassungs- & Synchronisations-Status pro Spieler/Loch
// =========================================================================

app.logic.getOfflineQueueMap = function(spieltagId)
{
    try
    {
        const raw = localStorage.getItem(`lie_offline_scores_${spieltagId}`);
        return raw ? JSON.parse(raw) : {};
    }
    catch (e)
    {
        return {};
    }
};

app.logic.getHoleEntryStatus = function(spieltagId, spielerId, holeNr)
{
    app.state.liveScores = app.state.liveScores || {};
    const docId = `SC-${spieltagId}-${spielerId}-${holeNr}`;
    const offlineQueue = app.logic.getOfflineQueueMap(spieltagId);

    const dbMatch = (app.state.scoreCards || []).find(function(sc)
    {
        return String(sc.spieltagId).trim() === String(spieltagId).trim() &&
               String(sc.spielerId).trim() === String(spielerId).trim() &&
               sc.hole !== undefined && parseInt(sc.hole) === parseInt(holeNr);
    });

    const isConfirmedInSession = !!app.state.liveScores[`${spieltagId}_${spielerId}_${holeNr}_confirmed`];
    const isInOfflineQueue = !!offlineQueue[docId];
    const hasDbData = !!(dbMatch && dbMatch.strokes !== undefined && dbMatch.strokes !== null && dbMatch.strokes !== "");

    if (!isConfirmedInSession && !isInOfflineQueue && !hasDbData)
    {
        return 'open'; // Noch offen (nur Vorschlagswert Par / 2 Putts)
    }

    if (isInOfflineQueue)
    {
        return 'local_pending'; // Lokal erfasst/gespeichert, Server-Bestätigung steht noch aus
    }

    return 'synced'; // Serverbestätigt in Firestore
};

app.logic.markHoleVisited = function(spieltagId, holeNr)
{
    app.state.visitedHoles = app.state.visitedHoles || {};
    app.state.visitedHoles[`${spieltagId}_${holeNr}`] = true;
};

app.logic.isHoleVisited = function(spieltagId, holeNr)
{
    return !!(app.state.visitedHoles && app.state.visitedHoles[`${spieltagId}_${holeNr}`]);
};

app.logic.confirmPlayerHole = function(spieltagId, spielerId, holeNr, flightSeq)
{
    app.state.liveScores = app.state.liveScores || {};
    const confirmKey = `${spieltagId}_${spielerId}_${holeNr}_confirmed`;
    const scoreKey = `${spieltagId}_${spielerId}_${holeNr}`;
    const putsKey = `${spieltagId}_${spielerId}_${holeNr}_puts`;

    // Aktuelle Vorschlagswerte (z. B. Par & 2 Putts) explizit als bestätigt übernehmen
    const spieltag = (app.state.spieltage || []).find(st => String(st.id).trim() === String(spieltagId).trim());
    const bahn = (app.state.bahnen || []).find(b => spieltag && String(b.kursId).trim() === String(spieltag.kursId).trim() && parseInt(b.nr) === parseInt(holeNr));
    const defaultPar = bahn ? parseInt(bahn.par) : 4;

    if (app.state.liveScores[scoreKey] === undefined)
    {
        app.state.liveScores[scoreKey] = defaultPar;
    }
    if (app.state.liveScores[putsKey] === undefined)
    {
        app.state.liveScores[putsKey] = 2;
    }

    app.state.liveScores[confirmKey] = true;

    // Direkt lokal in die Offline-Queue schreiben
    const fSeq = flightSeq || (app.router && app.router.currentParams && app.router.currentParams.flightSeq) || 1;
    app.logic.saveOfflineQueue(spieltagId, fSeq, holeNr);

    // Visuelles Feedback auf der Karte und im Lochband sofort aktualisieren
    app.logic.updatePlayerCardStatusUI(spieltagId, spielerId, holeNr, 'local_pending');
    app.logic.refreshHoleNavBandUI(spieltagId, holeNr, fSeq);
};

app.logic.updatePlayerCardStatusUI = function(spieltagId, spielerId, holeNr, status)
{
    const cardEl = document.getElementById(`player-card-${spielerId}`);
    const badgeEl = document.getElementById(`entry-status-badge-${spielerId}`);

    if (cardEl)
    {
        cardEl.classList.remove(
            'bg-amber-50/90', 'border-amber-300',
            'bg-stone-50', 'border-stone-200',
            'bg-emerald-50/40', 'border-emerald-200'
        );

        if (status === 'open')
        {
            cardEl.classList.add('bg-amber-50/90', 'border-amber-300');
        }
        else if (status === 'local_pending')
        {
            cardEl.classList.add('bg-stone-50', 'border-stone-200');
        }
        else
        {
            cardEl.classList.add('bg-stone-50', 'border-stone-200');
        }
    }

    if (badgeEl)
    {
        if (status === 'open')
        {
            badgeEl.className = "inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 border border-amber-300";
            badgeEl.innerHTML = `<i class="fas fa-clock text-[9px]"></i> Noch offen (Vorschlag übernehmen)`;
        }
        else if (status === 'local_pending')
        {
            badgeEl.className = "inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200";
            badgeEl.innerHTML = `<i class="fas fa-mobile-alt text-[9px]"></i> Lokal gespeichert · ausstehend`;
        }
        else
        {
            badgeEl.className = "inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 border border-emerald-200";
            badgeEl.innerHTML = `<i class="fas fa-check-circle text-[9px]"></i> Serverbestätigt`;
        }
    }
};

// Debounce Timer Map für Auto-Save
let autoSaveTimeouts = {};

app.logic.autoSaveScoreFieldAtomic = function(spieltagId, spielerId, holeNr, field, value, flightSeq)
{
    const scoreId = `SC-${spieltagId}-${spielerId}-${holeNr}`;
    const timeoutKey = `${spieltagId}_${spielerId}_${holeNr}_${field}`;

    // Jede aktive Änderung bestätigt den Spieler automatisch
    app.state.liveScores = app.state.liveScores || {};
    app.state.liveScores[`${spieltagId}_${spielerId}_${holeNr}_confirmed`] = true;

    const fSeq = flightSeq || (app.router && app.router.currentParams && app.router.currentParams.flightSeq) || 1;
    app.logic.saveOfflineQueue(spieltagId, fSeq, holeNr);
    app.logic.updatePlayerCardStatusUI(spieltagId, spielerId, holeNr, 'local_pending');
    app.logic.refreshHoleNavBandUI(spieltagId, holeNr, fSeq);

    if (autoSaveTimeouts[timeoutKey])
    {
        clearTimeout(autoSaveTimeouts[timeoutKey]);
    }

    const statusEl = document.getElementById('connection-status');
    const syncBadge = document.getElementById('score-sync-status');
    if (statusEl)
    {
        statusEl.className = "w-3 h-3 rounded-full bg-amber-400";
    }
    if (syncBadge)
    {
        syncBadge.className = "text-[10px] font-bold px-2 py-1 rounded-lg bg-amber-100 text-amber-800 transition-colors whitespace-nowrap";
        syncBadge.innerHTML = `<i class="fas fa-clock mr-1"></i>Ausstehend`;
    }

    autoSaveTimeouts[timeoutKey] = setTimeout(async () =>
    {
        try
        {
            const payloadData = {
                scoreId: scoreId,
                spieltagId: spieltagId,
                spielerId: spielerId,
                holeNr: holeNr,
                field: field,
                value: value
            };

            const res = await app.logic.apiRequest('updateSingleScoreField', payloadData);
            if (!res || !res.success)
            {
                throw new Error(res ? res.error : 'Sync fehlgeschlagen');
            }

            // Aus Offline-Queue entfernen, sobald Server bestätigt hat, und scoreCards im State aktualisieren
            app.logic.markSinglePlayerHoleSynced(spieltagId, spielerId, holeNr, fSeq);

            if (statusEl)
            {
                statusEl.className = "w-3 h-3 rounded-full bg-teal-400";
            }
            if (syncBadge)
            {
                syncBadge.className = "text-[10px] font-bold px-2 py-1 rounded-lg bg-emerald-100 text-emerald-800 transition-colors whitespace-nowrap";
                syncBadge.innerHTML = `<i class="fas fa-check-circle mr-1"></i>Gespeichert`;
            }

            app.logic.updatePlayerCardStatusUI(spieltagId, spielerId, holeNr, 'synced');
            app.logic.refreshHoleNavBandUI(spieltagId, holeNr, fSeq);
        }
        catch (err)
        {
            console.error("Auto-save error (bleibt lokal in Queue):", err);
            if (statusEl)
            {
                statusEl.className = "w-3 h-3 rounded-full bg-amber-400";
            }
            if (syncBadge)
            {
                syncBadge.className = "text-[10px] font-bold px-2 py-1 rounded-lg bg-blue-100 text-blue-800 transition-colors whitespace-nowrap";
                syncBadge.innerHTML = `<i class="fas fa-hdd mr-1"></i>Lokal · offen`;
            }
        }
    }, 500);
};

app.logic.markSinglePlayerHoleSynced = function(spieltagId, spielerId, holeNr, flightSeq)
{
    try
    {
        const storageKey = `lie_offline_scores_${spieltagId}`;
        const docId = `SC-${spieltagId}-${spielerId}-${holeNr}`;
        const queueMap = app.logic.getOfflineQueueMap(spieltagId);
        const syncedItem = queueMap[docId];

        if (syncedItem)
        {
            delete queueMap[docId];
            if (Object.keys(queueMap).length === 0)
            {
                localStorage.removeItem(storageKey);
            }
            else
            {
                localStorage.setItem(storageKey, JSON.stringify(queueMap));
            }

            const idx = (app.state.scoreCards || []).findIndex(sc => String(sc.id).trim() === String(docId).trim());
            if (idx !== -1)
            {
                app.state.scoreCards[idx] = Object.assign({}, app.state.scoreCards[idx], syncedItem);
            }
            else
            {
                app.state.scoreCards.push(syncedItem);
            }
        }
    }
    catch (e)
    {
        console.warn('[SyncState] Konnte lokalen Queue-Eintrag nicht bereinigen:', e);
    }
};

app.logic.adjustScore = function(spieltagId, spielerId, holeNr, delta, par, spielvorgabe)
{
    const key = `${spieltagId}_${spielerId}_${holeNr}`;
    const maxScoreKey = `${spieltagId}_${spielerId}_${holeNr}_maxscore`;
    
    const dbScores = app.state.scoreCards.filter(sc => String(sc.spieltagId) === String(spieltagId) && String(sc.spielerId) === String(spielerId));
    const dbMatch = dbScores.find(sc => sc.hole !== undefined && parseInt(sc.hole) === holeNr);
    const hatDbScore = dbMatch ? parseInt(dbMatch.strokes) : undefined;

    let aktuellerScore = app.state.liveScores[key] || hatDbScore || parseInt(par);
    let neuerScore = aktuellerScore + delta;
    if (neuerScore < 1) 
    {
        neuerScore = 1;
    }

    app.state.liveScores[key] = neuerScore;
    app.logic.autoSaveScoreFieldAtomic(spieltagId, spielerId, holeNr, 'strokes', neuerScore);

    const scoreEl = document.getElementById(`score-val-${spielerId}`);
    if (scoreEl) 
    {
        scoreEl.innerText = neuerScore;
    }

    if (app.state.liveScores[maxScoreKey])
    {
        app.state.liveScores[maxScoreKey] = false;
        app.logic.autoSaveScoreFieldAtomic(spieltagId, spielerId, holeNr, 'maxscore', false);

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
    app.logic.autoSaveScoreFieldAtomic(spieltagId, spielerId, holeNr, field, newVal);
    
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
    app.logic.autoSaveScoreFieldAtomic(spieltagId, spielerId, holeNr, field, newVal);
    
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
    app.logic.autoSaveScoreFieldAtomic(spieltagId, spielerId, holeNr, 'maxscore', newMax);
    
    const scoreValElement = document.getElementById(`score-val-${spielerId}`);
    const maxBtn = document.getElementById(`maxscore-btn-${spielerId}`);
    
    if (newMax)
    {
        app.state.liveScores[scoreKey] = maxScoreValue;
        app.logic.autoSaveScoreFieldAtomic(spieltagId, spielerId, holeNr, 'strokes', maxScoreValue);

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
        app.logic.autoSaveScoreFieldAtomic(spieltagId, spielerId, holeNr, 'strokes', par);

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

app.logic.syncScoresWithServer = function(spieltagId, flightSeq)
{
    const keysToSync = Object.keys(app.state.liveScores).filter(k => k.startsWith(spieltagId + "_"));
    
    if (keysToSync.length === 0)
    {
        app.logic.showToast("Alles bereits automatisch gesichert.", "info");
        return;
    }

    const syncBtn = document.getElementById('sync-btn');
    if (syncBtn)
    {
        syncBtn.disabled = true;
        syncBtn.innerHTML = `<i class="fas fa-circle-notch fa-spin"></i> Sende...`;
    }

    app.logic.stopLivePolling();

    const scoresPayload = [];
    const verarbeiteteKeys = {};

    keysToSync.forEach(key =>
    {
        const parts = key.split('_'); 
        const spielerId = parts[1];
        const holeNr = parseInt(parts[2]);
        
        const uniqueHoleKey = `${spielerId}_${holeNr}`;
        if (verarbeiteteKeys[uniqueHoleKey]) return;
        verarbeiteteKeys[uniqueHoleKey] = true;

        const scoreKey = `${spieltagId}_${spielerId}_${holeNr}`;
        const ladyKey = `${spieltagId}_${spielerId}_${holeNr}_lady`;
        const putsKey = `${spieltagId}_${spielerId}_${holeNr}_puts`;
        const maxScoreKey = `${spieltagId}_${spielerId}_${holeNr}_maxscore`;
        
        let strokes = app.state.liveScores[scoreKey];
        if (strokes === undefined || strokes === null || strokes <= 0) return;

        const spieler = app.state.spieler.find(s => String(s.id).trim() === String(spielerId).trim());
        const spieltag = app.state.spieltage.find(st => String(st.id).trim() === String(spieltagId).trim());

        let strokesGiven = app.logic.calculateHoleVorgabe(spieler, spieltag, holeNr);

        scoresPayload.push({
            id: `SC-${spieltagId}-${spielerId}-${holeNr}`,
            spieltagId: spieltagId,
            flightSeq: parseInt(flightSeq) || 1,
            spielerId: spielerId,
            hole: holeNr,
            strokes: parseInt(strokes),
            strokesGiven: strokesGiven,
            hcpStart: parseInt(spieler.hcpLIE),
            lady: !!app.state.liveScores[ladyKey],
            puts: app.state.liveScores[putsKey] !== undefined ? parseInt(app.state.liveScores[putsKey]) : 2,
            maxscore: !!app.state.liveScores[maxScoreKey]
        });
    });

    if (scoresPayload.length === 0)
    {
        if (syncBtn) { syncBtn.disabled = false; syncBtn.innerHTML = `<i class="fas fa-cloud-upload-alt mr-1"></i> Sichern`; }
        app.logic.startLivePolling(spieltagId, null, flightSeq);
        return;
    }

    app.logic.apiRequest('saveLiveScores', { payload: scoresPayload })
        .then(response =>
        {
            if (response && response.success)
            {
                scoresPayload.forEach(item =>
                {
                    const idx = app.state.scoreCards.findIndex(sc => String(sc.id).trim() === String(item.id).trim());
                    if (idx !== -1) 
                    {
                        app.state.scoreCards[idx] = item;
                    }
                    else 
                    {
                        app.state.scoreCards.push(item);
                    }
                });

                app.logic.showToast("Scores erfolgreich gesichert!", "success");
            }
            else
            {
                app.logic.showToast("Sync-Fehler: " + (response ? response.error : "Unbekannt"), "error");
            }

            if (syncBtn)
            {
                syncBtn.disabled = false;
                syncBtn.innerHTML = `<i class="fas fa-cloud-upload-alt mr-1"></i> Sichern`;
            }
            app.logic.startLivePolling(spieltagId, null, flightSeq);
        })
        .catch(err =>
        {
            console.error("Netzwerkfehler beim Sichern:", err);
            app.logic.showToast("Fehler beim Sichern der Daten", "error");
            if (syncBtn) { syncBtn.disabled = false; syncBtn.innerHTML = `<i class="fas fa-cloud-upload-alt mr-1"></i> Sichern`; }
            app.logic.startLivePolling(spieltagId, null, flightSeq);
        });
};

// =========================================================================
// Lokale Offline-Queue & Lochwechsel-Speicherung (kein manueller Sichern-Button)
// =========================================================================

app.logic.saveOfflineQueue = function(spieltagId, flightSeq, holeNr)
{
    try
    {
        const storageKey = `lie_offline_scores_${spieltagId}`;
        const queueMap = app.logic.getOfflineQueueMap(spieltagId);

        const keysForHole = Object.keys(app.state.liveScores || {}).filter(function(k)
        {
            return k.startsWith(`${spieltagId}_`) && k.split('_')[2] === String(holeNr);
        });

        const processedPlayers = {};
        keysForHole.forEach(function(k)
        {
            const parts = k.split('_');
            const spielerId = parts[1];
            if (processedPlayers[spielerId]) return;
            processedPlayers[spielerId] = true;

            // Nur explizit bestätigte / geänderte Spieler in die Offline-Queue aufnehmen!
            const isConfirmed = !!app.state.liveScores[`${spieltagId}_${spielerId}_${holeNr}_confirmed`];
            if (!isConfirmed) return;

            const scoreKey = `${spieltagId}_${spielerId}_${holeNr}`;
            const ladyKey = `${spieltagId}_${spielerId}_${holeNr}_lady`;
            const putsKey = `${spieltagId}_${spielerId}_${holeNr}_puts`;
            const maxScoreKey = `${spieltagId}_${spielerId}_${holeNr}_maxscore`;

            const strokes = app.state.liveScores[scoreKey];
            if (strokes === undefined || strokes === null || strokes <= 0) return;

            const spieler = (app.state.spieler || []).find(s => String(s.id).trim() === String(spielerId).trim());
            const spieltag = (app.state.spieltage || []).find(st => String(st.id).trim() === String(spieltagId).trim());
            const strokesGiven = app.logic.calculateHoleVorgabe(spieler, spieltag, holeNr);

            const docId = `SC-${spieltagId}-${spielerId}-${holeNr}`;
            queueMap[docId] = {
                id: docId,
                spieltagId: String(spieltagId),
                flightSeq: parseInt(flightSeq) || 1,
                spielerId: String(spielerId),
                hole: parseInt(holeNr),
                strokes: parseInt(strokes),
                strokesGiven: strokesGiven,
                hcpStart: spieler ? parseInt(spieler.hcpLIE) : 0,
                lady: !!app.state.liveScores[ladyKey],
                puts: app.state.liveScores[putsKey] !== undefined ? parseInt(app.state.liveScores[putsKey]) : 2,
                maxscore: !!app.state.liveScores[maxScoreKey]
            };
        });

        if (Object.keys(queueMap).length > 0)
        {
            localStorage.setItem(storageKey, JSON.stringify(queueMap));
        }
        return Object.values(queueMap);
    }
    catch (err)
    {
        console.error('[OfflineQueue] Fehler beim lokalen Speichern:', err);
        return [];
    }
};

app.logic.flushOfflineQueueToServer = async function(spieltagId)
{
    const storageKey = `lie_offline_scores_${spieltagId}`;
    const queueMap = app.logic.getOfflineQueueMap(spieltagId);

    const payloadItems = Object.values(queueMap);
    if (payloadItems.length === 0)
    {
        return true;
    }

    const statusBadge = document.getElementById('score-sync-status');
    const connectionDot = document.getElementById('connection-status');

    if (statusBadge)
    {
        statusBadge.className = "text-[10px] font-bold px-2 py-1 rounded-lg bg-amber-100 text-amber-800 transition-colors whitespace-nowrap";
        statusBadge.innerHTML = `<i class="fas fa-sync fa-spin mr-1"></i>Sync...`;
    }
    if (connectionDot)
    {
        connectionDot.className = "w-3 h-3 rounded-full bg-amber-400";
    }

    try
    {
        const response = await app.logic.apiRequest('saveLiveScores', { payload: payloadItems });
        if (response && response.success)
        {
            localStorage.removeItem(storageKey);

            payloadItems.forEach(function(item)
            {
                const idx = (app.state.scoreCards || []).findIndex(sc => String(sc.id).trim() === String(item.id).trim());
                if (idx !== -1)
                {
                    app.state.scoreCards[idx] = item;
                }
                else
                {
                    app.state.scoreCards.push(item);
                }
            });

            if (statusBadge)
            {
                statusBadge.className = "text-[10px] font-bold px-2 py-1 rounded-lg bg-emerald-100 text-emerald-800 transition-colors whitespace-nowrap";
                statusBadge.innerHTML = `<i class="fas fa-check-circle mr-1"></i>Gespeichert`;
            }
            if (connectionDot)
            {
                connectionDot.className = "w-3 h-3 rounded-full bg-emerald-400";
            }

            if (app.router && app.router.currentView === 'score_eingabe' && app.router.currentParams)
            {
                const curHole = app.router.currentParams.hole || 1;
                const curFSeq = app.router.currentParams.flightSeq || 1;
                app.logic.refreshHoleNavBandUI(spieltagId, curHole, curFSeq);
            }
            return true;
        }
        else
        {
            throw new Error(response ? response.error : 'Unbekannter Sync-Fehler');
        }
    }
    catch (err)
    {
        console.warn('[OfflineQueue] Kein Netz / Sync verschoben, lokal gesichert:', err);
        if (statusBadge)
        {
            statusBadge.className = "text-[10px] font-bold px-2 py-1 rounded-lg bg-blue-100 text-blue-800 transition-colors whitespace-nowrap";
            statusBadge.innerHTML = `<i class="fas fa-hdd mr-1"></i>Lokal gesichert`;
        }
        if (connectionDot)
        {
            connectionDot.className = "w-3 h-3 rounded-full bg-amber-400";
        }
        return false;
    }
};

app.logic.completeHoleAndNavigate = function(spieltagId, flightSeq, currentHoleNr, targetView, targetParams)
{
    app.logic.markHoleVisited(spieltagId, currentHoleNr);
    app.logic.saveOfflineQueue(spieltagId, flightSeq, currentHoleNr);

    if (app.router && typeof app.router.navigate === 'function')
    {
        app.router.navigate(targetView, targetParams);
    }

    app.logic.flushOfflineQueueToServer(spieltagId);
};
