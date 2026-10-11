// =========================================================================
// LIE Scorecard - Admin: historische Spieltage korrigieren
// =========================================================================

var app = app || {};
app.logic = app.logic || {};

app.logic.openAdminRoundCorrection = function()
{
    if (!app.state.currentUser || app.state.currentUser.role !== 'Admin')
    {
        app.logic.showToast('Nur Administratoren dürfen historische Runden korrigieren.', 'error');
        return;
    }

    const rounds = (app.state.spieltage || []).filter(function(st)
    {
        return !st.istGeloescht && String(st.status) === 'Beendet';
    }).sort(function(a, b) { return String(b.date || '').localeCompare(String(a.date || '')); });

    const options = rounds.map(function(st)
    {
        return `<option value="${st.id}">${st.date || ''} · ${st.id}</option>`;
    }).join('');

    const html = `
        <div id="admin-round-correction-modal" class="fixed inset-0 z-50 bg-zinc-950/70 backdrop-blur-xs flex items-center justify-center p-3 animate-fade-in">
            <div class="bg-white rounded-2xl w-full max-w-3xl max-h-[92vh] overflow-y-auto p-5 shadow-2xl">
                <div class="flex justify-between items-start border-b border-zinc-100 pb-3 mb-4">
                    <div><h3 class="font-black text-zinc-900">Historischen Spieltag korrigieren</h3><p class="text-xs text-zinc-500">Kurs, Start-HCP und Scores ändern; danach Saison chronologisch neu berechnen.</p></div>
                    <button onclick="document.getElementById('admin-round-correction-modal').remove()" class="text-zinc-400 touch-target"><i class="fas fa-times"></i></button>
                </div>
                <label class="text-[10px] font-bold text-zinc-500 uppercase">Spieltag</label>
                <select id="admin-correction-round" onchange="app.logic.renderAdminRoundCorrection()" class="w-full mt-1 bg-zinc-50 border border-zinc-200 rounded-xl p-2.5 text-xs font-bold">${options}</select>
                <div id="admin-correction-body" class="mt-4"></div>
            </div>
        </div>`;

    document.body.insertAdjacentHTML('beforeend', html);
    app.logic.renderAdminRoundCorrection();
};

