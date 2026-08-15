// Erweiterung des globalen app.views Namespaces für Flight-übergreifende Eingaben
app.views.score_eingabe = function(spieltagId, holeNumber, targetFlightSeq)
{
    const spieltag = app.state.spieltage.find(function(st) { return String(st.id).trim() === String(spieltagId).trim(); });
    const kurs = app.state.kurse.find(function(k) { return String(k.id) === String(spieltag.kursId); });
    
    const maxBahnenFuerDiesenKurs = (kurs && kurs.bahnAnzahl) ? parseInt(kurs.bahnAnzahl) : 18;
    const kursBahnen = app.state.bahnen.filter(function(b) { return String(b.kursId).trim() === String(spieltag.kursId).trim(); });
    kursBahnen.sort(function(a, b) { return parseInt(a.nr) - parseInt(b.nr); });
    
    const anzuzeigendeBahnen = [];
    for (let i = 0; i < maxBahnenFuerDiesenKurs; i++)
    {
        if (kursBahnen[i]) anzuzeigendeBahnen.push(kursBahnen[i]);
        else anzuzeigendeBahnen.push({ nr: i + 1, par: 4, si: 10, kursId: spieltag.kursId });
    }

    const aktuelleBahnIndex = anzuzeigendeBahnen.findIndex(function(b) { return parseInt(b.nr) === parseInt(holeNumber); });
    const sichererIndex = aktuelleBahnIndex !== -1 ? aktuelleBahnIndex : 0;
    const bahnDaten = anzuzeigendeBahnen[sichererIndex];
    const currentHoleNr = parseInt(bahnDaten.nr);

    // 1. Loch-Navigationsband generieren
    let holeNavHtml = "";
    anzuzeigendeBahnen.forEach(function(b)
    {
        const bNr = parseInt(b.nr);
        const isCurrent = bNr === currentHoleNr;
        const activeClass = isCurrent ? 'bg-emerald-600 text-white font-bold scale-110' : 'bg-stone-100 text-stone-600';
        // WICHTIG: Wir müssen die aktuell gewählte Flight-Sequenz beim Blättern der Löcher mitschicken!
        const fSeqParam = targetFlightSeq ? `, ${targetFlightSeq}` : '';
        holeNavHtml += `
            <button onclick="app.router.navigate('score_eingabe', { id: '${spieltagId}', hole: ${bNr}${fSeqParam ? ', flightSeq: ' + targetFlightSeq : ''} })" class="w-9 h-9 rounded-lg text-xs flex-shrink-0 transition-all ${activeClass}">
                ${bNr}
            </button>
        `;
    });

    // === FLIGHT-ERMITTLUNG UND RECHTE-WEICHE ===
    const meinIdString = app.state.currentUser ? String(app.state.currentUser.id).trim() : "";
    const isLeiter = app.state.currentUser && (app.state.currentUser.role === 'Admin' || app.state.currentUser.role === 'Spielleiter');
    
    // Alle Flights dieses Spieltags aus dem Speicher holen
    const tagesFlights = app.state.flights ? app.state.flights.filter(function(f) { return String(f.spieltagId).trim() === String(spieltagId).trim(); }) : [];

    let gewaehlterFlight = null;
    let flightSeq = 1;

    // A. Wenn ein expliziter Flight vom Admin angefordert wurde
    if (isLeiter && targetFlightSeq)
    {
        gewaehlterFlight = tagesFlights.find(function(f) 
        {
            const parts = f.id.split('-');
            return parseInt(parts[parts.length - 1]) === parseInt(targetFlightSeq);
        });
        flightSeq = parseInt(targetFlightSeq);
    }
    
    // B. Standard-Fallback: Suche den eigenen Flight des Users
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

    // C. Absoluter Not-Fallback (falls kein Flight Match existiert)
    if (!gewaehlterFlight && tagesFlights.length > 0)
    {
        gewaehlterFlight = tagesFlights[0];
        flightSeq = 1;
    }

    // Teilnehmer-IDs extrahieren
    let teilnehmerIds = [];
    if (gewaehlterFlight)
    {
        teilnehmerIds = String(gewaehlterFlight.spielerIdsCsv || "").split(',').map(function(id) { return String(id).trim(); }).filter(Boolean);
    }
    else
    {
        // Fallback falls gar keine Flights existieren (Tages-Gesamtliste)
        const csvString = String(spieltag.teilnehmerCsv || "").trim();
        if (csvString !== "")
        {
            teilnehmerIds = csvString.split(',').map(function(id) { return String(id).trim(); }).filter(Boolean);
        }
    }

    // INTERAKTIVES FLIGHT-SWITCHER BAND FÜR LEITER RENDERN
    let flightSwitcherHtml = "";
    if (isLeiter && tagesFlights.length > 1)
    {
        let switcherButtons = tagesFlights.map(function(f)
        {
            const idParts = f.id.split('-');
            const fNr = parseInt(idParts[idParts.length - 1]) || 1;
            const isCurrentFlight = fNr === flightSeq;
            
            return `
                <button onclick="app.router.navigate('score_eingabe', { id: '${spieltagId}', hole: ${currentHoleNr}, flightSeq: ${fNr} })" class="px-3 py-1 text-xs font-bold rounded-lg transition-all ${isCurrentFlight ? 'bg-emerald-700 text-white shadow-3xs' : 'bg-stone-200 text-stone-600 hover:bg-stone-300'}">
                    Flight ${fNr}
                </button>
            `;
        }).join('');

        flightSwitcherHtml = `
            <div class="flex items-center space-x-2 bg-stone-100 p-1.5 rounded-xl border border-stone-200 mt-1">
                <span class="text-[10px] uppercase font-bold text-stone-500 pl-1"><i class="fas fa-exchange-alt"></i> Flight:</span>
                <div class="flex space-x-1">${switcherButtons}</div>
            </div>
        `;
    }

    // Spieler-Karten generieren (Fehlersichere Zuweisung & Berechnungen)
    let spielerKartenHtml = teilnehmerIds.map(function(spielerId)
    {
        const spieler = app.state.spieler.find(function(s) { return String(s.id).trim() === String(spielerId).trim(); });
        if (!spieler) 
        {
            return "";
        }

        let spielvorgabe = app.logic.calculateHoleVorgabe(spieler, spieltag.kursId, bahnDaten.si);
        if (maxBahnenFuerDiesenKurs !== 18)
        {
            spielvorgabe = Math.round(spielvorgabe * (maxBahnenFuerDiesenKurs / 18));
        }
        
        const maxErlaubteSchlaege = parseInt(bahnDaten.par) + parseInt(spielvorgabe) + 2;
        
        const currentScoreKey = `${spieltagId}_${spielerId}_${currentHoleNr}`;
        const currentLadyKey = `${spieltagId}_${spielerId}_${currentHoleNr}_lady`;
        const currentPutsKey = `${spieltagId}_${spielerId}_${currentHoleNr}_puts`;
        const currentMaxScoreKey = `${spieltagId}_${spielerId}_${currentHoleNr}_maxscore`;

        const dbScores = app.state.scoreCards.filter(function(sc) { return String(sc.spieltagId) === String(spieltagId) && String(sc.spielerId) === String(spielerId); });
        const dbMatch = dbScores.find(function(sc) { return sc.hole !== undefined && parseInt(sc.hole) === currentHoleNr; });
        
        const hatDbScore = dbMatch ? parseInt(dbMatch.strokes) : undefined;
        const hatDbLady = dbMatch ? (dbMatch.lady === true || String(dbMatch.lady).toUpperCase() === "TRUE") : false;
        const hatDbPuts = dbMatch ? parseInt(dbMatch.puts) : undefined;
        const hatDbMaxScore = dbMatch ? (dbMatch.maxscore === true || String(dbMatch.maxscore).toUpperCase() === "TRUE") : false;
        
        // === Live-Scores laden & explizit im Funktions-Scope deklarieren ===
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
        
        const nettoPunkte = app.logic.calculateNettoStableford(aktuellerScore, bahnDaten.par, spielvorgabe);

        // Dynamische Button-Zustände (Jetzt garantiert nach der Variablen-Initialisierung)
        const ladyBtnStyle = aktuelleLady 
            ? 'bg-red-500 border-red-600 text-white font-black shadow-xs' 
            : 'bg-white border-stone-300 text-stone-500 hover:bg-stone-50';

        const maxScoreBtnStyle = aktuellerMaxScore 
            ? 'bg-amber-500 border-amber-600 text-white font-black animate-pulse shadow-xs' 
            : 'bg-white border-stone-300 text-stone-600 hover:bg-stone-50';

        return `
            <div class="p-3 bg-stone-50 border border-stone-200 rounded-2xl flex flex-col space-y-2 shadow-2xs">
                <!-- Header: Spieler-Info -->
                <div class="flex justify-between items-center">
                    <div>
                        <h4 class="font-bold text-stone-800 text-sm">${spieler.nickname}</h4>
                        <p class="text-[10px] text-stone-400 uppercase tracking-wider">HCP: ${spieler.hcpLIE} | Vorgabe: +${spielvorgabe}</p>
                    </div>
                    <div class="text-right">
                        <span id="netto-badge-${spielerId}" class="text-[11px] font-bold px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-lg">
                            ${nettoPunkte} Netto-Pkt
                        </span>
                    </div>
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

                <!-- BEREICH 2: Spezial-Eingaben (Mit Inline-Styles erzwungene Kantenbündigkeit) -->
                <div style="display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; background-color: #e4e4e7; border: 1px solid #d4d4d8; padding: 4px; border-radius: 12px; box-shadow: inset 0 2px 4px 0 rgba(0, 0, 0, 0.06);">
                    
                    <!-- Lady (Links) -->
                    <button id="lady-btn-${spielerId}" onclick="app.logic.toggleLiveBoolean('${spieltagId}', '${spielerId}', ${currentHoleNr}, 'lady')" class="${ladyBtnStyle} select-none" style="grid-column: span 1 / span 1; display: flex; align-items: center; justify-content: center; height: 32px !important; min-height: 32px !important; border-radius: 8px; border: 1px solid #d4d4d8; padding: 0; margin: 0;">
                        <div style="display: flex; align-items: center; justify-content: center; gap: 4px;">
                            <i class="fas ${aktuelleLady ? 'fa-beer-mug-empty' : 'fa-wine-glass-empty'}" style="font-size: 11px;"></i>
                            <span style="font-size: 9px; text-transform: uppercase; font-weight: 900; letter-spacing: -0.05em;">${aktuelleLady ? '🍻' : 'Lady'}</span>
                        </div>
                    </button>

                    <!-- Putts (Mitte - Flexbox mit erzwungener Höhe) -->
                    <div style="grid-column: span 2 / span 2; display: flex; align-items: center; background-color: #ffffff; border: 1px solid #d4d4d8; border-radius: 8px; padding: 2px; height: 32px !important; min-height: 32px !important; box-sizing: border-box;">
                        
                        <!-- Minus -->
                        <button onclick="app.logic.adjustLiveValue('${spieltagId}', '${spielerId}', ${currentHoleNr}, 'puts', -1)" style="width: 28px !important; height: 26px !important; min-height: 26px !important; background-color: #f5f5f4; border: 1px solid #e7e5e4; border-radius: 6px; display: flex; align-items: center; justify-content: center; padding: 0; margin: 0; cursor: pointer;">
                            <i class="fas fa-minus" style="font-size: 8px; color: #57534e;"></i>
                        </button>
                        
                        <!-- Zahl & Text -->
                        <div style="flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; min-width: 0; height: 100%;">
                            <span id="puts-val-${spielerId}" style="font-size: 13px; font-weight: 900; color: #1c1917; line-height: 1;">${aktuellePuts}</span>
                            <span style="font-size: 7px; color: #a8a29e; text-transform: uppercase; font-weight: 900; letter-spacing: -0.05em; margin-top: 2px;">Putts</span>
                        </div>
                        
                        <!-- Plus -->
                        <button onclick="app.logic.adjustLiveValue('${spieltagId}', '${spielerId}', ${currentHoleNr}, 'puts', 1)" style="width: 28px !important; height: 26px !important; min-height: 26px !important; background-color: #f5f5f4; border: 1px solid #e7e5e4; border-radius: 6px; display: flex; align-items: center; justify-content: center; padding: 0; margin: 0; cursor: pointer;">
                            <i class="fas fa-plus" style="font-size: 8px; color: #57534e;"></i>
                        </button>
                    </div>

                    <!-- MaxScore (Rechts) -->
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

    // === ZUSATZ-LOGIK: DYNAMISCHES OVERLAY FÜR LEADERBOARD OPENING ===
    app.logic.openLeaderboardOverlay = function(stId) 
    {
        // Rendert das originale Leaderboard mit dem aktuellen Zustand im globalen Speicher
        const mode = app.state.lastLeaderboardMode || 'netto';
        const html = app.views.leaderboard(stId, mode);
        
        const overlayContent = document.getElementById('overlay-leaderboard-content');
        if (overlayContent) 
        {
            overlayContent.innerHTML = html;
            
            // UI-Kosmetik im Overlay: Back-Button und Admin-Rundenabschluss ausblenden
            const backBtn = overlayContent.querySelector('.fa-arrow-left')?.parentElement;
            if (backBtn) backBtn.style.display = 'none';
            const adminBox = overlayContent.querySelector('.fa-user-shield')?.parentElement;
            if (adminBox) adminBox.style.display = 'none';
        }
        
        document.getElementById('score-leaderboard-overlay').classList.remove('hidden');
    };

    return `
        <div class="space-y-4 pb-28">
            <div class="space-y-1">
                <div class="flex items-center justify-between">
                    <div class="flex items-center space-x-2">
                        <button onclick="app.router.navigate('dashboard')" class="text-stone-500 touch-target"><i class="fas fa-arrow-left"></i></button>
                        <div>
                            <h2 class="text-base font-bold text-stone-800">${kurs ? kurs.name : 'Scorekarte'}</h2>
                            <p class="text-xs text-stone-400 -mt-1">Flight ${flightSeq} &bull; Bahn ${currentHoleNr} &bull; Par ${bahnDaten.par}</p>
                        </div>
                    </div>
                    
                    <!-- NEU: Flight-Spion Button im Header integriert -->
                    <div class="flex items-center space-x-1.5">
                        <button onclick="app.logic.openLeaderboardOverlay('${spieltagId}')" class="text-xs bg-amber-500 hover:bg-amber-600 text-amber-950 font-bold px-3 py-2 rounded-xl transition shadow-3xs flex items-center">
                            <i class="fas fa-trophy mr-1 text-amber-900"></i> Spicken
                        </button>
                        <button onclick="app.logic.syncScoresWithServer('${spieltagId}', ${flightSeq})" id="sync-btn" class="text-xs bg-stone-900 hover:bg-stone-800 text-white font-bold px-3 py-2 rounded-xl transition shadow-3xs">
                            <i class="fas fa-cloud-upload-alt mr-1"></i> Sichern
                        </button>
                    </div>
                </div>
                
                ${flightSwitcherHtml}
            </div>

            <div class="flex space-x-1.5 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-none">
                ${holeNavHtml}
            </div>

            <div class="space-y-3">
                ${spielerKartenHtml ? spielerKartenHtml : '<p class="text-stone-400 text-xs italic text-center py-4">Keine Spieler in diesem Flight.</p>'}
            </div>
            
            <div class="grid grid-cols-2 gap-3 pt-2">
                <button ${hatVorherigesLoch ? `onclick="app.router.navigate('score_eingabe', { id: '${spieltagId}', hole: ${vorherigeLochNr}${fSeqParamStr} })"` : 'disabled'} class="bg-stone-100 text-stone-700 font-bold py-3 rounded-xl text-sm disabled:opacity-40">
                    <i class="fas fa-chevron-left mr-1"></i> Loch zurück
                </button>
                <button ${hatNaechstesLoch ? `onclick="app.router.navigate('score_eingabe', { id: '${spieltagId}', hole: ${naechsteLochNr}${fSeqParamStr} })"` : `onclick="app.router.navigate('dashboard')"`} class="bg-emerald-600 text-white font-bold py-3 rounded-xl text-sm">
                    ${hatNaechstesLoch ? 'Nächstes Loch <i class="fas fa-chevron-right ml-1"></i>' : 'Runde beenden <i class="fas fa-check ml-1"></i>'}
                </button>
            </div>
        </div>

        <!-- NEU: Vollflächiges Leaderboard Overlay (Flight-Spion) -->
        <div id="score-leaderboard-overlay" class="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-xs hidden flex flex-col p-4">
            <div class="bg-stone-100 rounded-2xl w-full max-w-md mx-auto my-auto flex flex-col max-h-[85vh] shadow-2xl border border-stone-200 overflow-hidden animate-fade-in">
                <!-- Overlay Header -->
                <div class="bg-emerald-700 text-white px-4 py-3 flex justify-between items-center shrink-0">
                    <h3 class="font-bold text-sm tracking-wide"><i class="fas fa-eye mr-1.5 text-amber-400"></i> Flight-Spion (Live-Stand)</h3>
                    <button onclick="document.getElementById('score-leaderboard-overlay').classList.add('hidden')" class="text-white opacity-80 hover:opacity-100 touch-target text-lg">
                        <i class="fas fa-times-circle"></i>
                    </button>
                </div>
                <!-- Leaderboard Inhalt -->
                <div id="overlay-leaderboard-content" class="flex-1 overflow-y-auto p-3 space-y-3">
                    <!-- Wird dynamisch injiziert -->
                </div>
            </div>
        </div>
    `;
};
