// =========================================================================
// BMAssistent / LIE Scorecard - Tabellarische Schnellerfassung
// Views_ScoreSchnellerfassung.js
// BSD (Allman) Style
// =========================================================================

app.views = app.views || {};

app.views.scoreSchnellerfassung = app.views.score_schnellerfassung = function(params)
{
    let spieltagId = params;
    let targetFlightSeq = 1;

    // Parameter intelligent entpacken (wg. Router)
    if (typeof params === 'object' && params !== null)
    {
        spieltagId = params.id || params.spieltagId;
        targetFlightSeq = params.flightSeq || params.targetFlightSeq || 1;
    }
    targetFlightSeq = parseInt(targetFlightSeq) || 1;

    app.state.liveScores = app.state.liveScores || {};

    const spieltage = app.state.spieltage || [];
    const spieltag = spieltage.find(function(st) { return String(st.id).trim() === String(spieltagId).trim(); });
    const kurs = (app.state.kurse || []).find(function(k) { return spieltag && String(k.id) === String(spieltag.kursId); });

    if (!spieltag) return `<div class="p-4 text-center">Spieltag nicht gefunden.</div>`;

    const is9Loch = (spieltag.bahnAnzahl === 9 || String(spieltag.rundenTyp || '').startsWith('9'));
    const kursBahnen = (app.state.bahnen || []).filter(function(b) { return String(b.kursId).trim() === String(spieltag.kursId).trim(); });
    kursBahnen.sort(function(a, b) { return parseInt(a.nr) - parseInt(b.nr); });

    let startHole = 1;
    let endHole = (kurs && kurs.bahnAnzahl) ? parseInt(kurs.bahnAnzahl) : 18;

    if (spieltag.rundenTyp === '9-Front') { startHole = 1; endHole = 9; }
    else if (spieltag.rundenTyp === '9-Back') { startHole = 10; endHole = 18; }
    else if (is9Loch) { startHole = 1; endHole = 9; }

    const anzuzeigendeBahnen = [];
    for (let i = startHole; i <= endHole; i++)
    {
        const bMatch = kursBahnen.find(b => parseInt(b.nr) === i);
        if (bMatch) anzuzeigendeBahnen.push(bMatch);
        else anzuzeigendeBahnen.push({ nr: i, par: 4, si: i, kursId: spieltag.kursId });
    }

    // =====================================================================
    // FLIGHT-LOGIK (Für korrekte Sortierung und Gruppierung)
    // =====================================================================
    const tagesFlights = app.state.flights ? app.state.flights.filter(function(f) { return String(f.spieltagId).trim() === String(spieltagId).trim(); }) : [];

    let gewaehlterFlight = tagesFlights.find(function(f) {
        const parts = f.id.split('-');
        return parseInt(parts[parts.length - 1]) === targetFlightSeq;
    });

    if (!gewaehlterFlight && tagesFlights.length > 0) {
        gewaehlterFlight = tagesFlights[0];
        const idParts = gewaehlterFlight.id.split('-');
        targetFlightSeq = parseInt(idParts[idParts.length - 1]) || 1;
    }

    let teilnehmerIds = [];
    if (gewaehlterFlight) {
        // Hier wird die maßgeschneiderte Sortierung aus dem Flight gelesen!
        teilnehmerIds = String(gewaehlterFlight.spielerIdsCsv || "").split(',').map(function(id) { return String(id).trim(); }).filter(Boolean);
    } else {
        const csvString = String(spieltag.teilnehmerCsv || "").trim();
        if (csvString !== "") {
            teilnehmerIds = csvString.split(',').map(function(id) { return String(id).trim(); }).filter(Boolean);
        }
    }

    const spielerListe = teilnehmerIds.map(function(id)
    {
        return (app.state.spieler || []).find(function(s) { return String(s.id).trim() === String(id).trim(); });
    }).filter(Boolean);

    // =====================================================================
    // FLIGHT-SWITCHER UI
    // =====================================================================
    let flightSwitcherHtml = "";
    const isLeiter = app.state.currentUser && (app.state.currentUser.role === 'Admin' || app.state.currentUser.role === 'Spielleiter');

    if (isLeiter && tagesFlights.length > 1)
    {
        let switcherButtons = tagesFlights.map(function(f)
        {
            const idParts = f.id.split('-');
            const fNr = parseInt(idParts[idParts.length - 1]) || 1;
            const isCurrentFlight = fNr === targetFlightSeq;

            return `
                <button onclick="app.router.navigate('score_schnellerfassung', { id: '${spieltagId}', flightSeq: ${fNr} })" class="px-3 py-1 text-xs font-bold rounded-lg transition-all ${isCurrentFlight ? 'bg-emerald-700 text-white shadow-3xs' : 'bg-stone-200 text-stone-600 hover:bg-stone-300'}">
                    Flight ${fNr}
                </button>
            `;
        }).join('');

        flightSwitcherHtml = `
            <div class="flex items-center space-x-2 bg-stone-100 p-1.5 rounded-xl border border-stone-200 mt-3 mb-1">
                <span class="text-[10px] uppercase font-bold text-stone-500 pl-1"><i class="fas fa-exchange-alt"></i> Flight:</span>
                <div class="flex space-x-1">${switcherButtons}</div>
            </div>
        `;
    }

    // Tabellen-Kopf (Spieler)
    let thHtml = `<th class="px-2 py-2 text-left text-[10px] font-bold text-stone-500 uppercase sticky left-0 bg-stone-100 z-10 w-12 border-r border-stone-300">Loch</th>`;
    spielerListe.forEach(function(sp)
    {
        thHtml += `
            <th class="px-2 py-2 text-center text-xs font-bold text-stone-800 border-r border-stone-300 min-w-[70px]">
                ${sp.nickname || sp.name}
                <div class="flex justify-around text-[9px] text-stone-400 mt-1 font-normal tracking-wide">
                    <span>Schläge</span>
                    <span>Putts</span>
                </div>
            </th>
        `;
    });

    // Tabellen-Reihen (Bahnen)
    let trHtml = "";
    anzuzeigendeBahnen.forEach(function(bahn, bahnIndex)
    {
        const hNr = parseInt(bahn.nr);

        let rowHtml = `
            <td class="px-2 py-2 font-bold text-stone-700 bg-stone-50 sticky left-0 border-r border-stone-300 z-10 shadow-[1px_0_2px_rgba(0,0,0,0.05)]">
                <div class="flex flex-col items-center">
                    <span class="text-sm">${hNr}</span>
                    <span class="text-[8px] text-stone-400 font-normal">Par ${bahn.par}</span>
                </div>
            </td>
        `;

        spielerListe.forEach(function(sp, spielerIndex)
        {
            const sId = sp.id;
            const currentScoreKey = `${spieltagId}_${sId}_${hNr}`;
            const currentPutsKey = `${spieltagId}_${sId}_${hNr}_puts`;

            // DB Fallback suchen
            const dbScores = (app.state.scoreCards || []).filter(function(sc) { return String(sc.spieltagId) === String(spieltagId) && String(sc.spielerId) === String(sId); });
            const dbMatch = dbScores.find(function(sc) { return sc.hole !== undefined && parseInt(sc.hole) === hNr; });

            let aktuelleSchlaege = app.state.liveScores[currentScoreKey];
            if (aktuelleSchlaege === undefined && dbMatch && dbMatch.strokes !== undefined) aktuelleSchlaege = dbMatch.strokes;

            let aktuellePutts = app.state.liveScores[currentPutsKey];
            if (aktuellePutts === undefined && dbMatch && dbMatch.puts !== undefined) aktuellePutts = dbMatch.puts;

            const valSchlaege = aktuelleSchlaege !== undefined && aktuelleSchlaege !== null ? aktuelleSchlaege : '';
            const valPutts = aktuellePutts !== undefined && aktuellePutts !== null ? aktuellePutts : '';

            // Tab-Index Berechnung für zeilenweises Lesen
            const spielerAnzahl = spielerListe.length;
            const baseIndex = (bahnIndex * spielerAnzahl * 2);
            const tabStrokes = baseIndex + (spielerIndex * 2) + 1;
            const tabPutts = baseIndex + (spielerIndex * 2) + 2;

            // HTML Optik verbessert: Inputs sitzen bündig wie in Excel
            rowHtml += `
                <td class="px-0 py-0 border-r border-stone-200">
                    <div class="flex h-full min-h-[44px]">
                        <input type="tel" pattern="[0-9]*" tabindex="${tabStrokes}" 
                               oninput="app.logic.updateRapidScoreState('${spieltagId}', '${sId}', ${hNr}, 'strokes', this.value)" 
                               class="w-1/2 text-center font-black text-base text-stone-900 bg-white outline-none focus:bg-amber-50 focus:ring-inset focus:ring-2 focus:ring-amber-400 transition-colors" 
                               value="${valSchlaege}">
                        <input type="tel" pattern="[0-9]*" tabindex="${tabPutts}" 
                               oninput="app.logic.updateRapidScoreState('${spieltagId}', '${sId}', ${hNr}, 'putts', this.value)" 
                               class="w-1/2 text-center font-bold text-sm text-stone-500 bg-stone-50/50 outline-none border-l border-stone-100 focus:bg-amber-50 focus:ring-inset focus:ring-2 focus:ring-amber-400 transition-colors" 
                               value="${valPutts}">
                    </div>
                </td>
            `;
        });

        trHtml += `<tr class="border-b border-stone-200 hover:bg-stone-50 transition-colors">${rowHtml}</tr>`;
    });

    return `
        <div class="space-y-4 pb-28 animate-fade-in">
            <!-- Header -->
            <div>
                <div class="flex items-center justify-between">
                    <div class="flex items-center space-x-2">
                        <button onclick="app.router.navigate('score_eingabe', { id: '${spieltagId}', hole: 1, flightSeq: ${targetFlightSeq} })" class="text-stone-500 touch-target w-10 h-10 flex items-center justify-center bg-stone-100 rounded-xl hover:bg-stone-200 transition">
                            <i class="fas fa-arrow-left"></i>
                        </button>
                        <div>
                            <h2 class="text-base font-bold text-stone-800 flex items-center">Schnellerfassung</h2>
                            <p class="text-[10px] text-stone-400 -mt-0.5 uppercase tracking-wider">${kurs ? kurs.name : 'Scorekarte'}</p>
                        </div>
                    </div>

                    <button onclick="app.logic.syncScoresWithServer('${spieltagId}', ${targetFlightSeq})" class="text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2 rounded-xl transition shadow-3xs flex items-center h-10">
                        <i class="fas fa-cloud-upload-alt mr-2"></i> Alles sichern
                    </button>
                </div>
                ${flightSwitcherHtml}
            </div>

            <!-- Tabelle Container -->
            <div class="bg-white border border-stone-200 rounded-2xl shadow-sm overflow-hidden">
                <div class="overflow-x-auto scrollbar-none">
                    <table class="w-full min-w-max border-collapse">
                        <thead class="bg-stone-100 border-b border-stone-300">
                            <tr>${thHtml}</tr>
                        </thead>
                        <tbody>
                            ${trHtml}
                        </tbody>
                    </table>
                </div>
                <div class="p-3 bg-amber-50 border-t border-amber-100 text-[10px] text-amber-800 flex items-start gap-2">
                    <i class="fas fa-info-circle mt-0.5 text-amber-600"></i>
                    <p>Tippe eine Zahl und drücke "Weiter" / "TAB". Der Cursor springt automatisch in Lesereihenfolge (Schläge, dann Putts, dann nächster Spieler) weiter. Ladies und Striche können hier nicht erfasst werden.</p>
                </div>
            </div>
        </div>
    `;
};