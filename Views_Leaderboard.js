// =========================================================================
// BMAssistent / LIE Scorecard - Leaderboard Ansicht
// Views_Leaderboard.js
// BSD (Allman) Style
// =========================================================================

app.views.leaderboard = function(spieltagId, activeTab)
{
    if (!app.state.leaderboardViewMode) app.state.leaderboardViewMode = 'matrix';
    
    const mode = activeTab || 'netto';
    
    // 1. SPIELTAG RESOLVER (Falls keine ID übergeben wurde, wähle aktiven / neuesten Spieltag)
    let spieltag = null;
    if (spieltagId)
    {
        spieltag = (app.state.spieltage || []).find(function(st) 
        { 
            return String(st.id || "").trim() === String(spieltagId || "").trim(); 
        });
    }

    if (!spieltag && app.state.spieltage && app.state.spieltage.length > 0)
    {
        // Erstes Suchkriterium: Aktiver Spieltag
        spieltag = app.state.spieltage.find(function(st) { return st.status === 'Aktiv'; });
        // Zweites Suchkriterium: Neuester Spieltag
        if (!spieltag)
        {
            const sortedRounds = [...app.state.spieltage].sort(function(a, b) { return new Date(b.date) - new Date(a.date); });
            spieltag = sortedRounds[0];
        }
        if (spieltag)
        {
            spieltagId = spieltag.id;
        }
    }

    const kurs = (app.state.kurse || []).find(function(k) 
    { 
        return String(k.id || "").trim() === String(spieltag ? spieltag.kursId : "").trim(); 
    });
    
    const platz = kurs ? (app.state.golfplaetze || []).find(function(p) 
    { 
        return String(p.id || "").trim() === String(kurs.platzId ? kurs.platzId : "").trim(); 
    }) : null;

    // 2. TEILNEHMER ERMITTLUNG
    let teilnehmerIds = [];
    if (spieltag)
    {
        if (Array.isArray(spieltag.teilnehmerCsv))
        {
            teilnehmerIds = spieltag.teilnehmerCsv.map(function(id) { return String(id).trim(); });
        }
        else if (typeof spieltag.teilnehmerCsv === 'string' && spieltag.teilnehmerCsv.trim() !== "")
        {
            teilnehmerIds = spieltag.teilnehmerCsv.split(',').map(function(id) { return String(id).trim(); });
        }
        
        if (teilnehmerIds.length === 0 && app.state.flights)
        {
            const tagesFlights = app.state.flights.filter(function(f) { 
                return String(f.spieltagId || "").trim() === String(spieltag.id || "").trim(); 
            });
            tagesFlights.forEach(function(f)
            {
                const ids = String(f.spielerIdsCsv || "").split(',').map(function(id) { return String(id).trim(); });
                ids.forEach(function(id) { if (id && !teilnehmerIds.includes(id)) teilnehmerIds.push(id); });
            });
        }
    }

    // Fallback: Alle Spieler aus verknüpften Scorecards
    if (teilnehmerIds.length === 0 && app.state.scoreCards && spieltag)
    {
        app.state.scoreCards.forEach(function(sc)
        {
            if (String(sc.spieltagId || "").trim() === String(spieltag.id || "").trim())
            {
                const sId = String(sc.spielerId || "").trim();
                if (sId && !teilnehmerIds.includes(sId)) teilnehmerIds.push(sId);
            }
        });
    }

    // Bahnen festlegen (Standard 18 Loch)
    const maxBahnen = (kurs && kurs.bahnAnzahl) ? parseInt(kurs.bahnAnzahl) : 18;
    const kursBahnen = (app.state.bahnen || []).filter(function(b) 
    { 
        return String(b.kursId || "").trim() === String(spieltag ? spieltag.kursId : "").trim(); 
    });
    kursBahnen.sort(function(a, b) { return parseInt(a.nr) - parseInt(b.nr); });

    const anzuzeigendeBahnen = [];
    for (let i = 0; i < maxBahnen; i++)
    {
        if (kursBahnen[i]) 
        {
            anzuzeigendeBahnen.push(kursBahnen[i]);
        }
        else 
        {
            anzuzeigendeBahnen.push({ nr: i + 1, par: 4, si: i + 1 });
        }
    }

    // 3. DATEN-AGGREGATION
    const leaderboardData = teilnehmerIds.map(function(spielerId)
    {
        const spieler = (app.state.spieler || []).find(function(s) 
        { 
            return String(s.id || "").trim() === String(spielerId || "").trim(); 
        });

        if (!spieler) return null;

        const dbScores = (app.state.scoreCards || []).filter(function(sc) 
        {
            return String(sc.spieltagId || "").trim() === String(spieltag ? spieltag.id : "").trim() && String(sc.spielerId || "").trim() === String(spielerId || "").trim();
        });

        let totalStrokes = 0;
        let totalNettoStableford = 0;
        let holesPlayed = 0;
        const holeScoresMap = {};

        anzuzeigendeBahnen.forEach(function(bahn)
        {
            const hNr = parseInt(bahn.nr);
            const liveKey = `${spieltag ? spieltag.id : ''}_${spielerId}_${hNr}`;
            let strokes = (app.state.liveScores || {})[liveKey];

            if (strokes === undefined)
            {
                const dbMatch = dbScores.find(function(sc) { 
                    return sc.hole !== undefined && parseInt(sc.hole) === hNr; 
                });
                if (dbMatch) strokes = parseInt(dbMatch.strokes);
            }

            if (strokes !== undefined && !isNaN(strokes) && strokes > 0)
            {
                holesPlayed++;
                totalStrokes += strokes;

                let holeVorgabe = app.logic && typeof app.logic.calculateHoleVorgabe === 'function' 
                    ? app.logic.calculateHoleVorgabe(spieler, spieltag ? spieltag.kursId : "", bahn.si)
                    : 1;

                const nettoPkt = app.logic && typeof app.logic.calculateNettoStableford === 'function'
                    ? app.logic.calculateNettoStableford(strokes, bahn.par, holeVorgabe)
                    : 2;

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

    // RENDERING LISTE
    let rowsListHtml = leaderboardData.map(function(row, index)
    {
        const isBrutto = mode === 'brutto';
        const scoreDisplay = isBrutto ? `${row.strokes} <span class="text-[10px] text-zinc-400 font-normal">Schl.</span>` : `${row.netto} <span class="text-[10px] text-zinc-400 font-normal">Pkt.</span>`;
        const subDisplay = isBrutto ? `${row.netto} Netto-Pkt` : `${row.strokes} Schläge total`;
        
        let rankBadge = `bg-zinc-100 text-zinc-700`;
        if (index === 0) rankBadge = `bg-amber-400 text-amber-950 font-black`;
        if (index === 1) rankBadge = `bg-slate-300 text-slate-900 font-black`;
        if (index === 2) rankBadge = `bg-amber-600 text-amber-50 font-black`;

        return `
            <div class="flex items-center justify-between p-3 bg-white border border-zinc-200 rounded-xl shadow-xs">
                <div class="flex items-center space-x-3">
                    <div class="w-6 h-6 rounded-md ${rankBadge} text-xs flex items-center justify-center">${index + 1}</div>
                    <div onclick="app.logic.showPlayerDetailModal('${spieltag ? spieltag.id : ''}', '${row.spielerObj.id}')" class="cursor-pointer hover:opacity-80 transition">
                        <h4 class="font-bold text-zinc-800 text-sm underline decoration-emerald-500/40 underline-offset-2">${row.spielerObj.nickname || row.spielerObj.name} <i class="fas fa-chart-bar text-xs text-emerald-600 ml-1"></i></h4>
                        <p class="text-[10px] text-zinc-400 font-medium">Löcher: ${row.played}/${maxBahnen} &bull; ${subDisplay}</p>
                    </div>
                </div>
                <div class="text-right font-black text-emerald-700 text-base">
                    ${row.played > 0 ? scoreDisplay : '<span class="text-xs text-zinc-300 font-medium italic">No Score</span>'}
                </div>
            </div>
        `;
    }).join('');

    // RENDERING MATRIX TABELLE
    let tableHeaderHoles = anzuzeigendeBahnen.map(function(b) { return `<th class="p-1 text-center border-zinc-200 font-bold text-zinc-700 min-w-[32px] text-xs">${b.nr}</th>`; }).join('');
    let tableHeaderPars = anzuzeigendeBahnen.map(function(b) { return `<td class="p-1 text-center border-zinc-100 text-zinc-400 text-[10px] font-medium bg-zinc-50">${b.par}</td>`; }).join('');

    let tableRowsHtml = leaderboardData.map(function(row)
    {
        let scoreCells = anzuzeigendeBahnen.map(function(b)
        {
            const val = row.scoresMap[b.nr];
            let cellStyle = "text-zinc-800";
            
            if (val !== "-")
            {
                if (parseInt(val) < parseInt(b.par)) 
                {
                    cellStyle = "text-red-600 font-bold bg-red-50 rounded-xs";
                }
                else if (parseInt(val) === parseInt(b.par)) 
                {
                    cellStyle = "text-blue-600 font-bold bg-blue-50 rounded-xs";
                }
                else 
                {
                    cellStyle = "text-zinc-900 font-medium";
                }
            }
            return `<td class="p-1 text-center border-zinc-100 text-xs ${cellStyle}">${val}</td>`;
        }).join('');

        const totalResult = mode === 'brutto' ? row.strokes : row.netto;

        return `
            <tr class="border-b border-zinc-100 hover:bg-zinc-50/60">
                <td onclick="app.logic.showPlayerDetailModal('${spieltag ? spieltag.id : ''}', '${row.spielerObj.id}')" 
                    class="p-2 border-r border-zinc-200 sticky left-0 z-10 bg-white font-bold text-zinc-800 text-xs min-w-[95px] whitespace-nowrap cursor-pointer hover:bg-emerald-50 transition">
                    ${row.spielerObj.nickname || row.spielerObj.name} <i class="fas fa-chevron-right text-[9px] text-emerald-600 ml-0.5"></i>
                </td>
                ${scoreCells}
                <td class="p-2 bg-emerald-50 text-center font-black text-emerald-800 text-sm border-l border-zinc-200 min-w-[45px]">${row.played > 0 ? totalResult : '-'}</td>
            </tr>
        `;
    }).join('');

    let matrixHtml = `
        <div class="w-full overflow-x-auto border border-zinc-200 bg-white rounded-xl shadow-xs pb-1">
            <table class="w-full border-collapse text-left">
                <thead>
                    <tr class="bg-zinc-100/80 border-b border-zinc-200">
                        <th class="p-2 border-r border-zinc-200 sticky left-0 z-10 bg-zinc-100 font-bold text-zinc-500 text-[10px] uppercase tracking-wider min-w-[95px]">Spieler</th>
                        ${tableHeaderHoles}
                        <th class="p-2 text-center bg-emerald-100/70 font-bold text-emerald-900 text-[10px] uppercase tracking-wider min-w-[45px] border-l border-zinc-200">${mode === 'brutto' ? 'Schl' : 'Pkt'}</th>
                    </tr>
                    <tr class="border-b border-zinc-100">
                        <td class="p-2 border-r border-zinc-200 sticky left-0 z-10 bg-zinc-50 text-[10px] text-zinc-400 font-semibold italic min-w-[95px]">PAR</td>
                        ${tableHeaderPars}
                        <td class="bg-emerald-50/50 border-l border-zinc-200"></td>
                    </tr>
                </thead>
                <tbody>
                    ${tableRowsHtml || '<tr><td colspan="20" class="p-4 text-center text-xs text-zinc-400 italic">Keine zugewiesenen Spieler für diesen Spieltag gefunden.</td></tr>'}
                </tbody>
            </table>
        </div>
    `;

    // Admin/Spielleiter Banner für den Rundenabschluss
    const isLeiter = app.state.currentUser && (app.state.currentUser.role === 'Admin' || app.state.currentUser.role === 'Spielleiter');
    let closeRoundBannerHtml = "";

    if (spieltag && spieltag.status === 'Aktiv' && isLeiter)
    {
        closeRoundBannerHtml = `
            <div class="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between shadow-2xs">
                <div class="flex items-center space-x-2 text-amber-900 text-xs">
                    <i class="fas fa-flag-checkered text-amber-600"></i>
                    <span class="font-bold">Match noch aktiv</span>
                </div>
                <button onclick="app.logic.finishRoundWithWinners('${spieltag.id}')" class="bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition shadow-xs touch-target">
                    Runde offiziell beenden
                </button>
            </div>
        `;
    }

    return `
        <div class="space-y-4">
            <div class="flex items-center justify-between">
                <div class="flex items-center space-x-2">
                    <button onclick="app.router.navigate('dashboard')" class="text-zinc-500 touch-target"><i class="fas fa-arrow-left"></i></button>
                    <div>
                        <h2 class="text-base font-bold text-zinc-800">Live-Leaderboard</h2>
                        <p class="text-xs text-zinc-400 -mt-1">${platz ? platz.name : (spieltag ? spieltag.date : 'Turnier')}</p>
                    </div>
                </div>
                
                <div class="flex bg-zinc-100 border border-zinc-200 rounded-lg p-0.5">
                    <button onclick="app.state.leaderboardViewMode='matrix'; app.router.navigate('leaderboard', { id: '${spieltagId}', mode: '${mode}' })" class="px-2 py-1 text-xs rounded-md transition ${app.state.leaderboardViewMode === 'matrix' ? 'bg-white text-emerald-800 font-bold shadow-xs' : 'text-zinc-400'}">
                        <i class="fas fa-table"></i>
                    </button>
                    <button onclick="app.state.leaderboardViewMode='list'; app.router.navigate('leaderboard', { id: '${spieltagId}', mode: '${mode}' })" class="px-2 py-1 text-xs rounded-md transition ${app.state.leaderboardViewMode === 'list' ? 'bg-white text-emerald-800 font-bold shadow-xs' : 'text-zinc-400'}">
                        <i class="fas fa-list"></i>
                    </button>
                </div>
            </div>

            ${closeRoundBannerHtml}

            <div class="grid grid-cols-2 p-1 bg-zinc-100 rounded-xl border border-zinc-200">
                <button onclick="app.router.navigate('leaderboard', { id: '${spieltagId}', mode: 'netto' })" class="py-2 text-xs font-bold rounded-lg transition-all ${mode === 'netto' ? 'bg-white text-emerald-800 shadow-xs' : 'text-zinc-500'}">
                    <i class="fas fa-star mr-1"></i> Netto (Stableford)
                </button>
                <button onclick="app.router.navigate('leaderboard', { id: '${spieltagId}', mode: 'brutto' })" class="py-2 text-xs font-bold rounded-lg transition-all ${mode === 'brutto' ? 'bg-white text-emerald-800 shadow-xs' : 'text-zinc-500'}">
                    <i class="fas fa-trophy mr-1"></i> Brutto (Zählspiel)
                </button>
            </div>

            <div class="space-y-2">
                ${app.state.leaderboardViewMode === 'matrix' ? matrixHtml : rowsListHtml}
            </div>

            <button onclick="app.router.navigate('leaderboard', { id: '${spieltagId}', mode: '${mode}' })" class="w-full bg-zinc-100 border border-zinc-200 hover:bg-zinc-200 text-zinc-700 font-bold py-2.5 rounded-xl text-xs transition">
                <i class="fas fa-sync-alt mr-1"></i> Rangliste aktualisieren
            </button>
        </div>
    `;
};

// Modal für die detaillierten Runden-Statistiken eines Spielers
app.logic.showPlayerDetailModal = function(spieltagId, spielerId)
{
    const spieltag = (app.state.spieltage || []).find(s => String(s.id).trim() === String(spieltagId).trim());
    const spieler = (app.state.spieler || []).find(s => String(s.id).trim() === String(spielerId).trim());
    if (!spieltag || !spieler) return;

    const kursBahnen = (app.state.bahnen || [])
        .filter(b => String(b.kursId).trim() === String(spieltag.kursId).trim())
        .sort((a, b) => parseInt(a.nr) - parseInt(b.nr));

    const dbScores = (app.state.scoreCards || []).filter(sc => 
        String(sc.spieltagId).trim() === String(spieltagId).trim() && String(sc.spielerId).trim() === String(spielerId).trim()
    );

    let stats = { totalStrokes: 0, totalBrutto: 0, totalNetto: 0, birdies: 0, pars: 0, bogeys: 0, doublePlus: 0, ladies: 0, played: 0 };
    
    let rowsHtml = kursBahnen.map(bahn => {
        const hNr = parseInt(bahn.nr);
        const match = dbScores.find(sc => sc.hole !== undefined && parseInt(sc.hole) === hNr);
        const strokes = match ? parseInt(match.strokes) : 0;
        const isLady = match && (match.lady === true || match.lady === "true");

        if (isLady) stats.ladies++;

        if (strokes > 0) {
            stats.played++;
            stats.totalStrokes += strokes;

            const diff = strokes - parseInt(bahn.par);
            if (diff <= -1) stats.birdies++;
            else if (diff === 0) stats.pars++;
            else if (diff === 1) stats.bogeys++;
            else stats.doublePlus++;

            const vorgabe = app.logic.calculateHoleVorgabe ? app.logic.calculateHoleVorgabe(spieler, spieltag.kursId, bahn.si) : 0;
            const nettoPkt = app.logic.calculateNettoStableford ? app.logic.calculateNettoStableford(strokes, bahn.par, vorgabe) : 0;
            const bruttoPkt = Math.max(0, parseInt(bahn.par) - strokes + 2);

            stats.totalNetto += nettoPkt;
            stats.totalBrutto += bruttoPkt;

            return `
                <tr class="border-b border-zinc-100 text-xs">
                    <td class="py-2 px-2 font-bold text-zinc-700 text-center">#${bahn.nr}</td>
                    <td class="py-2 px-1 text-center text-zinc-400 font-medium">${bahn.par} <span class="text-[9px]">(${bahn.si})</span></td>
                    <td class="py-2 px-1 text-center text-amber-700 font-semibold">+${vorgabe}</td>
                    <td class="py-2 px-1 text-center font-bold text-zinc-900">${strokes} ${isLady ? '🍻' : ''}</td>
                    <td class="py-2 px-1 text-center text-zinc-600">${bruttoPkt}</td>
                    <td class="py-2 px-2 text-center font-bold text-emerald-700 bg-emerald-50/50">${nettoPkt}</td>
                </tr>
            `;
        }

        return `
            <tr class="border-b border-zinc-100 text-xs text-zinc-300">
                <td class="py-2 px-2 text-center">#${bahn.nr}</td>
                <td class="py-2 px-1 text-center">${bahn.par}</td>
                <td class="py-2 px-1 text-center">-</td>
                <td class="py-2 px-1 text-center">-</td>
                <td class="py-2 px-1 text-center">-</td>
                <td class="py-2 px-2 text-center">-</td>
            </tr>
        `;
    }).join('');

    const oldModal = document.getElementById('player-detail-modal');
    if (oldModal) oldModal.remove();

    const modalHtml = `
        <div id="player-detail-modal" class="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 animate-fade-in">
            <div class="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden">
                <!-- Modal Header -->
                <div class="p-4 bg-emerald-800 text-white flex items-center justify-between">
                    <div>
                        <h3 class="font-bold text-base">${spieler.nickname || spieler.name}</h3>
                        <p class="text-xs text-emerald-200">Stv: ${spieler.hcp || '36'} &bull; Löcher: ${stats.played}/${kursBahnen.length}</p>
                    </div>
                    <button onclick="document.getElementById('player-detail-modal').remove()" class="w-8 h-8 flex items-center justify-center rounded-full bg-emerald-700 text-white hover:bg-emerald-600 transition">
                        <i class="fas fa-times"></i>
                    </button>
                </div>

                <!-- Stats Grid -->
                <div class="p-3 bg-zinc-50 border-b border-zinc-200 grid grid-cols-4 gap-2 text-center">
                    <div class="bg-white p-2 rounded-xl border border-zinc-200 shadow-2xs">
                        <div class="text-[10px] text-zinc-400 uppercase font-semibold">Schläge</div>
                        <div class="text-sm font-black text-zinc-800">${stats.totalStrokes}</div>
                    </div>
                    <div class="bg-white p-2 rounded-xl border border-zinc-200 shadow-2xs">
                        <div class="text-[10px] text-zinc-400 uppercase font-semibold">Netto</div>
                        <div class="text-sm font-black text-emerald-700">${stats.totalNetto} Pkt</div>
                    </div>
                    <div class="bg-white p-2 rounded-xl border border-zinc-200 shadow-2xs">
                        <div class="text-[10px] text-zinc-400 uppercase font-semibold">Brutto</div>
                        <div class="text-sm font-black text-amber-700">${stats.totalBrutto} Pkt</div>
                    </div>
                    <div class="bg-white p-2 rounded-xl border border-zinc-200 shadow-2xs">
                        <div class="text-[10px] text-zinc-400 uppercase font-semibold">Ladies</div>
                        <div class="text-sm font-black text-pink-600">${stats.ladies} 🍻</div>
                    </div>
                </div>

                <!-- Score Highlights Pills -->
                <div class="px-4 py-2 bg-white flex items-center justify-around border-b border-zinc-100 text-[11px] font-bold">
                    <span class="text-emerald-600"><i class="fas fa-circle text-[8px] mr-1"></i>Birdies/-: ${stats.birdies}</span>
                    <span class="text-blue-600"><i class="fas fa-circle text-[8px] mr-1"></i>Pars: ${stats.pars}</span>
                    <span class="text-amber-600"><i class="fas fa-circle text-[8px] mr-1"></i>Bogeys: ${stats.bogeys}</span>
                    <span class="text-red-500"><i class="fas fa-circle text-[8px] mr-1"></i>Dbl+: ${stats.doublePlus}</span>
                </div>

                <!-- Table Content -->
                <div class="p-3 overflow-y-auto flex-1">
                    <table class="w-full border-collapse text-left">
                        <thead>
                            <tr class="border-b border-zinc-200 text-[10px] text-zinc-400 uppercase font-bold">
                                <th class="py-1 px-2 text-center">Bahn</th>
                                <th class="py-1 px-1 text-center">Par (SI)</th>
                                <th class="py-1 px-1 text-center">Vorg.</th>
                                <th class="py-1 px-1 text-center">Schläge</th>
                                <th class="py-1 px-1 text-center">Brutto</th>
                                <th class="py-1 px-2 text-center">Netto</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rowsHtml}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
};