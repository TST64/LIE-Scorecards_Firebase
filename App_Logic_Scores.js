// =========================================================================
// BMAssistent / LIE Scorecard - Live-Scoring & Calculations
// App_Logic_Scores.js
// BSD (Allman) Style
// =========================================================================

app.logic = app.logic || {};

app.logic.calculateHoleVorgabe = function(spieler, kursId, holeSi)
{
    const hcp = parseFloat(spieler ? spieler.hcpLIE : 54.0) || 54.0;
    const hcpsForKurs = app.state.handicaps.filter(function(h) { return String(h.kursId).trim() === String(kursId).trim(); });
    
    let vorgabeMatch = hcpsForKurs.find(function(h) { return parseFloat(h.vorgabe) === hcp; });
    let spielvorgabeTotal = vorgabeMatch ? parseInt(vorgabeMatch.spielvorgabe) : Math.round(hcp);

    let basisSchlaege = Math.floor(spielvorgabeTotal / 18);
    let restSchlaege = spielvorgabeTotal % 18;
    
    let holeVorgabe = basisSchlaege;
    if (parseInt(holeSi) <= restSchlaege)
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

app.logic.syncScoresWithServer = async function(spieltagId, flightSeq)
{
    const keysToSync = Object.keys(app.state.liveScores).filter(k => k.startsWith(spieltagId + "_"));
    if (keysToSync.length === 0)
    {
        app.logic.showToast("Keine ausstehenden Änderungen.", "info");
        return;
    }

    const syncBtn = document.getElementById('sync-btn');
    if (syncBtn)
    {
        syncBtn.disabled = true;
        syncBtn.innerHTML = `<i class="fas fa-circle-notch fa-spin"></i> Sende...`;
    }

    try
    {
        const batch = app.db.batch();
        const verarbeiteteKeys = {};

        keysToSync.forEach(key => {
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

            const docId = `SC-${spieltagId}-${spielerId}-${holeNr}`;
            const docRef = app.db.collection("scorecards").doc(docId);

            const payload = {
                id: docId,
                spieltagId: String(spieltagId),
                flightSeq: parseInt(flightSeq) || 1,
                spielerId: String(spielerId),
                hole: holeNr,
                strokes: parseInt(strokes),
                lady: !!app.state.liveScores[ladyKey],
                puts: app.state.liveScores[putsKey] !== undefined ? parseInt(app.state.liveScores[putsKey]) : 2,
                maxscore: !!app.state.liveScores[maxScoreKey]
            };

            batch.set(docRef, payload, { merge: true });
        });

        await batch.commit();

        keysToSync.forEach(k => delete app.state.liveScores[k]);
        app.logic.showToast("Scores erfolgreich in Firebase gesichert!", "success");
    }
    catch (err)
    {
        console.error("Firebase Sync-Fehler:", err);
        app.logic.showToast("Fehler beim Sichern der Daten", "error");
    }
    finally
    {
        if (syncBtn)
        {
            syncBtn.disabled = false;
            syncBtn.innerHTML = `<i class="fas fa-cloud-upload-alt mr-1"></i> Sichern`;
        }
    }
};

app.logic.startLivePolling = function(spieltagId, holeNr, flightSeq)
{
    app.logic.stopLivePolling();

    if (!app.db) app.initFirebase();

    // Echtes Push-Event von Firestore abonnierten
    app.state.unsubscribeLiveScores = app.db.collection("scorecards")
        .where("spieltagId", "==", String(spieltagId))
        .onSnapshot(function(snapshot)
        {
            const updatedScores = snapshot.docs.map(function(doc) { return doc.data(); });

            // Vorhandene Scores dieser Runde durch die frischen Firestore-Daten ersetzen
            const otherRoundScores = app.state.scoreCards.filter(function(sc)
            {
                return String(sc.spieltagId).trim() !== String(spieltagId).trim();
            });
            app.state.scoreCards = otherRoundScores.concat(updatedScores);

            const container = document.getElementById('app-container');
            if (container)
            {
                if (app.state.currentView === 'leaderboard')
                {
                    const activeTab = document.querySelector('[onclick*="brutto"]')?.classList.contains('bg-white') ? 'brutto' : 'netto';
                    container.innerHTML = app.views.leaderboard(spieltagId, activeTab);
                }
                else if (app.state.currentView === 'score_eingabe' && holeNr)
                {
                    const ungesicherteAenderungen = Object.keys(app.state.liveScores).filter(function(k)
                    {
                        return k.startsWith(spieltagId + "_");
                    }).length;

                    // Nur neu rendern, wenn der User gerade keine ungespeicherten Eingaben getippt hat
                    if (ungesicherteAenderungen === 0)
                    {
                        container.innerHTML = app.views.score_eingabe(spieltagId, holeNr, flightSeq);
                    }
                }
            }
        }, function(err)
        {
            console.warn("[Firestore Listener Error]", err);
        });
};

app.logic.stopLivePolling = function()
{
    if (typeof app.state.unsubscribeLiveScores === "function")
    {
        app.state.unsubscribeLiveScores();
        app.state.unsubscribeLiveScores = null;
    }
};