app.logic.renderAdminRoundCorrection = function()
{
    const select = document.getElementById('admin-correction-round');
    const body = document.getElementById('admin-correction-body');
    if (!select || !body) return;

    const st = (app.state.spieltage || []).find(function(x) { return String(x.id) === String(select.value); });
    if (!st) { body.innerHTML = '<p class="text-xs text-red-600">Spieltag nicht gefunden.</p>'; return; }

    const courseOptions = (app.state.kurse || []).map(function(k)
    {
        const p = (app.state.golfplaetze || []).find(function(x) { return String(x.id) === String(k.platzId); });
        return `<option value="${k.id}" ${String(k.id) === String(st.kursId) ? 'selected' : ''}>${p ? p.name + ' - ' : ''}${k.name}</option>`;
    }).join('');

    const ids = app.logic.getRoundParticipantIds(st);
    const holes = app.logic.getRoundHoles(st);
    const overrideMap = st.hcpStartOverrides || {};

    let playersHtml = '';
    ids.forEach(function(playerId)
    {
        const sp = (app.state.spieler || []).find(function(x) { return String(x.id) === String(playerId); });
        const name = sp ? (sp.nickname || sp.name) : playerId;

        // Nur ein bewusst gespeicherter Override wird angezeigt.
        // Leer bedeutet: Start-HCP automatisch aus der chronologischen HCP-Kette übernehmen.
        const startHcp = Number.isFinite(parseFloat(overrideMap[playerId]))
            ? overrideMap[playerId]
            : '';

        let scoreInputs = '';
        holes.forEach(function(hole)
        {
            const sc = (app.state.scoreCards || []).find(function(x)
            {
                return String(x.spieltagId) === String(st.id) && String(x.spielerId) === String(playerId) && parseInt(x.hole) === parseInt(hole.nr);
            });
            const scoreId = sc ? sc.id : `SC-${st.id}-${playerId}-${hole.nr}`;
            const puts = sc && sc.puts !== undefined ? sc.puts : (sc && sc.putts !== undefined ? sc.putts : '');
            const lady = !!(sc && (sc.lady === true || String(sc.lady).toLowerCase() === 'true'));
            scoreInputs += `<div class="text-center min-w-0">
                <div class="text-[9px] font-bold text-zinc-500 mb-1">${hole.nr}</div>
                <input title="Schläge" aria-label="Loch ${hole.nr} Schläge" type="number" min="1" data-score-id="${scoreId}" data-player-id="${playerId}" data-hole="${hole.nr}" value="${sc && sc.strokes ? sc.strokes : ''}" class="w-full border border-zinc-200 rounded-lg p-1.5 text-center text-xs font-bold">
                <input title="Putts" aria-label="Loch ${hole.nr} Putts" type="number" min="0" data-puts-id="${scoreId}" value="${puts}" class="mt-1 w-full border border-zinc-200 rounded-lg p-1 text-center text-[10px]" placeholder="P">
                <label title="Lady" class="mt-1 flex items-center justify-center gap-1 text-[9px] text-zinc-500"><input type="checkbox" data-lady-id="${scoreId}" ${lady ? 'checked' : ''}> L</label>
            </div>`;
        });

        playersHtml += `<div class="border border-zinc-200 rounded-xl p-3 space-y-2">
            <div class="flex items-center justify-between gap-3"><span class="text-xs font-black text-zinc-800">${name}</span><label class="text-[10px] text-zinc-500">Start-HCP <input type="number" min="0" max="54" step="1" data-hcp-player="${playerId}" value="${startHcp}" placeholder="Auto" title="Leer = automatisch aus der vorherigen gültigen Runde" class="ml-1 w-16 border border-zinc-200 rounded-lg p-1.5 text-center text-xs font-bold"> <span class="text-[9px] text-zinc-400">leer = automatisch</span></label></div>
            <div class="grid grid-cols-9 gap-1">${scoreInputs}</div>
        </div>`;
    });

    body.innerHTML = `
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-4">
            <div><label class="text-[10px] font-bold text-zinc-500 uppercase">Datum</label><input id="admin-correction-date" type="date" value="${st.date || ''}" class="w-full mt-1 border border-zinc-200 rounded-xl p-2 text-xs font-bold"></div>
            <div><label class="text-[10px] font-bold text-zinc-500 uppercase">Kurs</label><select id="admin-correction-course" class="w-full mt-1 border border-zinc-200 rounded-xl p-2 text-xs font-bold">${courseOptions}</select></div>
            <div><label class="text-[10px] font-bold text-zinc-500 uppercase">Rundentyp</label><select id="admin-correction-type" class="w-full mt-1 border border-zinc-200 rounded-xl p-2 text-xs font-bold"><option value="18" ${st.rundenTyp === '18' ? 'selected' : ''}>18 Loch</option><option value="9-Front" ${st.rundenTyp === '9-Front' ? 'selected' : ''}>9 Front</option><option value="9-Back" ${st.rundenTyp === '9-Back' ? 'selected' : ''}>9 Back</option></select></div>
        </div>
        <div class="mb-2 text-[9px] text-zinc-400">Je Loch: Schläge · P = Putts · L = Lady</div>
        <div class="space-y-3">${playersHtml}</div>
        <div id="admin-correction-preview" class="hidden mt-4"></div>
        <div class="mt-4 bg-amber-50 border border-amber-200 rounded-xl p-3 text-[11px] text-amber-900"><b>Wichtig:</b> Speichern ändert die ausgewählte Runde. „Speichern & Saison neu berechnen“ berechnet anschließend alle beendeten Runden ab dem Saisonstart chronologisch neu und aktualisiert die aktuellen LIE-HCPs.</div>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-4">
            <button onclick="app.logic.previewAdminRoundCorrection()" class="bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-200 font-bold py-2.5 rounded-xl text-xs"><i class="fas fa-eye mr-1"></i> Neuberechnung prüfen</button>
            <button onclick="app.logic.saveAdminRoundCorrection(false)" class="bg-zinc-100 hover:bg-zinc-200 text-zinc-800 font-bold py-2.5 rounded-xl text-xs">Nur Korrektur speichern</button>
            <button onclick="app.logic.saveAdminRoundCorrection(true)" class="bg-amber-500 hover:bg-amber-600 text-zinc-950 font-black py-2.5 rounded-xl text-xs"><i class="fas fa-calculator mr-1"></i> Speichern & Saison neu berechnen</button>
        </div>`;
};

