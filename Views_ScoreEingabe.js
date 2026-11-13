// BMAssistent / LIE Scorecard - Score Eingabe (mit V2-Status-Logik & 9/18 Loch Filter)
// Views_ScoreEingabe.js
// BSD (Allman) Style
// =========================================================================

app.views = app.views || {};

app.views.scoreEingabe = app.views.score_eingabe = function(spieltagIdParam, holeNumberParam, targetFlightSeqParam)
{
    // Parameter entpacken (falls als Objekt vom Router oder als Einzelparameter übergeben)
    let spieltagId = spieltagIdParam;
    let holeNumber = holeNumberParam;
    let targetFlightSeq = targetFlightSeqParam;

    if (typeof spieltagIdParam === 'object' && spieltagIdParam !== null)
    {
        spieltagId = spieltagIdParam.id || spieltagIdParam.spieltagId;
        holeNumber = spieltagIdParam.hole || spieltagIdParam.holeNumber;
        targetFlightSeq = spieltagIdParam.flightSeq || spieltagIdParam.targetFlightSeq;
    }

    // LiveScores-State absichern
    app.state.liveScores = app.state.liveScores || {};

    const spieltage = app.state.spieltage || [];
    const spieltag = spieltage.find(function(st) { return String(st.id).trim() === String(spieltagId).trim(); });
    const kurs = (app.state.kurse || []).find(function(k) { return spieltag && String(k.id) === String(spieltag.kursId); });
    
    const is9Loch = (spieltag && (spieltag.bahnAnzahl === 9 || String(spieltag.rundenTyp || '').startsWith('9')));
    const kursBahnen = (app.state.bahnen || []).filter(function(b) { return spieltag && String(b.kursId).trim() === String(spieltag.kursId).trim(); });
    kursBahnen.sort(function(a, b) { return parseInt(a.nr) - parseInt(b.nr); });

    // Bahnbereich basierend auf Rundentyp festlegen (1-9, 10-18 oder 1-18)
    let startHole = 1;
    let endHole = (kurs && kurs.bahnAnzahl) ? parseInt(kurs.bahnAnzahl) : 18;

    if (spieltag && spieltag.rundenTyp === '9-Front')
    {
        startHole = 1;
        endHole = 9;
    }
    else if (spieltag && spieltag.rundenTyp === '9-Back')
    {
        startHole = 10;
        endHole = 18;
    }
    else if (is9Loch)
    {
        startHole = 1;
        endHole = 9;
    }

    const anzuzeigendeBahnen = [];
    for (let i = startHole; i <= endHole; i++)
    {
        const bMatch = kursBahnen.find(b => parseInt(b.nr) === i);
        if (bMatch) anzuzeigendeBahnen.push(bMatch);
        else anzuzeigendeBahnen.push({ nr: i, par: 4, si: i, kursId: spieltag ? spieltag.kursId : "" });
    }

    // Aktuelle Bahn im gewählten Bereich ermitteln
    let targetHole = parseInt(holeNumber) || startHole;
    if (targetHole < startHole) targetHole = startHole;
    if (targetHole > endHole) targetHole = endHole;

    const aktuelleBahnIndex = anzuzeigendeBahnen.findIndex(function(b) { return parseInt(b.nr) === targetHole; });
    const sichererIndex = aktuelleBahnIndex !== -1 ? aktuelleBahnIndex : 0;
    const bahnDaten = anzuzeigendeBahnen[sichererIndex];
    const currentHoleNr = parseInt(bahnDaten.nr);

    // Aktuelles Loch als besucht vermerken
    if (typeof app.logic.markHoleVisited === 'function')
    {
        app.logic.markHoleVisited(spieltagId, currentHoleNr);
    }

    // === FLIGHT-ERMITTLUNG UND RECHTE-WEICHE (vor Loch-Band, damit Flight-Spieler bekannt sind!) ===
    const meinIdString = app.state.currentUser ? String(app.state.currentUser.id).trim() : "";
    const isLeiter = app.state.currentUser && (app.state.currentUser.role === 'Admin' || app.state.currentUser.role === 'Spielleiter');
    
    const tagesFlights = app.state.flights ? app.state.flights.filter(function(f) { return String(f.spieltagId).trim() === String(spieltagId).trim(); }) : [];

    let gewaehlterFlight = null;
    let flightSeq = 1;

    if (isLeiter && targetFlightSeq)
    {
        gewaehlterFlight = tagesFlights.find(function(f) 
        {
            const parts = f.id.split('-');
            return parseInt(parts[parts.length - 1]) === parseInt(targetFlightSeq);
        });
        flightSeq = parseInt(targetFlightSeq);
    }
    
    if (!gewaehlterFlight)
    {
        gewaehlterFlight = tagesFlights.find(function(f)
        {
            const flightSpielerIds = String(f.spielerIdsCsv || "").split(',').map(function(id) { return String(id).trim(); });
            return flightSpielerIds.includes(meinIdString);
        });

        if (gewaehlterFlight)
        {
            const idParts = gewaehlterFlight.id.split('-');
            flightSeq = parseInt(idParts[idParts.length - 1]) || 1;
        }
    }

    if (!gewaehlterFlight && tagesFlights.length > 0)
    {
        gewaehlterFlight = tagesFlights[0];
        flightSeq = 1;
    }

    let teilnehmerIds = [];
    if (gewaehlterFlight)
    {
        teilnehmerIds = String(gewaehlterFlight.spielerIdsCsv || "").split(',').map(function(id) { return String(id).trim(); }).filter(Boolean);
    }
    else
    {
        const csvString = String(spieltag ? spieltag.teilnehmerCsv : "").trim();
        if (csvString !== "")
        {
            teilnehmerIds = csvString.split(',').map(function(id) { return String(id).trim(); }).filter(Boolean);
        }
    }

    // Hilfsfunktion zum Rendern des Loch-Navigationsbands mit den 4 V2-Zuständen + blauer Auswahl-Umrandung
    app.logic.renderHoleNavBandHtml = function(stId, bahnenListe, aktHoleNr, fSeq, spielerIds, tFlightSeq)
    {
        return bahnenListe.map(function(b)
        {
            const bNr = parseInt(b.nr);
            const isCurrent = bNr === aktHoleNr;
            const visited = typeof app.logic.isHoleVisited === 'function' ? app.logic.isHoleVisited(stId, bNr) : false;

            let openCount = 0;
            let localPendingCount = 0;
            let syncedCount = 0;
            const totalPlayers = spielerIds.length;

            spielerIds.forEach(function(spId)
            {
                const st = typeof app.logic.getHoleEntryStatus === 'function'
                    ? app.logic.getHoleEntryStatus(stId, spId, bNr)
                    : 'open';

                if (st === 'open') openCount++;
                else if (st === 'local_pending') localPendingCount++;
                else if (st === 'synced') syncedCount++;
            });

            // Zustand bestimmen:
            // 1. Alle Spieler vollständig serverbestätigt -> Grüner Marker
            // 2. Alle Spieler erfasst (keiner offen), Übertragung noch ausstehend -> Gelb/orange hervorgehoben
            // 3. Bereits besucht/teilweise erfasst, aber mindestens ein Spieler fehlt -> Orange/beiger Marker mit gestrichelter Umrandung
            // 4. Noch nicht bearbeitet -> Neutraler, offener Marker
            let stateClasses = 'bg-stone-100 text-stone-600 border border-stone-200';

            if (totalPlayers > 0 && syncedCount === totalPlayers)
            {
                stateClasses = 'bg-emerald-600 text-white font-bold border border-emerald-700';
            }
            else if (totalPlayers > 0 && openCount === 0 && localPendingCount > 0)
            {
                stateClasses = 'bg-amber-400 text-amber-950 font-bold border border-amber-500';
            }
            else if (openCount > 0 && (visited || localPendingCount > 0 || syncedCount > 0) && !isCurrent)
            {
                stateClasses = 'bg-orange-100 text-orange-900 font-bold border-2 border-dashed border-orange-400';
            }
            else if (openCount > 0 && (localPendingCount > 0 || syncedCount > 0) && isCurrent)
            {
                stateClasses = 'bg-orange-100 text-orange-900 font-bold border-2 border-dashed border-orange-400';
            }

            // Blaue Umrandung kennzeichnet zusätzlich das aktuell ausgewählte Loch (kein Vollständigkeitsnachweis!)
            const activeRing = isCurrent
                ? 'ring-2 ring-blue-600 ring-offset-1 scale-105 font-black'
                : '';

            const fSeqParam = tFlightSeq ? `, flightSeq: ${tFlightSeq}` : '';

            return `
                <button onclick="app.logic.completeHoleAndNavigate('${stId}', ${fSeq}, ${aktHoleNr}, 'score_eingabe', { id: '${stId}', hole: ${bNr}${fSeqParam} })" class="w-9 h-9 rounded-lg text-xs flex-shrink-0 transition-all flex items-center justify-center ${stateClasses} ${activeRing}">
                    ${bNr}
                </button>
            `;
        }).join('');
    };

    app.logic.refreshHoleNavBandUI = function(stId, aktHoleNr, fSeq)
    {
        const navContainer = document.getElementById('hole-nav-band');
        if (navContainer)
        {
            navContainer.innerHTML = app.logic.renderHoleNavBandHtml(stId, anzuzeigendeBahnen, aktHoleNr, fSeq, teilnehmerIds, targetFlightSeq);
        }
    };

    const holeNavHtml = app.logic.renderHoleNavBandHtml(spieltagId, anzuzeigendeBahnen, currentHoleNr, flightSeq, teilnehmerIds, targetFlightSeq);

    // Flight Switcher
    let flightSwitcherHtml = "";
    if (isLeiter && tagesFlights.length > 1)
    {
        let switcherButtons = tagesFlights.map(function(f)
        {
            const idParts = f.id.split('-');
            const fNr = parseInt(idParts[idParts.length - 1]) || 1;
            const isCurrentFlight = fNr === flightSeq;
            
            return `
                <button onclick="app.router.navigate('score_eingabe', { id: '${spieltagId}', hole: ${currentHoleNr}, flightSeq: ${fNr} })" class="px-3 py-1 text-xs font-bold rounded-lg transition-all whitespace-nowrap ${isCurrentFlight ? 'bg-emerald-700 text-white shadow-3xs' : 'bg-stone-200 text-stone-600 hover:bg-stone-300'}">
                    Flight ${fNr}
                </button>
            `;
        }).join('');

        flightSwitcherHtml = `
            <div class="flex items-center flex-wrap gap-1.5 bg-stone-100 p-1.5 rounded-xl border border-stone-200">
                <span class="text-[10px] uppercase font-bold text-stone-500 pl-1 shrink-0"><i class="fas fa-exchange-alt"></i> Flight:</span>
                <div class="flex flex-wrap gap-1">${switcherButtons}</div>
            </div>
        `;
    }

    // Spieler-Karten generieren
    let spielerKartenHtml = teilnehmerIds.map(function(spielerId, index)
    {
        const isFirst = index === 0;
        const isLast = index === teilnehmerIds.length - 1;
        
        const spieler = (app.state.spieler || []).find(function(s) { return String(s.id).trim() === String(spielerId).trim(); });
        if (!spieler) 
        {
            return "";
        }

        let spielvorgabe = app.logic.calculateHoleVorgabe(
            spieler,
            spieltag,
            currentHoleNr
        );
        const maxErlaubteSchlaege = parseInt(bahnDaten.par) + parseInt(spielvorgabe) + 2;
        
        const currentScoreKey = `${spieltagId}_${spielerId}_${currentHoleNr}`;
        const currentLadyKey = `${spieltagId}_${spielerId}_${currentHoleNr}_lady`;
        const currentPutsKey = `${spieltagId}_${spielerId}_${currentHoleNr}_puts`;
        const currentMaxScoreKey = `${spieltagId}_${spielerId}_${currentHoleNr}_maxscore`;

        const dbScores = (app.state.scoreCards || []).filter(function(sc) { return String(sc.spieltagId) === String(spieltagId) && String(sc.spielerId) === String(spielerId); });
        const dbMatch = dbScores.find(function(sc) { return sc.hole !== undefined && parseInt(sc.hole) === currentHoleNr; });
        
        const hatDbScore = dbMatch ? parseInt(dbMatch.strokes) : undefined;
        const hatDbLady = dbMatch ? (dbMatch.lady === true || String(dbMatch.lady).toUpperCase() === "TRUE") : false;
        const hatDbPuts = dbMatch ? parseInt(dbMatch.puts) : undefined;
        const hatDbMaxScore = dbMatch ? (dbMatch.maxscore === true || String(dbMatch.maxscore).toUpperCase() === "TRUE") : false;
        
        let aktuelleLady = app.state.liveScores[currentLadyKey];
        if (aktuelleLady === undefined)
        {
            aktuelleLady = hatDbLady;
            app.state.liveScores[currentLadyKey] = aktuelleLady;
        }

        let aktuellePuts = app.state.liveScores[currentPutsKey];
        if (aktuellePuts === undefined)
        {
            aktuellePuts = hatDbPuts !== undefined ? hatDbPuts : 2;
            app.state.liveScores[currentPutsKey] = aktuellePuts;
        }

        let aktuellerMaxScore = app.state.liveScores[currentMaxScoreKey];
        if (aktuellerMaxScore === undefined)
        {
            aktuellerMaxScore = hatDbMaxScore;
            app.state.liveScores[currentMaxScoreKey] = aktuellerMaxScore;
        }

        let aktuellerScore = app.state.liveScores[currentScoreKey];
        if (aktuellerScore === undefined)
        {
            if (aktuellerMaxScore)
            {
                aktuellerScore = maxErlaubteSchlaege;
            }
            else
            {
                aktuellerScore = hatDbScore !== undefined ? hatDbScore : parseInt(bahnDaten.par);
            }
            app.state.liveScores[currentScoreKey] = aktuellerScore;
        }

        // V2 Erfassungsstatus des Spielers für dieses Loch bestimmen
        const entryStatus = typeof app.logic.getHoleEntryStatus === 'function'
            ? app.logic.getHoleEntryStatus(spieltagId, spielerId, currentHoleNr)
            : 'open';

        const cardBgClass = entryStatus === 'open'
            ? 'bg-amber-50/90 border-amber-300'
            : 'bg-stone-50 border-stone-200';

        let statusBadgeHtml = '';
        if (entryStatus === 'open')
        {
            statusBadgeHtml = `<span id="entry-status-badge-${spielerId}" class="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 border border-amber-300"><i class="fas fa-clock text-[9px]"></i> Noch offen (Vorschlag übernehmen)</span>`;
        }
        else if (entryStatus === 'local_pending')
        {
            statusBadgeHtml = `<span id="entry-status-badge-${spielerId}" class="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200"><i class="fas fa-mobile-alt text-[9px]"></i> Lokal gespeichert · ausstehend</span>`;
        }
        else
        {
            statusBadgeHtml = `<span id="entry-status-badge-${spielerId}" class="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 border border-emerald-200"><i class="fas fa-check-circle text-[9px]"></i> Serverbestätigt</span>`;
        }

        const initials = String(spieler.nickname || spieler.name || '?').trim().substring(0, 2).toUpperCase();
        
        const nettoPunkte = app.logic.calculateNettoStableford(aktuellerScore, bahnDaten.par, spielvorgabe);

        const ladyBtnStyle = aktuelleLady 
            ? 'bg-red-500 border-red-600 text-white font-black shadow-xs' 
            : 'bg-white border-stone-300 text-stone-500 hover:bg-stone-50';

        const maxScoreBtnStyle = aktuellerMaxScore 
            ? 'bg-amber-500 border-amber-600 text-white font-black animate-pulse shadow-xs' 
            : 'bg-white border-stone-300 text-stone-600 hover:bg-stone-50';

        return `
            <div id="player-card-${spielerId}" class="p-3 ${cardBgClass} border rounded-2xl flex flex-col space-y-2 shadow-2xs transition-colors">
                <!-- Header: Spieler-Avatar (Tap = Vorschlag übernehmen) & Info -->
                <div class="flex justify-between items-center gap-2">
                    <div onclick="app.logic.confirmPlayerHole('${spieltagId}', '${spielerId}', ${currentHoleNr}, ${flightSeq})" class="flex items-center space-x-2.5 cursor-pointer select-none min-w-0" title="Tippen, um Vorgabewerte (Par / 2 Putts) als bestätigt zu übernehmen">
                        <div class="w-9 h-9 rounded-full bg-emerald-800 text-white font-black text-xs flex items-center justify-center shrink-0 shadow-2xs border border-emerald-900">
                            ${initials}
                        </div>
                        <div class="min-w-0">
                            <h4 class="font-bold text-stone-800 text-sm truncate">${spieler.nickname}</h4>
                            <p class="text-[10px] text-stone-500 uppercase tracking-wider">HCP: ${spieler.hcpLIE} | Vorgabe: +${spielvorgabe}</p>
                        </div>
                    </div>
                    <div class="flex items-center space-x-1.5 text-right shrink-0">
                        <div class="flex space-x-1">
                            <button onclick="app.logic.movePlayerInFlight('${spieltagId}', ${flightSeq}, '${spielerId}', -1, ${currentHoleNr})" class="w-7 h-7 bg-stone-100 hover:bg-stone-200 text-stone-500 hover:text-stone-700 rounded-lg flex items-center justify-center transition disabled:opacity-30 touch-target" ${isFirst ? 'disabled' : ''}><i class="fas fa-arrow-up text-[10px]"></i></button>
                            <button onclick="app.logic.movePlayerInFlight('${spieltagId}', ${flightSeq}, '${spielerId}', 1, ${currentHoleNr})" class="w-7 h-7 bg-stone-100 hover:bg-stone-200 text-stone-500 hover:text-stone-700 rounded-lg flex items-center justify-center transition disabled:opacity-30 touch-target" ${isLast ? 'disabled' : ''}><i class="fas fa-arrow-down text-[10px]"></i></button>
                        </div>
                        <span id="netto-badge-${spielerId}" class="text-[11px] font-bold px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-lg whitespace-nowrap">
                            ${nettoPunkte} Netto-Pkt
                        </span>
                    </div>
                </div>

                <!-- Statuszeile: Noch offen vs. Lokal gespeichert vs. Serverbestätigt -->
                <div class="flex items-center justify-between">
                    <div onclick="app.logic.confirmPlayerHole('${spieltagId}', '${spielerId}', ${currentHoleNr}, ${flightSeq})" class="cursor-pointer">
                        ${statusBadgeHtml}
                    </div>
                    <span class="text-[10px] text-stone-400 font-semibold">Par ${bahnDaten.par} · SI ${bahnDaten.si}</span>
                </div>

                <!-- BEREICH 1: Gesamtschläge -->
                <div class="flex items-center justify-between bg-white border border-stone-200 rounded-xl p-0.5">
                    <button onclick="app.logic.adjustScore('${spieltagId}', '${spielerId}', ${currentHoleNr}, -1, ${bahnDaten.par}, ${spielvorgabe})" class="w-10 h-10 bg-stone-100 active:bg-stone-200 text-stone-700 rounded-lg flex items-center justify-center text-lg font-bold touch-target select-none">
                        <i class="fas fa-minus"></i>
                    </button>
                    
                    <div class="text-center flex flex-col">
                        <span id="score-val-${spielerId}" class="text-xl font-black text-stone-900 leading-none">${aktuellerScore}</span>
                        <span class="text-[9px] text-stone-400 uppercase font-bold mt-0.5">Schläge</span>
                    </div>

                    <button onclick="app.logic.adjustScore('${spieltagId}', '${spielerId}', ${currentHoleNr}, 1, ${bahnDaten.par}, ${spielvorgabe})" class="w-10 h-10 bg-emerald-50 active:bg-emerald-100 text-emerald-700 rounded-lg flex items-center justify-center text-lg font-bold touch-target select-none">
                        <i class="fas fa-plus"></i>
                    </button>
                </div>

                <!-- BEREICH 2: Spezial-Eingaben -->
                <div style="display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; background-color: #e4e4e7; border: 1px solid #d4d4d8; padding: 4px; border-radius: 12px;">
                    
                    <!-- Lady -->
                    <button id="lady-btn-${spielerId}" onclick="app.logic.toggleLiveBoolean('${spieltagId}', '${spielerId}', ${currentHoleNr}, 'lady')" class="${ladyBtnStyle} select-none" style="grid-column: span 1 / span 1; display: flex; align-items: center; justify-content: center; height: 32px !important; min-height: 32px !important; border-radius: 8px; border: 1px solid #d4d4d8; padding: 0; margin: 0;">
                        <div style="display: flex; align-items: center; justify-content: center; gap: 4px;">
                            <i class="fas ${aktuelleLady ? 'fa-beer-mug-empty' : 'fa-wine-glass-empty'}" style="font-size: 11px;"></i>
                            <span style="font-size: 9px; text-transform: uppercase; font-weight: 900; letter-spacing: -0.05em;">${aktuelleLady ? '🍻' : 'Lady'}</span>
                        </div>
                    </button>

                    <!-- Putts -->
                    <div style="grid-column: span 2 / span 2; display: flex; align-items: center; background-color: #ffffff; border: 1px solid #d4d4d8; border-radius: 8px; padding: 2px; height: 32px !important; min-height: 32px !important;">
                        <button onclick="app.logic.adjustLiveValue('${spieltagId}', '${spielerId}', ${currentHoleNr}, 'puts', -1)" style="width: 28px !important; height: 26px !important; background-color: #f5f5f4; border: 1px solid #e7e5e4; border-radius: 6px; display: flex; align-items: center; justify-content: center;">
                            <i class="fas fa-minus" style="font-size: 8px; color: #57534e;"></i>
                        </button>
                        
                        <div style="flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;">
                            <span id="puts-val-${spielerId}" style="font-size: 13px; font-weight: 900; color: #1c1917; line-height: 1;">${aktuellePuts}</span>
                            <span style="font-size: 7px; color: #a8a29e; text-transform: uppercase; font-weight: 900; margin-top: 2px;">Putts</span>
                        </div>
                        
                        <button onclick="app.logic.adjustLiveValue('${spieltagId}', '${spielerId}', ${currentHoleNr}, 'puts', 1)" style="width: 28px !important; height: 26px !important; background-color: #f5f5f4; border: 1px solid #e7e5e4; border-radius: 6px; display: flex; align-items: center; justify-content: center;">
                            <i class="fas fa-plus" style="font-size: 8px; color: #57534e;"></i>
                        </button>
                    </div>

                    <!-- MaxScore -->
                    <button id="maxscore-btn-${spielerId}" onclick="app.logic.toggleMaxScore('${spieltagId}', '${spielerId}', ${currentHoleNr}, ${maxErlaubteSchlaege}, ${bahnDaten.par}, ${spielvorgabe})" class="${maxScoreBtnStyle} select-none" style="grid-column: span 1 / span 1; display: flex; align-items: center; justify-content: center; height: 32px !important; min-height: 32px !important; border-radius: 8px; border: 1px solid #d4d4d8; padding: 0; margin: 0;">
                        <div style="display: flex; align-items: center; justify-content: center; gap: 4px;">
                            <i class="fas ${aktuellerMaxScore ? 'fa-stroke' : 'fa-ban'}" style="font-size: 11px;"></i>
                            <span style="font-size: 9px; text-transform: uppercase; font-weight: 900; letter-spacing: -0.05em;">${aktuellerMaxScore ? 'Strich' : 'Max Ø'}</span>
                        </div>
                    </button>

                </div>
            </div>
        `;
    }).join('');

    const hatVorherigesLoch = sichererIndex > 0;
    const hatNaechstesLoch = sichererIndex < anzuzeigendeBahnen.length - 1;
    
    const vorherigeLochNr = hatVorherigesLoch ? anzuzeigendeBahnen[sichererIndex - 1].nr : null;
    const naechsteLochNr = hatNaechstesLoch ? anzuzeigendeBahnen[sichererIndex + 1].nr : null;

    const fSeqParamStr = targetFlightSeq ? `, flightSeq: ${targetFlightSeq}` : '';

    app.logic.openLeaderboardOverlay = function(stId) 
    {
        const mode = app.state.lastLeaderboardMode || 'netto';
        const html = app.views.leaderboard(stId, mode);
        
        const overlayContent = document.getElementById('overlay-leaderboard-content');
        if (overlayContent) 
        {
            overlayContent.innerHTML = html;
            const backBtn = overlayContent.querySelector('.fa-arrow-left')?.parentElement;
            if (backBtn) backBtn.style.display = 'none';
            const adminBox = overlayContent.querySelector('.fa-user-shield')?.parentElement;
            if (adminBox) adminBox.style.display = 'none';
        }
        
        document.getElementById('score-leaderboard-overlay').classList.remove('hidden');
    };

    return `
        <div class="space-y-4 pb-28">
            <div class="space-y-2">
                <div class="flex items-center justify-between gap-2">
                    <div class="flex items-center space-x-2 min-w-0">
                        <button onclick="app.router.navigate('dashboard')" class="text-stone-500 touch-target shrink-0"><i class="fas fa-arrow-left"></i></button>
                        <div class="min-w-0">
                            <h2 class="text-sm sm:text-base font-bold text-stone-800 flex items-center truncate">
                                <span class="truncate">${kurs ? kurs.name : 'Scorekarte'}</span>
                                ${isLeiter ? `
                                    <button onclick="app.router.navigate('score_schnellerfassung', { id: '${spieltagId}', flightSeq: ${flightSeq} })" class="ml-2 text-stone-400 hover:text-blue-600 transition touch-target flex items-center justify-center shrink-0" title="Tabellarische Schnelleingabe">
                                        <i class="fas fa-table text-sm"></i>
                                    </button>
                                    <button onclick="app.logic.openEditSpieltagModal('${spieltagId}', ${currentHoleNr}, ${flightSeq})" class="ml-1.5 text-stone-400 hover:text-emerald-600 transition touch-target flex items-center justify-center shrink-0" title="Spieltag bearbeiten">
                                        <i class="fas fa-cog text-sm"></i>
                                    </button>
                                ` : ''}
                            </h2>
                        </div>
                    </div>
                    <div class="flex items-center space-x-1.5 shrink-0">
                        <span id="score-sync-status" class="text-[10px] font-bold px-2 py-1 rounded-lg bg-emerald-100 text-emerald-800 transition-colors whitespace-nowrap">
                            <i class="fas fa-check-circle mr-1"></i>Gespeichert
                        </span>
                        <button onclick="app.logic.openLeaderboardOverlay('${spieltagId}')" class="text-xs bg-amber-500 hover:bg-amber-600 text-amber-950 font-bold px-2.5 py-2 rounded-xl transition shadow-3xs flex items-center whitespace-nowrap">
                            <i class="fas fa-trophy mr-1 text-amber-900"></i> Spicken
                        </button>
                    </div>
                </div>
                
                ${flightSwitcherHtml}
            </div>

            <div id="hole-nav-band" class="flex space-x-1.5 overflow-x-auto py-1 px-1 -mx-1 scrollbar-none">
                ${holeNavHtml}
            </div>

            <div class="space-y-3">
                ${spielerKartenHtml ? spielerKartenHtml : '<p class="text-stone-400 text-xs italic text-center py-4">Keine Spieler in diesem Flight.</p>'}
            </div>
            
            <div class="grid grid-cols-2 gap-3 pt-2">
                <button ${hatVorherigesLoch ? `onclick="app.logic.completeHoleAndNavigate('${spieltagId}', ${flightSeq}, ${currentHoleNr}, 'score_eingabe', { id: '${spieltagId}', hole: ${vorherigeLochNr}${fSeqParamStr} })"` : 'disabled'} class="bg-stone-100 text-stone-700 font-bold py-3 rounded-xl text-sm disabled:opacity-40">
                    <i class="fas fa-chevron-left mr-1"></i> Loch zurück
                </button>
                <button ${hatNaechstesLoch ? `onclick="app.logic.completeHoleAndNavigate('${spieltagId}', ${flightSeq}, ${currentHoleNr}, 'score_eingabe', { id: '${spieltagId}', hole: ${naechsteLochNr}${fSeqParamStr} })"` : `onclick="app.logic.completeHoleAndNavigate('${spieltagId}', ${flightSeq}, ${currentHoleNr}, 'dashboard')"`} class="bg-emerald-600 text-white font-bold py-3 rounded-xl text-sm">
                    ${hatNaechstesLoch ? 'Nächstes Loch <i class="fas fa-chevron-right ml-1"></i>' : 'Runde beenden <i class="fas fa-check ml-1"></i>'}
                </button>
            </div>
        </div>

        <!-- Leaderboard Overlay -->
        <div id="score-leaderboard-overlay" class="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-xs hidden flex flex-col p-4">
            <div class="bg-stone-100 rounded-2xl w-full max-w-md mx-auto my-auto flex flex-col max-h-[85vh] shadow-2xl border border-stone-200 overflow-hidden animate-fade-in">
                <div class="bg-emerald-700 text-white px-4 py-3 flex justify-between items-center shrink-0">
                    <h3 class="font-bold text-sm tracking-wide"><i class="fas fa-eye mr-1.5 text-amber-400"></i> Flight-Spion (Live-Stand)</h3>
                    <button onclick="document.getElementById('score-leaderboard-overlay').classList.add('hidden')" class="text-white opacity-80 hover:opacity-100 touch-target text-lg">
                        <i class="fas fa-times-circle"></i>
                    </button>
                </div>
                <div id="overlay-leaderboard-content" class="flex-1 overflow-y-auto p-3 space-y-3">
                </div>
            </div>
        </div>
    `;
};
