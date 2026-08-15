// =========================================================================
// BMAssistent / LIE Scorecard - Dashboard Ansicht
// Views_Dashboard.js
// BSD (Allman) Style
// =========================================================================

app.views.dashboard = function()
{
    const user = app.state.currentUser;
    const nickname = user ? user.nickname : "Golfer";
    const rolle = user ? user.role : "Spieler";
    
    // Find active match excluding soft-deleted rounds
    const aktiveRunde = app.state.spieltage ? app.state.spieltage.find(function(st) 
    { 
        if (!st) 
        {
            return false;
        }

        const isDel = st.istGeloescht === true || 
                      String(st.istGeloescht).toUpperCase() === "TRUE" || 
                      st.istGelöscht === true || 
                      String(st.istGelöscht).toUpperCase() === "TRUE";

        return st.status === 'Aktiv' && !isDel; 
    }) : null;
    
    let activeRoundCardHtml = "";
    if (aktiveRunde)
    {
        const kurs = app.state.kurse.find(function(k) { return String(k.id) === String(aktiveRunde.kursId); });
        const platz = kurs ? app.state.golfplaetze.find(function(p) { return String(p.id) === String(kurs.platzId); }) : null;
        
        // Check flight assignment for active user
        const meinFlight = app.state.flights ? app.state.flights.find(function(f) 
        {
            if (f.spieltagId !== aktiveRunde.id) return false;
            const ids = String(f.spielerIdsCsv || "").split(',').map(function(id) { return id.trim(); });
            return ids.includes(String(user.id).trim());
        }) : null;

        let flightSeq = 1;
        if (meinFlight)
        {
            const parts = meinFlight.id.split('-');
            flightSeq = parseInt(parts[parts.length - 1]) || 1;
        }

        activeRoundCardHtml = `
            <div class="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl shadow-2xs space-y-3">
                <div class="flex justify-between items-center">
                    <span class="text-[10px] font-bold uppercase bg-emerald-600 text-white px-2 py-0.5 rounded-full tracking-wider animate-pulse"><i class="fas fa-dot-circle"></i> Live-Turnier</span>
                    <span class="text-xs font-semibold text-stone-400">${aktiveRunde.date}</span>
                </div>
                <div>
                    <h3 class="font-black text-stone-800 text-base">${platz ? platz.name : 'LIE Golfrunde'}</h3>
                    <p class="text-xs text-stone-500 font-medium">${kurs ? kurs.name : ''} &bull; Flight ${flightSeq}</p>
                </div>
                <div class="grid grid-cols-2 gap-2 pt-1">
                    <button onclick="app.router.navigate('score_eingabe', { id: '${aktiveRunde.id}', hole: 1, flightSeq: ${flightSeq} })" class="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 rounded-xl text-xs transition shadow-3xs text-center">
                        <i class="fas fa-edit mr-1"></i> Scores tippen
                    </button>
                    <button onclick="app.router.navigate('leaderboard', { id: '${aktiveRunde.id}', mode: 'netto' })" class="bg-white hover:bg-stone-50 border border-emerald-200 text-emerald-800 font-bold py-2 rounded-xl text-xs transition text-center shadow-3xs">
                        <i class="fas fa-list-ol mr-1"></i> Leaderboard
                    </button>
                </div>
            </div>
        `;
    }
    else
    {
        activeRoundCardHtml = `
            <div class="p-5 text-center bg-stone-50 border border-stone-200 border-dashed rounded-2xl">
                <i class="fas fa-golf-ball text-stone-300 text-2xl mb-2"></i>
                <p class="text-stone-500 text-xs font-semibold">Zurzeit läuft kein aktives Match.</p>
                <p class="text-stone-400 text-[10px] mt-0.5">Sobald die Turnierleitung eine neue Runde auslost, erscheint hier deine Scorekarte!</p>
            </div>
        `;
    }

    // Calculate personal stats from application state
    let gespielteRundenCount = 0;
    let besterNettoScore = 0;
    let besteBruttoRunde = "-";
    let letzterNettoScore = "-";

    if (user && app.state.spieltage && app.state.scoreCards)
    {
        // Filter finished rounds where user participated
        const beendeteTeilgenommen = app.state.spieltage.filter(function(st)
        {
            if (st.status !== 'Beendet') return false;
            
            const isDel = st.istGeloescht === true || 
                          String(st.istGeloescht).toUpperCase() === "TRUE" || 
                          st.istGelöscht === true || 
                          String(st.istGelöscht).toUpperCase() === "TRUE";

            if (isDel) return false;

            const ids = String(st.teilnehmerCsv || "").split(',').map(function(id) { return id.trim(); });
            return ids.includes(String(user.id).trim());
        });

        // Sort chronologically
        beendeteTeilgenommen.sort(function(a, b) { return new Date(a.date) - new Date(b.date); });
        gespielteRundenCount = beendeteTeilgenommen.length;

        let bruttoRundenListe = [];

        beendeteTeilgenommen.forEach(function(st)
        {
            const rundenScores = app.state.scoreCards.filter(function(sc)
            {
                return String(sc.spieltagId).trim() === String(st.id).trim() && String(sc.spielerId).trim() === String(user.id).trim();
            });

            const kurs = app.state.kurse.find(function(k) { return String(k.id).trim() === String(st.kursId).trim(); });
            const maxBahnen = (kurs && kurs.bahnAnzahl) ? parseInt(kurs.bahnAnzahl) : 18;
            const kursBahnen = app.state.bahnen.filter(function(b) { return String(b.kursId).trim() === String(st.kursId).trim(); });

            let rundenNettoTotal = 0;
            let rundenSchlaegeTotal = 0;
            let gespielteBahnenInRunde = 0;

            kursBahnen.forEach(function(bahn)
            {
                const hNr = parseInt(bahn.nr);
                const scoreMatch = rundenScores.find(function(sc) { return sc.hole !== undefined && parseInt(sc.hole) === hNr; });

                if (scoreMatch && parseInt(scoreMatch.strokes) > 0)
                {
                    const strokes = parseInt(scoreMatch.strokes);
                    gespielteBahnenInRunde++;
                    rundenSchlaegeTotal += strokes;

                    let holeVorgabe = app.logic.calculateHoleVorgabe(user, st.kursId, bahn.si);
                    const nettoPkt = app.logic.calculateNettoStableford(strokes, bahn.par, holeVorgabe);
                    rundenNettoTotal += nettoPkt;
                }
            });

            // Evaluate complete rounds only
            if (gespielteBahnenInRunde >= maxBahnen && maxBahnen > 0)
            {
                if (rundenNettoTotal > besterNettoScore)
                {
                    besterNettoScore = rundenNettoTotal;
                }
                bruttoRundenListe.push(rundenSchlaegeTotal);
                letzterNettoScore = `${rundenNettoTotal} Pkt`;
            }
        });

        if (bruttoRundenListe.length > 0)
        {
            besteBruttoRunde = Math.min(...bruttoRundenListe) + " Schl.";
        }
    }

    const netRecDisplay = besterNettoScore > 0 ? `${besterNettoScore} Pkt` : "-";

    // Hint banner for Admin and Spielleiter
    let adminHintHtml = "";
    if (rolle === "Admin" || rolle === "Spielleiter")
    {
        adminHintHtml = `
            <div class="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start space-x-2 text-[11px] text-amber-800">
                <i class="fas fa-info-circle text-amber-500 mt-0.5"></i>
                <div>
                    <b>Hallo ${nickname}!</b> Du bist als <u>${rolle}</u> eingeloggt. Im Menüpunkt <b>Runden</b> kannst du über das Plus-Symbol oben rechts neue Spieltage starten oder Flights auslosen.
                </div>
            </div>
        `;
    }

    return `
        <div class="space-y-5">
            <!-- Begrüßung -->
            <div class="bg-gradient-to-br from-emerald-800 to-emerald-950 text-white p-5 rounded-2xl shadow-xs relative overflow-hidden">
                <div class="absolute right-0 bottom-0 opacity-10 text-7xl translate-x-4 translate-y-4">
                    <i class="fas fa-flag"></i>
                </div>
                <p class="text-xs font-medium text-emerald-300 uppercase tracking-wider">Willkommen im Clubhaus</p>
                <h2 class="text-xl font-black tracking-wide -mt-0.5">${nickname}</h2>
                <div class="mt-2 text-[10px] bg-emerald-700/50 inline-block px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider border border-emerald-600/30">
                    HCP ${user ? user.hcpLIE : '54'}
                </div>
            </div>

            ${adminHintHtml}

            <!-- Aktive Runde Sektion -->
            <div class="space-y-2">
                <h4 class="text-xs font-bold text-stone-400 uppercase tracking-wider px-1">Aktueller Spieltag</h4>
                ${activeRoundCardHtml}
            </div>

            <!-- Persönliche Statistiken Grid -->
            <div class="space-y-2">
                <h4 class="text-xs font-bold text-stone-400 uppercase tracking-wider px-1">Deine LIE-Karriere</h4>
                <div class="grid grid-cols-2 gap-3">
                    <div class="p-3 bg-stone-50 border border-stone-200 rounded-xl flex items-center space-x-3 shadow-3xs">
                        <div class="w-8 h-8 rounded-lg bg-stone-200/60 text-stone-600 flex items-center justify-center text-sm"><i class="fas fa-trophy"></i></div>
                        <div>
                            <span class="block text-[10px] font-bold text-stone-400 uppercase tracking-wide leading-none">Netto-Rekord</span>
                            <span class="text-sm font-black text-stone-800">${netRecDisplay}</span>
                        </div>
                    </div>
                    <div class="p-3 bg-stone-50 border border-stone-200 rounded-xl flex items-center space-x-3 shadow-3xs">
                        <div class="w-8 h-8 rounded-lg bg-stone-200/60 text-stone-600 flex items-center justify-center text-sm"><i class="fas fa-medal"></i></div>
                        <div>
                            <span class="block text-[10px] font-bold text-stone-400 uppercase tracking-wide leading-none">Bestes Brutto</span>
                            <span class="text-sm font-black text-stone-800">${besteBruttoRunde}</span>
                        </div>
                    </div>
                    <div class="p-3 bg-stone-50 border border-stone-200 rounded-xl flex items-center space-x-3 shadow-3xs">
                        <div class="w-8 h-8 rounded-lg bg-stone-200/60 text-stone-600 flex items-center justify-center text-sm"><i class="fas fa-history"></i></div>
                        <div>
                            <span class="block text-[10px] font-bold text-stone-400 uppercase tracking-wide leading-none">Letzte Runde</span>
                            <span class="text-sm font-black text-stone-800">${letzterNettoScore}</span>
                        </div>
                    </div>
                    <div class="p-3 bg-stone-50 border border-stone-200 rounded-xl flex items-center space-x-3 shadow-3xs">
                        <div class="w-8 h-8 rounded-lg bg-stone-200/60 text-stone-600 flex items-center justify-center text-sm"><i class="fas fa-calendar-check"></i></div>
                        <div>
                            <span class="block text-[10px] font-bold text-stone-400 uppercase tracking-wide leading-none">Turniere</span>
                            <span class="text-sm font-black text-stone-800">${gespielteRundenCount} Runden</span>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Schnellstart-Kacheln -->
            <div class="grid grid-cols-2 gap-3">
                <button onclick="app.router.navigate('spieltage')" class="p-4 bg-white border border-stone-200 rounded-2xl text-left hover:bg-stone-50 transition shadow-2xs group flex flex-col justify-between min-h-[95px] touch-target">
                    <i class="fas fa-calendar-alt text-xl text-stone-400 group-hover:text-emerald-700 transition"></i>
                    <div>
                        <span class="block font-bold text-stone-800 text-sm">Turniere</span>
                        <span class="block text-[10px] text-stone-400 -mt-0.5 font-medium">Alle Runden & Ergebnisse</span>
                    </div>
                </button>

                <button onclick="app.router.navigate('spieler')" class="p-4 bg-white border border-stone-200 rounded-2xl text-left hover:bg-stone-50 transition shadow-2xs group flex flex-col justify-between min-h-[95px] touch-target">
                    <i class="fas fa-users text-xl text-stone-400 group-hover:text-emerald-700 transition"></i>
                    <div>
                        <span class="block font-bold text-stone-800 text-sm">LIE-Gruppe</span>
                        <span class="block text-[10px] text-stone-400 -mt-0.5 font-medium">Handicaps & Ranglisten</span>
                    </div>
                </button>

                <button onclick="app.logic.openPixelGolfGame()" class="p-4 bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 rounded-2xl text-left hover:border-amber-300 transition shadow-2xs group flex flex-col justify-between min-h-[95px] touch-target">
                    <i class="fas fa-gamepad text-xl text-amber-600 group-hover:scale-110 transition-transform"></i>
                    <div>
                        <span class="block font-bold text-amber-950 text-sm">Pixel Golf Run</span>
                        <span class="block text-[10px] text-amber-700/80 -mt-0.5 font-semibold">Mini-Game starten ⛳</span>
                    </div>
                </button>
                
            </div>
        </div>
    `;
};