app.logic.saveAdminRoundCorrection = async function(recalculate, confirmed)
{
    if (!app.state.currentUser || app.state.currentUser.role !== 'Admin') return;

    const roundId = document.getElementById('admin-correction-round').value;
    const st = (app.state.spieltage || []).find(function(x) { return String(x.id) === String(roundId); });
    if (!st) return;

    const date = document.getElementById('admin-correction-date').value;
    const kursId = document.getElementById('admin-correction-course').value;
    const rundenTyp = document.getElementById('admin-correction-type').value;
    const bahnAnzahl = String(rundenTyp).startsWith('9') ? 9 : 18;
    const overrides = Object.assign({}, st.hcpStartOverrides || {});

    if (recalculate)
    {
        const seasonStart = String(app.state.saisonStartDatum || '');
        const affectedRounds = (app.state.spieltage || []).filter(function(round)
        {
            return !round.istGeloescht
                && String(round.status) === 'Beendet'
                && String(round.date || '') >= seasonStart;
        });
        const affectedPlayers = new Set();
        affectedRounds.forEach(function(round)
        {
            app.logic.getRoundParticipantIds(round).forEach(function(playerId) { affectedPlayers.add(String(playerId)); });
        });

        if (!confirmed)
        {
            const message =
                'Jetzt werden echte Daten gespeichert.\n\n' +
                'Ausgewählte Runde: ' + String(date || st.date || '') + '\n' +
                'Neu berechnete Runden: ' + affectedRounds.length + '\n' +
                'Betroffene Spieler: ' + affectedPlayers.size + '\n\n' +
                'Gelöschte und nicht beendete Runden werden nicht berücksichtigt.';

            app.logic.showConfirm(
                'Saison neu berechnen?',
                message,
                'warning',
                function() { app.logic.saveAdminRoundCorrection(true, true); },
                null,
                { confirmText: 'Speichern & neu berechnen', cancelText: 'Abbrechen' }
            );
            return;
        }
    }

    document.querySelectorAll('#admin-correction-body [data-hcp-player]').forEach(function(input)
    {
        const playerId = String(input.dataset.hcpPlayer);
        const raw = String(input.value || '').trim();
        const val = parseInt(raw);

        if (raw !== '' && Number.isFinite(val))
        {
            overrides[playerId] = Math.max(0, Math.min(54, val));
        }
        else
        {
            // Leeres Feld entfernt einen eventuell vorhandenen Override.
            delete overrides[playerId];
        }
    });

    try
    {
        const batch = app.db.batch();
        batch.set(app.db.collection('spieltage').doc(String(roundId)), {
            date: date, kursId: kursId, rundenTyp: rundenTyp, bahnAnzahl: bahnAnzahl, hcpStartOverrides: overrides
        }, { merge: true });

        document.querySelectorAll('#admin-correction-body [data-score-id]').forEach(function(input)
        {
            const strokes = parseInt(input.value);
            if (!Number.isFinite(strokes) || strokes <= 0) return;
            const ref = app.db.collection('scorecards').doc(String(input.dataset.scoreId));
            const putsInput = document.querySelector(`#admin-correction-body [data-puts-id="${input.dataset.scoreId}"]`);
            const ladyInput = document.querySelector(`#admin-correction-body [data-lady-id="${input.dataset.scoreId}"]`);
            const puts = putsInput && putsInput.value !== '' ? parseInt(putsInput.value) : null;
            const payload = {
                id: String(input.dataset.scoreId), spieltagId: String(roundId), spielerId: String(input.dataset.playerId),
                hole: parseInt(input.dataset.hole), strokes: strokes,
                lady: !!(ladyInput && ladyInput.checked)
            };
            if (Number.isFinite(puts) && puts >= 0) payload.puts = puts;
            batch.set(ref, payload, { merge: true });
        });

        await batch.commit();
        st.date = date; st.kursId = kursId; st.rundenTyp = rundenTyp; st.bahnAnzahl = bahnAnzahl; st.hcpStartOverrides = overrides;
        await app.logic.refreshGlobalAppData();

        if (recalculate)
        {
            const result = await app.logic.recalculateSeasonFromStart();
            await app.logic.refreshGlobalAppData();
            app.logic.showToast(`${result.rounds} Spieltage chronologisch neu berechnet.`, 'success');
        }
        else
        {
            app.logic.showToast('Korrektur gespeichert. Noch keine HCP-Neuberechnung durchgeführt.', 'success');
        }

        const modal = document.getElementById('admin-round-correction-modal');
        if (modal) modal.remove();
        app.router.navigate('admin');
    }
    catch (err)
    {
        console.error('[Admin Korrektur]', err);
        app.logic.showToast('Korrektur fehlgeschlagen: ' + err.message, 'error');
    }
};


