// =========================================================================
// BMAssistent / LIE Scorecard - Leaderboard Ansicht
// Views_Leaderboard.js
// BSD (Allman) Style
// =========================================================================

app.views.leaderboard = function(spieltagId, activeTab)
{
    if (!app.state.leaderboardViewMode) app.state.leaderboardViewMode = 'matrix';
    
    const mode = activeTab || 'netto';
    const spieltag = app.state.spieltage.find(function(st) { return String(st.id).trim() === String(spieltagId).trim(); });
    const kurs = app.state.kurse.find(function(k) { return String(k.id).trim() === String(spieltag ? spieltag.kursId : "").trim(); });
    const platz = kurs ? app.state.golfplaetze.find(function(p) { return String(p.id).trim() === String(kurs.platzId).trim(); }) : null;

    const teilnehmerString = String(spieltag ? spieltag.teilnehmerCsv || "" : "");
    const teilnehmerIds = teilnehmerString ? teilnehmerString.split(',').map(function(id) { return String(id).trim(); }) : [];
    
    // Eindeutige Bahnenanzahl bestimmen
    const maxBahnen = (kurs && kurs.bahnAnzahl) ? parseInt(kurs.bahnAnzahl) : 18;
    const kursBahnen = app.state.bahnen.filter(function(b) { return String(b.kursId).trim() === String(spieltag ? spieltag.kursId : "").trim(); });
    kursBahnen.sort(function(a, b) { return parseInt(a.nr) - parseInt(b.nr); });

    const anzuzeigendeBahnen = [];
    for (let i = 0; i < maxBahnen; i++)
    {
        if (kursBahnen[i]) anzuzeigendeBahnen.push(kursBahnen[i]);
        else anzuzeigendeBahnen.push({ nr: i + 1, par: 4, si: 10 });
    }

    // 1. Daten-Aggregation für alle Teilnehmer
    const leaderboardData = teilnehmerIds.map(function(spielerId)
    {
        const spieler = app.state.spieler.find(function(s) { return String(s.id).trim() === spielerId; });
        if (!spieler) return null;

        const dbScores = app.state.scoreCards.filter(function(sc) 
        {
            return String(sc.spieltagId).trim() === String(spieltagId).trim() && String(sc.spielerId).trim() === spielerId;
        });

        let totalStrokes = 0;
        let totalNettoStableford = 0;
        let holesPlayed = 0;
        const holeScoresMap = {};

        anzuzeigendeBahnen.forEach(function(bahn)
        {
            const hNr = parseInt(bahn.nr);
            const liveKey = `${spieltagId}_${spielerId}_${hNr}`;
            let strokes = app.state.liveScores[liveKey];

            if (strokes === undefined)
            {
                const dbMatch = dbScores.find(function(sc) { return sc.hole !== undefined && parseInt(sc.hole) === hNr; });
                if (dbMatch) strokes = parseInt(dbMatch.strokes);
            }

            if (strokes !== undefined && strokes > 0)
            {
                holesPlayed++;
                totalStrokes += strokes;

                let holeVorgabe = app.logic.calculateHoleVorgabe(spieler, spieltag ? spieltag.kursId : "", bahn.si);
                if (maxBahnen !== 18) holeVorgabe = Math.round(holeVorgabe * (maxBahnen / 18));

                const nettoPkt = app.logic.calculateNettoStableford(strokes, bahn.par, holeVorgabe);
                totalNettoStableford += nettoPkt;
                
                holeScoresMap[hNr] = strokes;
            }
            else
            {
                holeScoresMap[hNr] = "-";
            }
        });

        return {
            spielerObj: spieler,
            strokes: totalStrokes,
            netto: totalNettoStableford,
            played: holesPlayed,
            scoresMap: holeScoresMap
        };
    }).filter(Boolean);

    // Sortierung ermitteln
    const nettoRanked = [...leaderboardData].sort(function(a, b) { return b.netto - a.netto; });
    const bruttoRanked = [...leaderboardData].filter(function(x) { return x.played > 0; }).sort(function(a, b) { return a.strokes - b.strokes; });

    const berechneterNettoSieger = nettoRanked.length > 0 ? nettoRanked[0].spielerObj.nickname : "Niemand";
    const berechneterBruttoSieger = bruttoRanked.length > 0 ? bruttoRanked[0].spielerObj.nickname : "Niemand";

    if (mode === 'brutto')
    {
        leaderboardData.sort(function(a, b) 
        {
            if (a.played === 0) return 1;
            if (b.played === 0) return -1;
            return a.strokes - b.strokes;
        });
    }
    else
    {
        leaderboardData.sort(function(a, b) { return b.netto - a.netto; });
    }

    // --- RENDERING VARIANTE A: KLASSISCHE LISTE ---
    let rowsListHtml = leaderboardData.map(function(row, index)
    {
        const isBrutto = mode === 'brutto';
        const scoreDisplay = isBrutto ? `${row.strokes} <span class="text-[10px] text-stone-400 font-normal">Schl.</span>` : `${row.netto} <span class="text-[10px] text-stone-400 font-normal">Pkt.</span>`;
        const subDisplay = isBrutto ? `${row.netto} Netto-Pkt` : `${row.strokes} Schläge total`;
        
        let rankBadge = `bg-stone-100 text-stone-700`;
        if (index === 0) rankBadge = `bg-amber-400 text-amber-950 font-black`;
        if (index === 1) rankBadge = `bg-slate-300 text-slate-900 font-black`;
        if (index === 2) rankBadge = `bg-amber-600 text-amber-50 font-black`;

        return `
            <div class="flex items-center justify-between p-3 bg-white border border-stone-200 rounded-xl shadow-2xs">
                <div class="flex items-center space-x-3">
                    <div class="w-6 h-6 rounded-md ${rankBadge} text-xs flex items-center justify-center">${index + 1}</div>
                    <div>
                        <h4 class="font-bold text-stone-800 text-sm">${row.spielerObj.nickname}</h4>
                        <p class="text-[10px] text-stone-400 font-medium">Löcher: ${row.played}/${maxBahnen} &bull; ${subDisplay}</p>
                    </div>
                </div>
                <div class="text-right font-black text-emerald-700 text-base">
                    ${row.played > 0 ? scoreDisplay : '<span class="text-xs text-stone-300 font-medium italic">No Score</span>'}
                </div>
            </div>
        `;
    }).join('');

    // --- RENDERING VARIANTE B: MATRIX TABELLE (MIT BREITEN-FIX) ---
    let tableHeaderHoles = anzuzeigendeBahnen.map(function(b) { return `<th class="p-1 text-center border-stone-200 font-bold text-stone-700 min-w-[32px] text-xs">${b.nr}</th>`; }).join('');
    let tableHeaderPars = anzuzeigendeBahnen.map(function(b) { return `<td class="p-1 text-center border-stone-100 text-stone-400 text-[10px] font-medium bg-stone-50">${b.par}</td>`; }).join('');

    let tableRowsHtml = leaderboardData.map(function(row)
    {
        let scoreCells = anzuzeigendeBahnen.map(function(b)
        {
            const val = row.scoresMap[b.nr];
            let cellStyle = "text-stone-800";
            
            if (val !== "-")
            {
                if (parseInt(val) < parseInt(b.par)) 
                {
                    cellStyle = "text-red-600 font-bold bg-red-50 rounded-sm";
                }
                else if (parseInt(val) === parseInt(b.par)) 
                {
                    cellStyle = "text-blue-600 font-bold bg-blue-50 rounded-sm";
                }
                else 
                {
                    cellStyle = "text-stone-900 font-medium";
                }
            }
            return `<td class="p-1 text-center border-stone-100 text-xs ${cellStyle}">${val}</td>`;
        }).join('');

        const totalResult = mode === 'brutto' ? row.strokes : row.netto;

        return `
            <tr class="border-b border-stone-100 hover:bg-stone-50/60">
                <td class="p-2 border-r border-stone-200 sticky left-0 z-10 bg-white font-bold text-stone-800 text-xs shadow-[2px_0_5px_-2px_rgba(0,0,0,0.08)] min-w-[95px] whitespace-nowrap" title="${row.spielerObj.nickname}">
                    ${row.spielerObj.nickname}
                </td>
                ${scoreCells}
                <td class="p-2 bg-emerald-50 text-center font-black text-emerald-800 text-sm border-l border-stone-200 min-w-[45px]">${row.played > 0 ? totalResult : '-'}</td>
            </tr>
        `;
    }).join('');

    let matrixHtml = `
        <div class="w-full overflow-x-auto border border-stone-200 bg-white rounded-xl shadow-2xs pb-1">
            <table class="w-full border-collapse text-left">
                <thead>
                    <tr class="bg-stone-100/80 border-b border-stone-200">
                        <th class="p-2 border-r border-stone-200 sticky left-0 z-10 bg-stone-100 font-bold text-stone-500 text-[10px] uppercase tracking-wider min-w-[95px]">Spieler</th>
                        ${tableHeaderHoles}
                        <th class="p-2 text-center bg-emerald-100/70 font-bold text-emerald-900 text-[10px] uppercase tracking-wider min-w-[45px] border-l border-stone-200">${mode === 'brutto' ? 'Schl' : 'Pkt'}</th>
                    </tr>
                    <tr class="border-b border-stone-100">
                        <td class="p-2 border-r border-stone-200 sticky left-0 z-10 bg-stone-50 text-[10px] text-stone-400 font-semibold italic min-w-[95px]">PAR</td>
                        ${tableHeaderPars}
                        <td class="bg-emerald-50/50 border-l border-stone-200"></td>
                    </tr>
                </thead>
                <tbody>
                    ${tableRowsHtml}
                </tbody>
            </table>
        </div>
    `;

    // --- SEKTIONS-SCHALTUNG ---
    let siegerHeaderHtml = "";
    if (spieltag && spieltag.status === 'Beendet')
    {
        siegerHeaderHtml = `
            <div class="p-3 bg-amber-50 border border-amber-200 rounded-xl grid grid-cols-2 gap-2 text-center text-xs font-bold text-amber-900">
                <div class="bg-white p-2 rounded-lg border border-amber-100"><i class="fas fa-trophy text-amber-500 mb-0.5"></i><br>Brutto: ${spieltag.bruttoSieger}</div>
                <div class="bg-white p-2 rounded-lg border border-amber-100"><i class="fas fa-star text-amber-500 mb-0.5"></i><br>Netto: ${spieltag.nettoSieger}</div>
            </div>
        `;
    }

    const isLeiter = app.state.currentUser && (app.state.currentUser.role === 'Admin' || app.state.currentUser.role === 'Spielleiter');
    let adminActionHtml = "";
    if (isLeiter && spieltag && spieltag.status === 'Aktiv')
    {
        adminActionHtml = `
            <div class="p-4 bg-amber-50 border border-amber-200 rounded-2xl space-y-3 mt-4 shadow-3xs">
                <h4 class="text-xs font-bold text-amber-800 uppercase tracking-wider"><i class="fas fa-user-shield"></i> Spielleitung: Runden-Abschluss</h4>
                <p class="text-[11px] text-amber-700">Das Beenden friert die Scores im Sheet ein. Errechnete Sieger: <b>${berechneterBruttoSieger}</b> (Brutto) & <b>${berechneterNettoSieger}</b> (Netto).</p>
                
                <div class="flex flex-col space-y-2">
                    <button onclick="app.logic.closeActiveSpieltag('${spieltagId}', '${berechneterBruttoSieger}', '${berechneterNettoSieger}')" id="close-round-btn" class="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 rounded-xl text-xs transition shadow-xs">
                        <i class="fas fa-flag-checkered mr-1"></i> Spieltag offiziell beenden
                    </button>
                    
                    <button onclick="app.logic.cancelActiveSpieltag('${spieltagId}')" id="cancel-round-btn" class="w-full bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 font-bold py-2 rounded-xl text-xs transition shadow-3xs">
                        <i class="fas fa-times-circle mr-1"></i> Spieltag abbrechen (ausblenden)
                    </button>
                </div>
            </div>
        `;
    }

    return `
        <div class="space-y-4">
            <div class="flex items-center justify-between">
                <div class="flex items-center space-x-2">
                    <button onclick="app.router.navigate('dashboard')" class="text-stone-500 touch-target"><i class="fas fa-arrow-left"></i></button>
                    <div>
                        <h2 class="text-base font-bold text-stone-800">Live-Leaderboard</h2>
                        <p class="text-xs text-stone-400 -mt-1">${platz ? platz.name : ''}</p>
                    </div>
                </div>
                
                <div class="flex bg-stone-100 border border-stone-200 rounded-lg p-0.5">
                    <button onclick="app.state.leaderboardViewMode='matrix'; app.router.navigate('leaderboard', { id: '${spieltagId}', mode: '${mode}' })" class="px-2 py-1 text-xs rounded-md transition ${app.state.leaderboardViewMode === 'matrix' ? 'bg-white text-emerald-800 font-bold shadow-3xs' : 'text-stone-400'}">
                        <i class="fas fa-table"></i>
                    </button>
                    <button onclick="app.state.leaderboardViewMode='list'; app.router.navigate('leaderboard', { id: '${spieltagId}', mode: '${mode}' })" class="px-2 py-1 text-xs rounded-md transition ${app.state.leaderboardViewMode === 'list' ? 'bg-white text-emerald-800 font-bold shadow-3xs' : 'text-stone-400'}">
                        <i class="fas fa-list"></i>
                    </button>
                </div>
            </div>

            ${siegerHeaderHtml}

            <div class="grid grid-cols-2 p-1 bg-stone-100 rounded-xl border border-stone-200">
                <button onclick="app.router.navigate('leaderboard', { id: '${spieltagId}', mode: 'netto' })" class="py-2 text-xs font-bold rounded-lg transition-all ${mode === 'netto' ? 'bg-white text-emerald-800 shadow-2xs' : 'text-stone-500'}">
                    <i class="fas fa-star mr-1"></i> Netto (Stableford)
                </button>
                <button onclick="app.router.navigate('leaderboard', { id: '${spieltagId}', mode: 'brutto' })" class="py-2 text-xs font-bold rounded-lg transition-all ${mode === 'brutto' ? 'bg-white text-emerald-800 shadow-2xs' : 'text-stone-500'}">
                    <i class="fas fa-trophy mr-1"></i> Brutto (Zählspiel)
                </button>
            </div>

            <div class="space-y-2">
                ${app.state.leaderboardViewMode === 'matrix' ? matrixHtml : rowsListHtml}
            </div>

            ${adminActionHtml}

            <button onclick="app.router.navigate('leaderboard', { id: '${spieltagId}', mode: '${mode}' })" class="w-full bg-stone-100 border border-stone-200 hover:bg-stone-200 text-stone-700 font-bold py-2.5 rounded-xl text-xs transition">
                <i class="fas fa-sync-alt mr-1"></i> Rangliste aktualisieren
            </button>
        </div>
    `;
};