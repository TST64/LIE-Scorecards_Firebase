// =========================================================================
// BMAssistent / LIE Scorecard - Live Dashboard & Saison KPIs
// Views_LiveDashboard.js
// BSD (Allman) Style
// =========================================================================

app.views = app.views || {};

app.views.live_dashboard = function()
{
    const isAdmin = app.state.currentUser && app.state.currentUser.role === 'Admin';
    
    // Falls noch kein Saison-Datum in Firestore gesetzt wurde, nehmen wir alle bisherigen Runden (2025-2026)
    const saisonStart = app.state.saisonStartDatum || '2020-01-01';

    // Runden für die aktuelle Saison / Historie filtern
    const saisonRunden = (app.state.spieltage || []).filter(
        function(st)
        {
            if (!st) return false;
            
            const isDel = st.istGeloescht === true || 
                          String(st.istGeloescht).toUpperCase() === "TRUE" || 
                          st.istGelöscht === true || 
                          String(st.istGelöscht).toUpperCase() === "TRUE";
            if (isDel) return false;

            // Tolerante Status-Prüfung (Beendet / beendet / Abgeschlossen)
            const statusNorm = String(st.status || '').toLowerCase().trim();
            const isDone = (statusNorm === 'beendet' || statusNorm === 'abgeschlossen');

            // Datum-Filter
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

    // 1. Handicap (Aufsteigend - niedrigstes HCP zuerst)
    const kpiHandicap = [...activeSpieler].sort(
        function(a, b)
        {
            return (parseFloat(a.hcpLIE) || 26) - (parseFloat(b.hcpLIE) || 26);
        }
    );

    // 2. Putt König (Durchschnitt der verbleibenden Runden, max. Beste 10)
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
                            const puttsVal = parseInt(sc.putts);
                            if (!isNaN(puttsVal) && puttsVal > 0)
                            {
                                roundPuttSum += puttsVal;
                                holesCount++;
                            }
                        }
                    );

                    if (holesCount > 0)
                    {
                        // Bei 9-Loch-Runden hochrechnen auf 18-Loch Äquivalent für fairen Vergleich
                        const normPutts = holesCount <= 9 ? (roundPuttSum / holesCount) * 18 : roundPuttSum;
                        rundenPutts.push(normPutts);
                    }
                }
            );

            rundenPutts.sort((a, b) => a - b); // Wenigste (beste) Putts zuerst
            const top10 = rundenPutts.slice(0, 10);
            const avg = top10.length > 0 ? (top10.reduce((a, b) => a + b, 0) / top10.length).toFixed(1) : null;

            return { spieler: sp, avgPutts: avg, count: rundenPutts.length };
        }
    ).filter(item => item.avgPutts !== null).sort((a, b) => parseFloat(a.avgPutts) - parseFloat(b.avgPutts));

    // 3. Birdy-Man, 4. Paar-Man, 5. Lady Kracher, 6. Stricher, 7. Fleißiges Bienchen
    const kpiStats = activeSpieler.map(
        function(sp)
        {
            let birdies = 0;
            let pars = 0;
            let ladies = 0;
            let strichCountLast10 = 0;
            let rundenGespielt = 0;

            // Runden des Spielers chronologisch sortieren (neueste zuerst)
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
                                if (strokes <= par - 1) birdies++; // Birdie oder besser (Eagle/Albatros)
                                if (strokes === par) pars++;
                            }

                            // Lady-Biere ermitteln
                            const ladyVal = parseInt(sc.ladies) || parseInt(sc.lady) || 0;
                            if (ladyVal > 0) ladies += ladyVal;
                        }
                    );
                }
            );

            // Stricher (Letzte 10 gespielte Runden auswerten)
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

                                // Ein Strich liegt vor, wenn 0 Schläge getippt wurden ODER 0 Netto-Punkte erzielt wurden
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

    // Ranglisten Sortierungen
    const kpiBirdies = [...kpiStats].sort((a, b) => b.birdies - a.birdies);
    const kpiPars = [...kpiStats].sort((a, b) => b.pars - a.pars);
    const kpiLadies = [...kpiStats].sort((a, b) => b.ladies - a.ladies);
    const kpiStricher = [...kpiStats].sort((a, b) => b.striche - a.striche);
    const kpiFleiss = [...kpiStats].sort((a, b) => b.runden - a.runden);

    // =====================================================================
    // UI RENDER HELPERS (Horizontal Bar Charts)
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

    // =====================================================================
    // HTML STRUCTURE
    // =====================================================================

    const displayStartDatum = (saisonStart === '2020-01-01') ? 'Saison 2025/2026 (Alle Runden)' : `Saison ab ${saisonStart}`;

    return `
        <div class="space-y-6 max-w-4xl mx-auto pb-12 animate-fade-in">
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
                    <button onclick="app.logic.startNeueSaison()" class="bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-xl text-xs font-bold shadow-xs transition flex items-center gap-1.5 touch-target">
                        <i class="fas fa-rotate"></i>
                        <span>Neue Saison</span>
                    </button>
                ` : ''}
            </div>

            <!-- GRID ALLER 7 KPIs -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">

                <!-- 1. Handicap -->
                <div class="bg-white border border-zinc-200 rounded-2xl p-4 shadow-xs space-y-3">
                    <div class="flex items-center gap-2 border-b border-zinc-100 pb-2">
                        <div class="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center text-xs"><i class="fas fa-golf-ball"></i></div>
                        <h3 class="font-extrabold text-xs text-zinc-900 uppercase tracking-wider">1. LIE Handicap (Aktuell)</h3>
                    </div>
                    <div class="space-y-2.5">
                        ${kpiHandicap.map((sp, i) => {
                            const hcp = parseFloat(sp.hcpLIE) || 26;
                            const pct = Math.min(100, Math.max(10, ((36 - hcp) / 36) * 100));
                            return renderChartRow(i + 1, sp.nickname || sp.name, hcp.toFixed(1), pct, "bg-emerald-600");
                        }).join('')}
                    </div>
                </div>

                <!-- 2. Putt König -->
                <div class="bg-white border border-zinc-200 rounded-2xl p-4 shadow-xs space-y-3">
                    <div class="flex items-center gap-2 border-b border-zinc-100 pb-2">
                        <div class="w-7 h-7 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center text-xs"><i class="fas fa-crown"></i></div>
                        <h3 class="font-extrabold text-xs text-zinc-900 uppercase tracking-wider">2. Putt-König (Ø Best 10)</h3>
                    </div>
                    <div class="space-y-2.5">
                        ${kpiPutts.length === 0 ? '<p class="text-xs text-zinc-400 py-2">Noch keine Putt-Daten in den Scorekarten erfasst</p>' : 
                            kpiPutts.map((item, i) => {
                                const maxPutts = 45;
                                const pct = Math.max(10, ((maxPutts - parseFloat(item.avgPutts)) / maxPutts) * 100);
                                return renderChartRow(i + 1, item.spieler.nickname || item.spieler.name, `${item.avgPutts} Ø (${item.count} R.)`, pct, "bg-amber-500");
                            }).join('')
                        }
                    </div>
                </div>

                <!-- 3. Birdy-Man -->
                <div class="bg-white border border-zinc-200 rounded-2xl p-4 shadow-xs space-y-3">
                    <div class="flex items-center gap-2 border-b border-zinc-100 pb-2">
                        <div class="w-7 h-7 rounded-lg bg-blue-100 text-blue-800 flex items-center justify-center text-xs"><i class="fas fa-dove"></i></div>
                        <h3 class="font-extrabold text-xs text-zinc-900 uppercase tracking-wider">3. Birdy-Man (Gesamt)</h3>
                    </div>
                    <div class="space-y-2.5">
                        ${(() => {
                            const maxVal = Math.max(...kpiBirdies.map(m => m.birdies), 1);
                            return kpiBirdies.map((item, i) => {
                                const pct = (item.birdies / maxVal) * 100;
                                return renderChartRow(i + 1, item.spieler.nickname || item.spieler.name, `${item.birdies} Birdies`, pct, "bg-blue-600");
                            }).join('');
                        })()}
                    </div>
                </div>

                <!-- 4. Paar-Man -->
                <div class="bg-white border border-zinc-200 rounded-2xl p-4 shadow-xs space-y-3">
                    <div class="flex items-center gap-2 border-b border-zinc-100 pb-2">
                        <div class="w-7 h-7 rounded-lg bg-indigo-100 text-indigo-800 flex items-center justify-center text-xs"><i class="fas fa-bullseye"></i></div>
                        <h3 class="font-extrabold text-xs text-zinc-900 uppercase tracking-wider">4. Paar-Man (Gesamt)</h3>
                    </div>
                    <div class="space-y-2.5">
                        ${(() => {
                            const maxVal = Math.max(...kpiPars.map(m => m.pars), 1);
                            return kpiPars.map((item, i) => {
                                const pct = (item.pars / maxVal) * 100;
                                return renderChartRow(i + 1, item.spieler.nickname || item.spieler.name, `${item.pars} Pars`, pct, "bg-indigo-600");
                            }).join('');
                        })()}
                    </div>
                </div>

                <!-- 5. Lady Kracher -->
                <div class="bg-white border border-zinc-200 rounded-2xl p-4 shadow-xs space-y-3">
                    <div class="flex items-center gap-2 border-b border-zinc-100 pb-2">
                        <div class="w-7 h-7 rounded-lg bg-pink-100 text-pink-800 flex items-center justify-center text-xs"><i class="fas fa-glass-cheers"></i></div>
                        <h3 class="font-extrabold text-xs text-zinc-900 uppercase tracking-wider">5. Lady Kracher (Biere)</h3>
                    </div>
                    <div class="space-y-2.5">
                        ${(() => {
                            const maxVal = Math.max(...kpiLadies.map(m => m.ladies), 1);
                            return kpiLadies.map((item, i) => {
                                const pct = (item.ladies / maxVal) * 100;
                                return renderChartRow(i + 1, item.spieler.nickname || item.spieler.name, `${item.ladies} Ladies`, pct, "bg-pink-500");
                            }).join('');
                        })()}
                    </div>
                </div>

                <!-- 6. Stricher -->
                <div class="bg-white border border-zinc-200 rounded-2xl p-4 shadow-xs space-y-3">
                    <div class="flex items-center gap-2 border-b border-zinc-100 pb-2">
                        <div class="w-7 h-7 rounded-lg bg-red-100 text-red-800 flex items-center justify-center text-xs"><i class="fas fa-pen-slash"></i></div>
                        <h3 class="font-extrabold text-xs text-zinc-900 uppercase tracking-wider">6. Stricher (Letzte 10 Spiele)</h3>
                    </div>
                    <div class="space-y-2.5">
                        ${(() => {
                            const maxVal = Math.max(...kpiStricher.map(m => m.striche), 1);
                            return kpiStricher.map((item, i) => {
                                const pct = (item.striche / maxVal) * 100;
                                return renderChartRow(i + 1, item.spieler.nickname || item.spieler.name, `${item.striche} Striche`, pct, "bg-red-500");
                            }).join('');
                        })()}
                    </div>
                </div>

                <!-- 7. Fleißiges Bienchen -->
                <div class="bg-white border border-zinc-200 rounded-2xl p-4 shadow-xs space-y-3 md:col-span-2">
                    <div class="flex items-center gap-2 border-b border-zinc-100 pb-2">
                        <div class="w-7 h-7 rounded-lg bg-amber-100 text-amber-900 flex items-center justify-center text-xs"><i class="fas fa-bee"></i></div>
                        <h3 class="font-extrabold text-xs text-zinc-900 uppercase tracking-wider">7. Fleißiges Bienchen (Gespielte Runden)</h3>
                    </div>
                    <div class="space-y-2.5">
                        ${(() => {
                            const maxVal = Math.max(...kpiFleiss.map(m => m.runden), 1);
                            return kpiFleiss.map((item, i) => {
                                const pct = (item.runden / maxVal) * 100;
                                return renderChartRow(i + 1, item.spieler.nickname || item.spieler.name, `${item.runden} Runden`, pct, "bg-amber-600");
                            }).join('');
                        })()}
                    </div>
                </div>

            </div>
        </div>
    `;
};

// =========================================================================
// ADMIN LOGIK: NEUE SAISON STARTEN
// =========================================================================

app.logic.startNeueSaison = function()
{
    if (!app.state.currentUser || app.state.currentUser.role !== 'Admin')
    {
        if (typeof app.logic.showToast === 'function')
        {
            app.logic.showToast("Nur der Admin kann eine neue Saison starten.", "error");
        }
        return;
    }

    const confirmMessage = "Möchtest du wirklich die NEUE SAISON starten?\n\n- Das LIE Handicap ALLER Spieler wird auf 26.0 zurückgesetzt.\n- Alle Dashboard-Statistiken beginnen ab heute neu bei 0.\n- Alle vergangenen Turniere bleiben in der Historie erhalten.";

    app.logic.showConfirm(
        "Neue Saison starten",
        confirmMessage,
        async function()
        {
            try
            {
                const todayIso = new Date().toISOString().split('T')[0];

                // 1. Saison-Config in Firestore speichern
                await app.db.collection('config').doc('saison').set(
                    {
                        saisonStartDatum: todayIso,
                        gestartetAm: new Date().toISOString(),
                        gestartetVon: app.state.currentUser.nickname || 'Admin'
                    }
                );

                // 2. Alle Spieler-Handicaps in Firestore auf 26.0 setzen
                const spielerSnap = await app.db.collection('spieler').get();
                const batch = app.db.batch();

                spielerSnap.forEach(
                    function(docRef)
                    {
                        batch.update(docRef.ref, { hcpLIE: 26.0 });
                    }
                );

                await batch.commit();

                // 3. Lokalen App-State aktualisieren
                app.state.saisonStartDatum = todayIso;
                if (app.state.spieler)
                {
                    app.state.spieler.forEach(
                        function(sp)
                        {
                            sp.hcpLIE = 26.0;
                        }
                    );
                }

                if (typeof app.logic.showToast === 'function')
                {
                    app.logic.showToast("Neue Saison gestartet! Alle Handicaps stehen auf 26.0.", "success");
                }

                // Neuladen
                app.router.navigate('live_dashboard');
            }
            catch (err)
            {
                console.error("[Saison-Reset] Fehler:", err);
                if (typeof app.logic.showToast === 'function')
                {
                    app.logic.showToast("Fehler beim Starten der neuen Saison.", "error");
                }
            }
        }
    );
};