app.logic.getAdminCorrectionDraft = function()
{
    const roundId = document.getElementById('admin-correction-round').value;
    const original = (app.state.spieltage || []).find(x => String(x.id) === String(roundId));
    if (!original) throw new Error('Spieltag nicht gefunden.');
    const round = Object.assign({}, original, {
        date: document.getElementById('admin-correction-date').value,
        kursId: document.getElementById('admin-correction-course').value,
        rundenTyp: document.getElementById('admin-correction-type').value
    });
    round.bahnAnzahl = String(round.rundenTyp).startsWith('9') ? 9 : 18;
    round.hcpStartOverrides = Object.assign({}, original.hcpStartOverrides || {});
    document.querySelectorAll('#admin-correction-body [data-hcp-player]').forEach(input => {
        const playerId = String(input.dataset.hcpPlayer);
        const raw = String(input.value || '').trim();
        const v = parseInt(raw);

        if (raw !== '' && Number.isFinite(v))
        {
            round.hcpStartOverrides[playerId] = Math.max(0, Math.min(54, v));
        }
        else
        {
            // Vorschau: leer bedeutet ebenfalls automatische HCP-Fortschreibung.
            delete round.hcpStartOverrides[playerId];
        }
    });

    const scorecards = (app.state.scoreCards || []).map(sc => Object.assign({}, sc));
    document.querySelectorAll('#admin-correction-body [data-score-id]').forEach(input => {
        const strokes = parseInt(input.value);
        if (!Number.isFinite(strokes) || strokes <= 0) return;
        const id = String(input.dataset.scoreId);
        let sc = scorecards.find(x => String(x.id) === id);
        if (!sc) { sc = { id:id }; scorecards.push(sc); }
        sc.spieltagId = String(roundId); sc.spielerId = String(input.dataset.playerId);
        sc.hole = parseInt(input.dataset.hole); sc.strokes = strokes;
        const p = document.querySelector(`#admin-correction-body [data-puts-id="${id}"]`);
        const l = document.querySelector(`#admin-correction-body [data-lady-id="${id}"]`);
        if (p && p.value !== '' && Number.isFinite(parseInt(p.value))) sc.puts = parseInt(p.value);
        sc.lady = !!(l && l.checked);
    });
    return { round, scorecards };
};

app.logic.previewAdminRoundCorrection = function()
{
    try
    {
        const draft = app.logic.getAdminCorrectionDraft();
        const seasonStart = String(app.state.saisonStartDatum || '');
        const rounds = (app.state.spieltage || []).filter(st => !st.istGeloescht && String(st.status) === 'Beendet' && String(st.date || '') >= seasonStart)
            .map(st => String(st.id) === String(draft.round.id) ? draft.round : Object.assign({}, st))
            .sort((a,b) => String(a.date || '').localeCompare(String(b.date || '')) || String(a.id).localeCompare(String(b.id)));
        const currentHcp = {};
        (app.state.spieler || []).forEach(sp => currentHcp[String(sp.id)] = 26);
        const rows = [];
        rounds.forEach(round => {
            app.logic.getRoundParticipantIds(round).forEach(playerId => {
                const overrides = round.hcpStartOverrides || {};
                const start = Number.isFinite(parseFloat(overrides[playerId])) ? parseInt(overrides[playerId]) : (currentHcp[playerId] ?? 26);
                const result = app.logic.calculateRoundForPlayer(round, playerId, start, draft.scorecards);
                currentHcp[playerId] = result.endHcp;
                const sp = (app.state.spieler || []).find(x => String(x.id) === String(playerId));
                rows.push({ date:round.date, name:sp ? (sp.nickname || sp.name) : playerId, start, netto:result.totalNetto, end:result.endHcp, complete:result.complete });
            });
        });
        const box = document.getElementById('admin-correction-preview');
        box.className = 'mt-4 bg-emerald-50 border border-emerald-200 rounded-xl p-3';
        box.innerHTML = '<div class="font-black text-xs text-emerald-900 mb-2">Vorschau – es wurde noch nichts gespeichert</div>' +
            '<div class="max-h-64 overflow-y-auto space-y-1">' + rows.map(r => `<div class="grid grid-cols-[82px_1fr_auto] gap-2 text-[10px] border-b border-emerald-100 py-1"><span>${r.date}</span><b>${r.name}</b><span>HCP ${r.start} → Netto ${r.netto} → ${r.end}${r.complete ? '' : ' (unvollständig)'}</span></div>`).join('') + '</div>';
    }
    catch (err)
    {
        console.error('[Admin Korrektur Vorschau]', err);
        app.logic.showToast('Vorschau fehlgeschlagen: ' + err.message, 'error');
    }
};
