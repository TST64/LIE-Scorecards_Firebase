// =========================================================================
// BMAssistent / LIE Scorecard - Live Dashboard (Swipe-Karussell)
// Views_LiveDashboard.js
// BSD (Allman) Style
// =========================================================================

app.views = app.views || {};

app.views.live_dashboard = function()
{
    const isAdmin = app.state.currentUser && app.state.currentUser.role === 'Admin';
    const saisonStart = app.state.saisonStartDatum || '2020-01-01';

    // Runden für die aktuelle Saison filtern
    const saisonRunden = (app.state.spieltage || []).filter(
        function(st)
        {
            if (!st) return false;
            
            const isDel = st.istGeloescht === true || 
                          String(st.istGeloescht).toUpperCase() === "TRUE" || 
                          st.istGelöscht === true || 
                          String(st.istGelöscht).toUpperCase() === "TRUE";
            if (isDel) return false;

            const statusNorm = String(st.status || '').toLowerCase().trim();
            const isDone = (statusNorm === 'beendet' || statusNorm === 'abgeschlossen');
            const dateOk = st.date ? (st.date >= saisonStart) : true;

            return isDone && dateOk;
        }
    );

    const activeSpieler = (app.state.spieler || []).filter(
        function(s)
        {
            return s && !s.istGeloescht;
        }
    );

    // =====================================================================
    // KPI BERECHNUNGEN
    // =====================================================================

    // 1. Handicap
    const kpiHandicap = [...activeSpieler].sort(
        function(a, b)
        {
            return (parseFloat(a.hcpLIE) || 26) - (parseFloat(b.hcpLIE) || 26);
        }
    );

    // 2. Putt-König
    const kpiPutts = activeSpieler.map(
        function(sp)
        {
            const rundenPutts = [];
            saisonRunden.forEach(
                function(st)
                {
                    const scs = (app.state.scoreCards || []).filter(
                        function(sc)
                        {
                            return String(sc.spieltagId).trim() === String(st.id).trim() && 
                                   String(sc.spielerId).trim() === String(sp.id).trim();
                        }
                    );

                    let roundPuttSum = 0;
                    let holesCount = 0;

                    scs.forEach(
                        function(sc)
                        {
                            const rawPutt = sc.putts !== undefined ? sc.putts : sc.putt;
                            if (rawPutt !== undefined && rawPutt !== null && String(rawPutt).trim() !== "")
                            {
                                const puttsVal = parseInt(rawPutt);
                                if (!isNaN(puttsVal) && puttsVal >= 0)
                                {
                                    roundPuttSum += puttsVal;
                                    holesCount++;
                                }
                            }
                        }
                    );

                    if (holesCount > 0)
                    {
                        const normPutts = (roundPuttSum / holesCount) * 18;
                        rundenPutts.push(normPutts);
                    }
                }
            );

            rundenPutts.sort((a, b) => a - b);
            const top10 = rundenPutts.slice(0, 10);
            const avg = top10.length > 0 ? (top10.reduce((a, b) => a + b, 0) / top10.length).toFixed(1) : null;

            return { spieler: sp, avgPutts: avg, count: rundenPutts.length };
        }
    ).filter(item => item.avgPutts !== null).sort((a, b) => parseFloat(a.avgPutts) - parseFloat(b.avgPutts));

    // 3 - 7 Weitere Stats
    const kpiStats = activeSpieler.map(
        function(sp)
        {
            let birdies = 0;
            let pars = 0;
            let ladies = 0;
            let strichCountLast10 = 0;
            let rundenGespielt = 0;

            const spRunden = saisonRunden.filter(
                function(st)
                {
                    const ids = String(st.teilnehmerCsv || "").split(',').map(i => i.trim());
                    return ids.includes(String(sp.id).trim());
                }
            ).sort((a, b) => new Date(b.date) - new Date(a.date));

            rundenGespielt = spRunden.length;

            spRunden.forEach(
                function(st)
                {
                    const scs = (app.state.scoreCards || []).filter(
                        function(sc)
                        {
                            return String(sc.spieltagId).trim() === String(st.id).trim() && 
                                   String(sc.spielerId).trim() === String(sp.id).trim();
                        }
                    );

                    scs.forEach(
                        function(sc)
                        {
                            const strokes = parseInt(sc.strokes) || 0;
                            const holeNr = parseInt(sc.hole);
                            const bahn = (app.state.bahnen || []).find(
                                b => String(b.kursId).trim() === String(st.kursId).trim() && parseInt(b.nr) === holeNr
                            );

                            const par = bahn ? parseInt(bahn.par) : 4;

                            if (strokes > 0 && bahn)
                            {
                                if (strokes <= par - 1) birdies++;
                                if (strokes === par) pars++;
                            }

                            const ladyVal = parseInt(sc.ladies) || parseInt(sc.lady) || 0;
                            if (ladyVal > 0) ladies += ladyVal;
                        }
                    );
                }
            );

            // Stricher (Letzte 10 Spiele)
            const last10Runden = spRunden.slice(0, 10);
            last10Runden.forEach(
                function(st)
                {
                    const scs = (app.state.scoreCards || []).filter(
                        function(sc)
                        {
                            return String(sc.spieltagId).trim() === String(st.id).trim() && 
                                   String(sc.spielerId).trim() === String(sp.id).trim();
                        }
                    );

                    scs.forEach(
                        function(sc)
                        {
                            const strokes = parseInt(sc.strokes) || 0;
                            const holeNr = parseInt(sc.hole);
                            const bahn = (app.state.bahnen || []).find(
                                b => String(b.kursId).trim() === String(st.kursId).trim() && parseInt(b.nr) === holeNr
                            );

                            if (bahn)
                            {
                                const holeVorgabe = (app.logic && typeof app.logic.calculateHoleVorgabe === 'function') 
                                    ? app.logic.calculateHoleVorgabe(sp, st.kursId, bahn.si) 
                                    : 1;

                                const netto = (app.logic && typeof app.logic.calculateNettoStableford === 'function') 
                                    ? app.logic.calculateNettoStableford(strokes, bahn.par, holeVorgabe) 
                                    : (strokes > 0 ? 1 : 0);

                                if (strokes === 0 || netto === 0)
                                {
                                    strichCountLast10++;
                                }
                            }
                        }
                    );
                }
            );

            return {
                spieler: sp,
                birdies: birdies,
                pars: pars,
                ladies: ladies,
                striche: strichCountLast10,
                runden: rundenGespielt
            };
        }
    );

    const kpiBirdies = [...kpiStats].sort((a, b) => b.birdies - a.birdies);
    const kpiPars = [...kpiStats].sort((a, b) => b.pars - a.pars);
    const kpiLadies = [...kpiStats].sort((a, b) => b.ladies - a.ladies);
    const kpiStricher = [...kpiStats].sort((a, b) => b.striche - a.striche);
    const kpiFleiss = [...kpiStats].sort((a, b) => b.runden - a.runden);

    // =====================================================================
    // UI HELPER
    // =====================================================================

    const renderChartRow = function(rank, name, valueStr, percent, colorClass = "bg-emerald-600")
    {
        let badge = `<span class="w-5 text-center font-bold text-xs text-zinc-400">${rank}</span>`;
        if (rank === 1) badge = `<span class="w-5 text-center text-xs">🥇</span>`;
        if (rank === 2) badge = `<span class="w-5 text-center text-xs">🥈</span>`;
        if (rank === 3) badge = `<span class="w-5 text-center text-xs">🥉</span>`;

        return `
            <div class="space-y-1">
                <div class="flex justify-between items-center text-xs font-bold">
                    <div class="flex items-center gap-1.5">
                        ${badge}
                        <span class="text-zinc-800">${name}</span>
                    </div>
                    <span class="text-zinc-900 font-black">${valueStr}</span>
                </div>
                <div class="w-full bg-zinc-100 rounded-full h-2.5 overflow-hidden">
                    <div class="${colorClass} h-2.5 rounded-full transition-all duration-500" style="width: ${Math.max(percent, 5)}%"></div>
                </div>
            </div>
        `;
    };

    const displayStartDatum = (saisonStart === '2020-01-01') ? 'Saison 2025/2026' : `Saison ab ${saisonStart}`;

    return `
        <div class="space-y-4 max-w-4xl mx-auto pb-12 animate-fade-in">
            <!-- Header -->
            <div class="border-b border-zinc-200 pb-3 flex justify-between items-center">
                <div class="flex items-center space-x-2">
                    <button onclick="app.router.navigate('dashboard')" class="text-zinc-500 touch-target">
                        <i class="fas fa-arrow-left"></i>
                    </button>
                    <div>
                        <h2 class="text-lg font-black text-zinc-900 tracking-tight">Saison Live-Dashboard</h2>
                        <p class="text-xs text-zinc-400 font-medium -mt-0.5">${displayStartDatum}</p>
                    </div>
                </div>
                ${isAdmin ? `
                    <button onclick="app.router.navigate('admin')" class="bg-amber-100 text-amber-900 px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 touch-target">
                        <i class="fas fa-user-shield"></i>
                        <span>Admin-Saison</span>
                    </button>
                ` : ''}
            </div>

            <!-- QUICK-JUMP ICON LEISTE -->
            <div class="flex items-center justify-between gap-1 overflow-x-auto pb-2 scrollbar-none px-1">
                <button onclick="app.logic.scrollToKpiCard(0)" class="px-2.5 py-1.5 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl text-[10px] font-bold shrink-0 flex items-center gap-1 shadow-2xs">
                    <i class="fas fa-golf-ball"></i> 1. HCP
                </button>
                <button onclick="app.logic.scrollToKpiCard(1)" class="px-2.5 py-1.5 bg-amber-50 text-amber-800 border border-amber-200 rounded-xl text-[10px] font-bold shrink-0 flex items-center gap-1 shadow-2xs">
                    <i class="fas fa-crown"></i> 2. Putts
                </button>
                <button onclick="app.logic.scrollToKpiCard(2)" class="px-2.5 py-1.5 bg-blue-50 text-blue-800 border border-blue-200 rounded-xl text-[10px] font-bold shrink-0 flex items-center gap-1 shadow-2xs">
                    <i class="fas fa-dove"></i> 3. Birdies
                </button>
                <button onclick="app.logic.scrollToKpiCard(3)" class="px-2.5 py-1.5 bg-indigo-50 text-indigo-800 border border-indigo-200 rounded-xl text-[10px] font-bold shrink-0 flex items-center gap-1 shadow-2xs">
                    <i class="fas fa-bullseye"></i> 4. Pars
                </button>
                <button onclick="app.logic.scrollToKpiCard(4)" class="px-2.5 py-1.5 bg-pink-50 text-pink-800 border border-pink-200 rounded-xl text-[10px] font-bold shrink-0 flex items-center gap-1 shadow-2xs">
                    <i class="fas fa-glass-cheers"></i> 5. Ladies
                </button>
                <button onclick="app.logic.scrollToKpiCard(5)" class="px-2.5 py-1.5 bg-red-50 text-red-800 border border-red-200 rounded-xl text-[10px] font-bold shrink-0 flex items-center gap-1 shadow-2xs">
                    <i class="fas fa-pen-slash"></i> 6. Striche
                </button>
                <button onclick="app.logic.scrollToKpiCard(6)" class="px-2.5 py-1.5 bg-amber-50 text-amber-900 border border-amber-300 rounded-xl text-[10px] font-bold shrink-0 flex items-center gap-1 shadow-2xs">
                    <i class="fas fa-bee"></i> 7. Fleiß
                </button>
            </div>

            <!-- SWIPE CAROUSEL CONTAINER -->
            <div id="kpi-carousel-container" class="flex overflow-x-auto snap-x snap-mandatory scrollbar-none space-x-4 pb-4 pt-1">

                <!-- CARD 1: Handicap -->
                <div class="kpi-card snap-center shrink-0 w-[86vw] sm:w-[360px] md:w-[400px] bg-white border border-zinc-200 rounded-3xl p-5 shadow-md flex flex-col justify-between">
                    <div class="space-y-3">
                        <div class="flex items-center justify-between border-b border-zinc-100 pb-2.5">
                            <div class="flex items-center gap-2">
                                <div class="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center text-sm"><i class="fas fa-golf-ball"></i></div>
                                <h3 class="font-extrabold text-xs text-zinc-900 uppercase tracking-wider">1. LIE Handicap</h3>
                            </div>
                            <span class="text-[9px] font-bold bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full border border-emerald-200">Aktuell</span>
                        </div>
                        <div class="space-y-2.5 pt-1">
                            ${kpiHandicap.map((sp, i) => {
                                const hcp = parseFloat(sp.hcpLIE) || 26;
                                const pct = Math.min(100, Math.max(10, ((36 - hcp) / 36) * 100));
                                return renderChartRow(i + 1, sp.nickname || sp.name, hcp.toFixed(1), pct, "bg-emerald-600");
                            }).join('')}
                        </div>
                    </div>
                    <p class="text-[9px] text-zinc-400 font-medium text-center mt-4">← Wischen für weitere Stats →</p>
                </div>

                <!-- CARD 2: Putt König -->
                <div class="kpi-card snap-center shrink-0 w-[86vw] sm:w-[360px] md:w-[400px] bg-white border border-zinc-200 rounded-3xl p-5 shadow-md flex flex-col justify-between">
                    <div class="space-y-3">
                        <div class="flex items-center justify-between border-b border-zinc-100 pb-2.5">
                            <div class="flex items-center gap-2">
                                <div class="w-8 h-8 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center text-sm"><i class="fas fa-crown"></i></div>
                                <h3 class="font-extrabold text-xs text-zinc-900 uppercase tracking-wider">2. Putt-König</h3>
                            </div>
                            <span class="text-[9px] font-bold bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full border border-amber-200">Ø Best 10</span>
                        </div>
                        <div class="space-y-2.5 pt-1">
                            ${kpiPutts.length === 0 ? '<p class="text-xs text-zinc-400 py-4 text-center">Noch keine Putts erfasst</p>' : 
                                kpiPutts.map((item, i) => {
                                    const maxPutts = 45;
                                    const pct = Math.max(10, ((maxPutts - parseFloat(item.avgPutts)) / maxPutts) * 100);
                                    return renderChartRow(i + 1, item.spieler.nickname || item.spieler.name, `${item.avgPutts} Ø (${item.count} R.)`, pct, "bg-amber-500");
                                }).join('')
                            }
                        </div>
                    </div>
                    <p class="text-[9px] text-zinc-400 font-medium text-center mt-4">← Wischen für weitere Stats →</p>
                </div>

                <!-- CARD 3: Birdy-Man -->
                <div class="kpi-card snap-center shrink-0 w-[86vw] sm:w-[360px] md:w-[400px] bg-white border border-zinc-200 rounded-3xl p-5 shadow-md flex flex-col justify-between">
                    <div class="space-y-3">
                        <div class="flex items-center justify-between border-b border-zinc-100 pb-2.5">
                            <div class="flex items-center gap-2">
                                <div class="w-8 h-8 rounded-xl bg-blue-100 text-blue-800 flex items-center justify-center text-sm"><i class="fas fa-dove"></i></div>
                                <h3 class="font-extrabold text-xs text-zinc-900 uppercase tracking-wider">3. Birdy-Man</h3>
                            </div>
                            <span class="text-[9px] font-bold bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full border border-blue-200">Gesamt</span>
                        </div>
                        <div class="space-y-2.5 pt-1">
                            ${(() => {
                                const maxVal = Math.max(...kpiBirdies.map(m => m.birdies), 1);
                                return kpiBirdies.map((item, i) => {
                                    const pct = (item.birdies / maxVal) * 100;
                                    return renderChartRow(i + 1, item.spieler.nickname || item.spieler.name, `${item.birdies} Birdies`, pct, "bg-blue-600");
                                }).join('');
                            })()}
                        </div>
                    </div>
                    <p class="text-[9px] text-zinc-400 font-medium text-center mt-4">← Wischen für weitere Stats →</p>
                </div>

                <!-- CARD 4: Paar-Man -->
                <div class="kpi-card snap-center shrink-0 w-[86vw] sm:w-[360px] md:w-[400px] bg-white border border-zinc-200 rounded-3xl p-5 shadow-md flex flex-col justify-between">
                    <div class="space-y-3">
                        <div class="flex items-center justify-between border-b border-zinc-100 pb-2.5">
                            <div class="flex items-center gap-2">
                                <div class="w-8 h-8 rounded-xl bg-indigo-100 text-indigo-800 flex items-center justify-center text-sm"><i class="fas fa-bullseye"></i></div>
                                <h3 class="font-extrabold text-xs text-zinc-900 uppercase tracking-wider">4. Paar-Man</h3>
                            </div>
                            <span class="text-[9px] font-bold bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full border border-indigo-200">Gesamt</span>
                        </div>
                        <div class="space-y-2.5 pt-1">
                            ${(() => {
                                const maxVal = Math.max(...kpiPars.map(m => m.pars), 1);
                                return kpiPars.map((item, i) => {
                                    const pct = (item.pars / maxVal) * 100;
                                    return renderChartRow(i + 1, item.spieler.nickname || item.spieler.name, `${item.pars} Pars`, pct, "bg-indigo-600");
                                }).join('');
                            })()}
                        </div>
                    </div>
                    <p class="text-[9px] text-zinc-400 font-medium text-center mt-4">← Wischen für weitere Stats →</p>
                </div>

                <!-- CARD 5: Lady Kracher -->
                <div class="kpi-card snap-center shrink-0 w-[86vw] sm:w-[360px] md:w-[400px] bg-white border border-zinc-200 rounded-3xl p-5 shadow-md flex flex-col justify-between">
                    <div class="space-y-3">
                        <div class="flex items-center justify-between border-b border-zinc-100 pb-2.5">
                            <div class="flex items-center gap-2">
                                <div class="w-8 h-8 rounded-xl bg-pink-100 text-pink-800 flex items-center justify-center text-sm"><i class="fas fa-glass-cheers"></i></div>
                                <h3 class="font-extrabold text-xs text-zinc-900 uppercase tracking-wider">5. Lady Kracher</h3>
                            </div>
                            <span class="text-[9px] font-bold bg-pink-50 text-pink-700 px-2 py-0.5 rounded-full border border-pink-200">Biere</span>
                        </div>
                        <div class="space-y-2.5 pt-1">
                            ${(() => {
                                const maxVal = Math.max(...kpiLadies.map(m => m.ladies), 1);
                                return kpiLadies.map((item, i) => {
                                    const pct = (item.ladies / maxVal) * 100;
                                    return renderChartRow(i + 1, item.spieler.nickname || item.spieler.name, `${item.ladies} Ladies`, pct, "bg-pink-500");
                                }).join('');
                            })()}
                        </div>
                    </div>
                    <p class="text-[9px] text-zinc-400 font-medium text-center mt-4">← Wischen für weitere Stats →</p>
                </div>

                <!-- CARD 6: Stricher -->
                <div class="kpi-card snap-center shrink-0 w-[86vw] sm:w-[360px] md:w-[400px] bg-white border border-zinc-200 rounded-3xl p-5 shadow-md flex flex-col justify-between">
                    <div class="space-y-3">
                        <div class="flex items-center justify-between border-b border-zinc-100 pb-2.5">
                            <div class="flex items-center gap-2">
                                <div class="w-8 h-8 rounded-xl bg-red-100 text-red-800 flex items-center justify-center text-sm"><i class="fas fa-pen-slash"></i></div>
                                <h3 class="font-extrabold text-xs text-zinc-900 uppercase tracking-wider">6. Stricher</h3>
                            </div>
                            <span class="text-[9px] font-bold bg-red-50 text-red-700 px-2 py-0.5 rounded-full border border-red-200">Letzte 10 Spiele</span>
                        </div>
                        <div class="space-y-2.5 pt-1">
                            ${(() => {
                                const maxVal = Math.max(...kpiStricher.map(m => m.striche), 1);
                                return kpiStricher.map((item, i) => {
                                    const pct = (item.striche / maxVal) * 100;
                                    return renderChartRow(i + 1, item.spieler.nickname || item.spieler.name, `${item.striche} Striche`, pct, "bg-red-500");
                                }).join('');
                            })()}
                        </div>
                    </div>
                    <p class="text-[9px] text-zinc-400 font-medium text-center mt-4">← Wischen für weitere Stats →</p>
                </div>

                <!-- CARD 7: Fleißiges Bienchen -->
                <div class="kpi-card snap-center shrink-0 w-[86vw] sm:w-[360px] md:w-[400px] bg-white border border-zinc-200 rounded-3xl p-5 shadow-md flex flex-col justify-between">
                    <div class="space-y-3">
                        <div class="flex items-center justify-between border-b border-zinc-100 pb-2.5">
                            <div class="flex items-center gap-2">
                                <div class="w-8 h-8 rounded-xl bg-amber-100 text-amber-900 flex items-center justify-center text-sm"><i class="fas fa-bee"></i></div>
                                <h3 class="font-extrabold text-xs text-zinc-900 uppercase tracking-wider">7. Fleißiges Bienchen</h3>
                            </div>
                            <span class="text-[9px] font-bold bg-amber-50 text-amber-800 px-2 py-0.5 rounded-full border border-amber-200">Turniere</span>
                        </div>
                        <div class="space-y-2.5 pt-1">
                            ${(() => {
                                const maxVal = Math.max(...kpiFleiss.map(m => m.runden), 1);
                                return kpiFleiss.map((item, i) => {
                                    const pct = (item.runden / maxVal) * 100;
                                    return renderChartRow(i + 1, item.spieler.nickname || item.spieler.name, `${item.runden} Runden`, pct, "bg-amber-600");
                                }).join('');
                            })()}
                        </div>
                    </div>
                    <p class="text-[9px] text-zinc-400 font-medium text-center mt-4">Ende der Stats</p>
                </div>

            </div>
        </div>
    `;
};

// Scrollt per Click auf der Icon-Leiste direkt zur gewählten Karte
app.logic.scrollToKpiCard = function(index)
{
    const container = document.getElementById('kpi-carousel-container');
    if (!container) return;

    const cards = container.querySelectorAll('.kpi-card');
    if (cards && cards[index])
    {
        cards[index].scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
};