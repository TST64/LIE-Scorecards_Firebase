// =========================================================================
// LIE Scorecard - Historische HCP-Snapshots & Admin-Neuberechnung
// =========================================================================

var app = app || {};
app.logic = app.logic || {};

app.logic.getRoundParticipantIds = function(spieltag)
{
    return String((spieltag && spieltag.teilnehmerCsv) || '')
        .split(',')
        .map(function(id) { return String(id).trim(); })
        .filter(Boolean);
};

app.logic.getRoundHoles = function(round)
{
    return LieHcpRules.played(round,round.hcpHoleData || (app.state.bahnen || []).filter(h=>String(h.kursId)===String(round.kursId)));
};
app.logic.calculateHoleVorgabeForHcp = function(hcp,round,hole)
{
    const rows=round.hcpCourseTable || (app.state.handicaps || []).filter(h=>String(h.kursId)===String(round.kursId));
    const snap=LieHcpRules.snapshot(round,app.logic.getRoundHoles(round),hcp,rows);
    if(!Object.hasOwn(snap.holeAllowances,String(hole)))throw new Error('Bahn außerhalb der Runde.');
    return snap.holeAllowances[String(hole)];
};
app.logic.getHistoricalHcp = function(player,round,card)
{
    const value=round?.hcpStart?.[String(player?.id)];
    if(typeof value==='number'&&Number.isFinite(value))return LieHcpRules.normalizeHcp(value);
    if(typeof card?.hcpStart==='number'&&Number.isFinite(card.hcpStart))return LieHcpRules.normalizeHcp(card.hcpStart);
    return null;
};
app.logic.calculateRoundForPlayer = function(round,playerId,start,cards)
{
    const holes=app.logic.getRoundHoles(round),rows=round.hcpCourseTable || (app.state.handicaps || []).filter(h=>String(h.kursId)===String(round.kursId));
    const snap=LieHcpRules.snapshot(round,holes,start,rows);
    const given=round.hcpStart?.[String(playerId)]===snap.startHcp&&round.holeAllowances?.[String(playerId)]?round.holeAllowances[String(playerId)]:snap.holeAllowances;
    const raw=(cards || app.state.scoreCards || []).filter(c=>String(c.spieltagId)===String(round.id)&&String(c.spielerId)===String(playerId));
    return {...LieHcpRules.evaluate(round,holes,start,raw,given),scoreUpdates:[]};
};

app.logic.recalculateSeasonFromStart = async function()
{
    throw new Error('Historische Neuberechnung ist bis zur sicheren S07-Integration gesperrt.');
    const user = app.state.currentUser;
    if (!user || user.role !== 'Admin')
    {
        throw new Error('Nur Administratoren dürfen die Saison neu berechnen.');
    }

    const seasonStart = String(app.state.saisonStartDatum || '');
    if (!seasonStart) throw new Error('Kein Saisonstart festgelegt.');

    const rounds = (app.state.spieltage || []).filter(function(st)
    {
        return !st.istGeloescht
            && String(st.status) === 'Beendet'
            && String(st.date || '') >= seasonStart;
    }).sort(function(a, b)
    {
        const dateCmp = String(a.date || '').localeCompare(String(b.date || ''));
        return dateCmp !== 0 ? dateCmp : String(a.id).localeCompare(String(b.id));
    });

    if (rounds.length === 0) throw new Error('Keine beendeten Spieltage in der aktuellen Saison gefunden.');

    // Saisonstart-Regel der App: alle Spieler starten mit 26.
    const currentHcp = {};
    (app.state.spieler || []).forEach(function(sp) { currentHcp[String(sp.id)] = 26; });

    const dbBatchLimit = 400;
    let batch = app.db.batch();
    let batchOps = 0;
    const commitIfNeeded = async function(force)
    {
        if (batchOps >= dbBatchLimit || (force && batchOps > 0))
        {
            await batch.commit();
            batch = app.db.batch();
            batchOps = 0;
        }
    };

    for (const round of rounds)
    {
        const participantIds = app.logic.getRoundParticipantIds(round);
        const hcpStart = {};
        const hcpEnd = {};
        const results = [];
        const overrides = round.hcpStartOverrides || {};

        for (const playerId of participantIds)
        {
            let startHcp = Number.isFinite(parseFloat(overrides[playerId]))
                ? parseInt(overrides[playerId])
                : currentHcp[playerId];

            if (!Number.isFinite(startHcp)) startHcp = 26;

            hcpStart[playerId] = startHcp;
            const result = app.logic.calculateRoundForPlayer(round, playerId, startHcp, app.state.scoreCards);
            hcpEnd[playerId] = result.endHcp;
            currentHcp[playerId] = result.endHcp;
            results.push({ playerId: playerId, result: result });

            for (const upd of result.scoreUpdates)
            {
                const ref = app.db.collection('scorecards').doc(String(upd.scorecard.id));
                batch.set(ref, { hcpStart: upd.hcpStart, strokesGiven: upd.strokesGiven }, { merge: true });
                upd.scorecard.hcpStart = upd.hcpStart;
                upd.scorecard.strokesGiven = upd.strokesGiven;
                batchOps++;
                await commitIfNeeded(false);
            }
        }

        const completeResults = results.filter(function(x) { return x.result.complete; });
        let bruttoSieger = '';
        let nettoSieger = '';
        if (completeResults.length > 0)
        {
            const brutto = completeResults.slice().sort(function(a, b) { return a.result.totalStrokes - b.result.totalStrokes; })[0];
            const netto = completeResults.slice().sort(function(a, b) { return b.result.totalNetto - a.result.totalNetto; })[0];
            const bSp = (app.state.spieler || []).find(function(s) { return String(s.id) === String(brutto.playerId); });
            const nSp = (app.state.spieler || []).find(function(s) { return String(s.id) === String(netto.playerId); });
            bruttoSieger = bSp ? (bSp.nickname || bSp.name) : '';
            nettoSieger = nSp ? (nSp.nickname || nSp.name) : '';
        }

        const roundRef = app.db.collection('spieltage').doc(String(round.id));
        batch.set(roundRef, {
            hcpStart: hcpStart,
            hcpEnd: hcpEnd,
            bruttoSieger: bruttoSieger,
            nettoSieger: nettoSieger,
            recalculatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        batchOps++;

        round.hcpStart = hcpStart;
        round.hcpEnd = hcpEnd;
        round.bruttoSieger = bruttoSieger;
        round.nettoSieger = nettoSieger;
        await commitIfNeeded(false);
    }

    // Der Endstand der Kette ist das aktuelle LIE-HCP.
    for (const sp of (app.state.spieler || []))
    {
        const playerId = String(sp.id);
        if (!Number.isFinite(currentHcp[playerId])) continue;

        const privateRef = app.db.collection('spieler').doc(playerId);
        const publicRef = app.db.collection('spieler_public').doc(playerId);
        batch.set(privateRef, { hcpLIE: currentHcp[playerId] }, { merge: true });
        batch.set(publicRef, { hcpLIE: currentHcp[playerId] }, { merge: true });
        batchOps += 2;
        sp.hcpLIE = currentHcp[playerId];
        await commitIfNeeded(false);
    }

    await commitIfNeeded(true);
    return { rounds: rounds.length, finalHcp: currentHcp };
};
