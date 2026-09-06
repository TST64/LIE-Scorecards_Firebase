// =========================================================================
// BMAssistent / LIE Scorecard - Dashboard Ansicht (Kompakt)
// Views_Dashboard.js
// BSD (Allman) Style
// =========================================================================

app.views.dashboard = function()
{
    // Ermittle den Namen des aktuellen Users für das Minispiel
    const user = app.state.currentUser;
    const nickname = user ? (user.nickname || "Golfer") : "";
    const rolle = user ? user.role : "Spieler";
    const gameUrl = nickname ? `https://game.lochihnein.de/?player=${encodeURIComponent(nickname)}` : `https://game.lochihnein.de/`;
    
    // Aktive Runde ermitteln (sofern nicht gelöscht)
    const aktiveRunde = app.state.spieltage ? app.state.spieltage.find(function(st) 
    { 
        if (!st) return false;

        const isDel = st.istGeloescht === true || 
                      String(st.istGeloescht).toUpperCase() === "TRUE" || 
                      st.istGelöscht === true || 
                      String(st.istGelöscht).toUpperCase() === "TRUE";

        return st.status === 'Aktiv' && !isDel; 
    }) : null;
    
    let activeRoundCardHtml = "";
    if (aktiveRunde)
    {
        const kurs = app.state.kurse ? app.state.kurse.find(function(k) { return String(k.id) === String(aktiveRunde.kursId); }) : null;
        const platz = kurs ? app.state.golfplaetze.find(function(p) { return String(p.id) === String(kurs.platzId); }) : null;
        
        const meinFlight = app.state.flights ? app.state.flights.find(function(f) 
        {
            if (f.spieltagId !== aktiveRunde.id) return false;
            const ids = String(f.spielerIdsCsv || "").split(',').map(function(id) { return id.trim(); });
            return ids.includes(String(user ? user.id : '').trim());
        }) : null;

        let flightSeq = 1;
        if (meinFlight)
        {
            const parts = meinFlight.id.split('-');
            flightSeq = parseInt(parts[parts.length - 1]) || 1;
        }

        activeRoundCardHtml = `
            <div class="p-3 bg-emerald-50/80 border border-emerald-200/90 rounded-xl shadow-xs space-y-2">
                <div class="flex justify-between items-center">
                    <span class="text-[9px] font-extrabold uppercase bg-emerald-700 text-emerald-50 px-2 py-0.5 rounded-full tracking-wider animate-pulse shadow-xs">
                        <i class="fas fa-dot-circle mr-1"></i> Live-Turnier
                    </span>
                    <span class="text-xs font-semibold text-zinc-500">${aktiveRunde.date}</span>
                </div>
                <div>
                    <h3 class="font-black text-zinc-900 text-sm leading-tight">${platz ? platz.name : 'LIE Golfrunde'}</h3>
                    <p class="text-[11px] text-zinc-500 font-semibold">${kurs ? kurs.name : ''} &bull; Flight ${flightSeq}</p>
                </div>
                <div class="grid grid-cols-2 gap-2 pt-0.5">
                    <button onclick="app.router.navigate('score_eingabe', { id: '${aktiveRunde.id}', hole: 1, flightSeq: ${flightSeq} })" class="bg-emerald-700 hover:bg-emerald-800 text-white font-bold py-2 rounded-lg text-xs transition shadow-xs text-center">
                        <i class="fas fa-edit mr-1"></i> Scores tippen
                    </button>
                    <button onclick="app.router.navigate('leaderboard', { id: '${aktiveRunde.id}', mode: 'netto' })" class="bg-white hover:bg-zinc-50 border border-emerald-200 text-emerald-900 font-bold py-2 rounded-lg text-xs transition text-center shadow-xs">
                        <i class="fas fa-list-ol mr-1"></i> Leaderboard
                    </button>
                </div>
            </div>
        `;
    }
    else
    {
        // Schlanke "Kein aktives Match"-Zeile
        activeRoundCardHtml = `
            <div class="p-2.5 px-3 bg-zinc-50/80 border border-zinc-200 border-dashed rounded-xl flex items-center justify-center gap-2 text-center">
                <i class="fas fa-golf-ball text-zinc-400 text-xs"></i>
                <span class="text-zinc-600 text-xs font-bold">Zurzeit läuft kein aktives Match</span>
            </div>
        `;
    }

    // --- ANSTEHENDE KALENDER-TERMINE (KOMPAKT) ---
    const todayStr = new Date().toISOString().split('T')[0];
    const termine = app.state.kalenderTermine || [];
    const upcoming = termine
        .filter(function(t) { return t.datum >= todayStr; })
        .sort(function(a, b) { return new Date(a.datum) - new Date(b.datum); });

    let upcomingEventsHtml = "";
    if (upcoming.length === 0)
    {
        upcomingEventsHtml = `
            <div class="p-2.5 px-3 text-center bg-zinc-50/80 border border-zinc-200 border-dashed rounded-xl">
                <p class="text-zinc-400 text-xs font-semibold">Keine anstehenden Termine im Kalender</p>
            </div>
        `;
    }
    else
    {
        upcomingEventsHtml = upcoming.map(function(term)
        {
            const rsvps = term.rsvps || {};
            let yesCount = 0, noCount = 0;

            Object.values(rsvps).forEach(function(val)
            {
                if (val === 'yes') yesCount++;
                if (val === 'no') noCount++;
            });

            let dateStr = term.datum;
            try
            {
                const d = new Date(term.datum);
                if (!isNaN(d.getTime()))
                {
                    dateStr = d.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });
                }
            } catch (e) {}

            return `
                <div onclick="app.router.navigate('kalender')" 
                     class="p-2 px-3 bg-white border border-zinc-200 rounded-xl flex items-center justify-between hover:border-emerald-500/60 hover:shadow-xs transition cursor-pointer touch-target group">
                    <div class="flex items-center gap-2.5 min-w-0">
                        <span class="text-[9px] font-black uppercase text-emerald-800 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200/60 shrink-0">
                            ${dateStr}
                        </span>
                        <div class="truncate">
                            <h4 class="text-xs font-bold text-zinc-800 group-hover:text-emerald-700 transition truncate">${term.titel}</h4>
                            <p class="text-[10px] text-zinc-400 font-medium truncate flex items-center gap-1">
                                <i class="fas fa-map-marker-alt text-red-500 text-[9px]"></i> ${term.ort || 'Golfplatz'} • ${term.uhrzeit || '09:00'} Uhr
                            </p>
                        </div>
                    </div>

                    <div class="text-right flex items-center gap-2 shrink-0 ml-2">
                        <div class="text-[10px] font-bold flex items-center gap-1.5">
                            <span class="text-emerald-600"><i class="fas fa-check mr-0.5"></i>${yesCount}</span>
                            <span class="text-red-500"><i class="fas fa-times mr-0.5"></i>${noCount}</span>
                        </div>
                        <i class="fas fa-chevron-right text-zinc-300 group-hover:text-emerald-600 transition text-[10px]"></i>
                    </div>
                </div>
            `;
        }).join('');
    }

    // --- KARRIERE-STATISTIKEN BERECHNEN ---
    let gespielteRundenCount = 0;
    let besterNettoScore = 0;
    let besteBruttoRunde = "-";
    let letzterNettoScore = "-";

    if (user && app.state.spieltage && app.state.scoreCards)
    {
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

        beendeteTeilgenommen.sort(function(a, b) { return new Date(a.date) - new Date(b.date); });
        gespielteRundenCount = beendeteTeilgenommen.length;

        let bruttoRundenListe = [];

        beendeteTeilgenommen.forEach(function(st)
        {
            const rundenScores = app.state.scoreCards.filter(function(sc)
            {
                return String(sc.spieltagId).trim() === String(st.id).trim() && String(sc.spielerId).trim() === String(user.id).trim();
            });

            const kurs = app.state.kurse ? app.state.kurse.find(function(k) { return String(k.id).trim() === String(st.kursId).trim(); }) : null;
            const maxBahnen = (kurs && kurs.bahnAnzahl) ? parseInt(kurs.bahnAnzahl) : 18;
            const kursBahnen = app.state.bahnen ? app.state.bahnen.filter(function(b) { return String(b.kursId).trim() === String(st.kursId).trim(); }) : [];

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

    // Admin-Hinweis
    let adminHintHtml = "";
    if (rolle === "Admin" || rolle === "Spielleiter")
    {
        adminHintHtml = `
            <div class="p-2.5 bg-amber-50/90 border border-amber-200/90 rounded-xl flex items-start space-x-2 text-xs text-amber-900 shadow-xs">
                <i class="fas fa-info-circle text-amber-600 mt-0.5"></i>
                <div class="text-[11px] leading-relaxed">
                    <b>Hallo ${nickname}!</b> Du bist als <u>${rolle}</u> eingeloggt. Unter <b>Runden</b> kannst du neue Spieltage auslosen.
                </div>
            </div>
        `;
    }

    return `
        <div class="space-y-4">
            <!-- Header-Banner -->
            <div class="bg-gradient-to-br from-emerald-900 via-emerald-950 to-zinc-950 text-white p-4 rounded-2xl shadow-md relative overflow-hidden border border-emerald-800/50">
                <div class="absolute right-0 bottom-0 opacity-10 text-8xl translate-x-4 translate-y-4 pointer-events-none">
                    <i class="fas fa-flag"></i>
                </div>
                <p class="text-[10px] font-bold text-emerald-300 uppercase tracking-widest">Willkommen im Clubhaus</p>
                <h2 class="text-xl font-black tracking-wide -mt-0.5 text-emerald-50">${nickname}</h2>
                <div class="mt-1.5 text-[10px] bg-emerald-800/80 text-emerald-200 inline-block px-2.5 py-0.5 rounded-full font-extrabold uppercase tracking-wider border border-emerald-600/40 shadow-xs">
                    HCP ${user ? user.hcpLIE : '54'}
                </div>
            </div>

            ${adminHintHtml}

            <!-- Aktive Runde Sektion -->
            <div class="space-y-1.5">
                <h4 class="text-[10px] font-bold text-zinc-400 uppercase tracking-wider px-1">Aktueller Spieltag</h4>
                ${activeRoundCardHtml}
            </div>

            <!-- Anstehende Termine Sektion -->
            <div class="space-y-1.5">
                <div class="flex justify-between items-center px-1">
                    <h4 class="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Anstehende Termine</h4>
                    <button onclick="app.router.navigate('kalender')" class="text-[10px] font-bold text-emerald-600 hover:text-emerald-700">
                        Alle anzeigen <i class="fas fa-arrow-right ml-0.5"></i>
                    </button>
                </div>
                <div class="space-y-1.5">
                    ${upcomingEventsHtml}
                </div>
            </div>

            <!-- KARRIERE-STATISTIKEN GRID -->
            <div class="space-y-1.5">
                <h4 class="text-[10px] font-bold text-zinc-400 uppercase tracking-wider px-1">Deine LIE-Karriere</h4>
                <div class="grid grid-cols-2 gap-2.5">
                    <div class="p-3 bg-white border border-zinc-200 rounded-xl flex items-center space-x-2.5 shadow-xs">
                        <div class="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center text-sm shrink-0"><i class="fas fa-trophy"></i></div>
                        <div>
                            <span class="block text-[8px] font-extrabold text-zinc-400 uppercase tracking-wider leading-none">Netto-Rekord</span>
                            <span class="text-xs font-black text-zinc-800 mt-0.5 block">${netRecDisplay}</span>
                        </div>
                    </div>
                    <div class="p-3 bg-white border border-zinc-200 rounded-xl flex items-center space-x-2.5 shadow-xs">
                        <div class="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center text-sm shrink-0"><i class="fas fa-medal"></i></div>
                        <div>
                            <span class="block text-[8px] font-extrabold text-zinc-400 uppercase tracking-wider leading-none">Bestes Brutto</span>
                            <span class="text-xs font-black text-zinc-800 mt-0.5 block">${besteBruttoRunde}</span>
                        </div>
                    </div>
                    <div class="p-3 bg-white border border-zinc-200 rounded-xl flex items-center space-x-2.5 shadow-xs">
                        <div class="w-8 h-8 rounded-lg bg-zinc-100 text-zinc-600 flex items-center justify-center text-sm shrink-0"><i class="fas fa-history"></i></div>
                        <div>
                            <span class="block text-[8px] font-extrabold text-zinc-400 uppercase tracking-wider leading-none">Letzte Runde</span>
                            <span class="text-xs font-black text-zinc-800 mt-0.5 block">${letzterNettoScore}</span>
                        </div>
                    </div>
                    <div onclick="app.router.navigate('spieltage', 'my')" class="p-3 bg-white border border-zinc-200 rounded-xl flex items-center space-x-2.5 shadow-xs cursor-pointer hover:border-emerald-500/60 transition group">
                        <div class="w-8 h-8 rounded-lg bg-zinc-100 group-hover:bg-emerald-50 text-zinc-600 group-hover:text-emerald-700 flex items-center justify-center text-sm shrink-0 transition"><i class="fas fa-calendar-check"></i></div>
                        <div>
                            <span class="block text-[8px] font-extrabold text-zinc-400 uppercase tracking-wider leading-none">Turniere</span>
                            <span class="text-xs font-black text-zinc-800 mt-0.5 block flex items-center gap-1">
                                ${gespielteRundenCount} Runden 
                                <i class="fas fa-chevron-right text-[9px] text-emerald-600 opacity-0 group-hover:opacity-100 transition-opacity"></i>
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            <!-- SCHNELLSTART-KACHELN (KOMPAKT) -->
            <div class="grid grid-cols-2 gap-2.5">
                <button onclick="app.router.navigate('spieltage')" class="p-2.5 bg-white border border-zinc-200 rounded-xl text-left hover:bg-zinc-50 transition shadow-xs group flex items-center gap-2.5 touch-target">
                    <div class="w-8 h-8 rounded-lg bg-zinc-100 group-hover:bg-emerald-50 text-zinc-500 group-hover:text-emerald-700 flex items-center justify-center text-sm shrink-0 transition">
                        <i class="fas fa-calendar-alt"></i>
                    </div>
                    <div class="truncate">
                        <span class="block font-bold text-zinc-800 text-xs truncate">Turniere</span>
                        <span class="block text-[9px] text-zinc-400 font-medium truncate">Alle Runden</span>
                    </div>
                </button>

                <button onclick="app.router.navigate('spieler')" class="p-2.5 bg-white border border-zinc-200 rounded-xl text-left hover:bg-zinc-50 transition shadow-xs group flex items-center gap-2.5 touch-target">
                    <div class="w-8 h-8 rounded-lg bg-zinc-100 group-hover:bg-emerald-50 text-zinc-500 group-hover:text-emerald-700 flex items-center justify-center text-sm shrink-0 transition">
                        <i class="fas fa-users"></i>
                    </div>
                    <div class="truncate">
                        <span class="block font-bold text-zinc-800 text-xs truncate">LIE-Gruppe</span>
                        <span class="block text-[9px] text-zinc-400 font-medium truncate">Handicaps</span>
                    </div>
                </button>

                <button onclick="app.router.navigate('kalender')" class="p-2.5 bg-white border border-zinc-200 rounded-xl text-left hover:bg-zinc-50 transition shadow-xs group flex items-center gap-2.5 touch-target">
                    <div class="w-8 h-8 rounded-lg bg-zinc-100 group-hover:bg-emerald-50 text-zinc-500 group-hover:text-emerald-700 flex items-center justify-center text-sm shrink-0 transition">
                        <i class="fas fa-calendar-days"></i>
                    </div>
                    <div class="truncate">
                        <span class="block font-bold text-zinc-800 text-xs truncate">Termine</span>
                        <span class="block text-[9px] text-zinc-400 font-medium truncate">Zu-/Absagen</span>
                    </div>
                </button>

                <button onclick="window.open('${gameUrl}', '_blank')" class="p-2.5 bg-gradient-to-br from-amber-50 to-orange-50/60 border border-amber-200 rounded-xl text-left hover:border-amber-300 transition shadow-xs group flex items-center gap-2.5 touch-target">
                    <div class="w-8 h-8 rounded-lg bg-amber-100/80 text-amber-700 flex items-center justify-center text-sm shrink-0 transition group-hover:scale-105">
                        <i class="fas fa-gamepad"></i>
                    </div>
                    <div class="truncate">
                        <span class="block font-bold text-amber-950 text-xs truncate">Pixel Golf</span>
                        <span class="block text-[9px] text-amber-700/90 font-semibold truncate">Mini-Game ⛳</span>
                    </div>
                </button>
            </div>
        </div>
    `;
};