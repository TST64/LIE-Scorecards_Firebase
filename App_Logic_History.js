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

app.logic.getRoundHoles = function(spieltag)
{
    if (!spieltag) return [];

    let holes = (app.state.bahnen || []).filter(function(b)
    {
        return String(b.kursId).trim() === String(spieltag.kursId).trim();
    });

    if (spieltag.rundenTyp === '9-Front')
    {
        holes = holes.filter(function(b) { return parseInt(b.nr) <= 9; });
    }
    else if (spieltag.rundenTyp === '9-Back')
    {
        holes = holes.filter(function(b) { return parseInt(b.nr) >= 10; });
    }

    return holes.sort(function(a, b) { return parseInt(a.nr) - parseInt(b.nr); });
};

app.logic.calculateHoleVorgabeForHcp = function(hcpValue, spieltag, holeNr)
{
    return app.logic.calculateHoleVorgabe({ hcpLIE: hcpValue }, spieltag, holeNr);
};

app.logic.getHistoricalHcp = function(spieler, spieltag, scorecard)
{
    if (scorecard && Number.isFinite(parseFloat(scorecard.hcpStart)))
    {
        return parseFloat(scorecard.hcpStart);
    }

    if (spieltag && spieltag.hcpStart && Number.isFinite(parseFloat(spieltag.hcpStart[String(spieler.id)])))
    {
        return parseFloat(spieltag.hcpStart[String(spieler.id)]);
    }

    return parseFloat(spieler && spieler.hcpLIE);
};

app.logic.calculateRoundForPlayer = function(spieltag, spielerId, startHcp, scorecards)
{
    const holes = app.logic.getRoundHoles(spieltag);
    const playerScores = (scorecards || app.state.scoreCards || []).filter(function(sc)
    {
        return String(sc.spieltagId).trim() === String(spieltag.id).trim()
            && String(sc.spielerId).trim() === String(spielerId).trim();
    });

    let totalNetto = 0;
    let totalStrokes = 0;
    let playedHoles = 0;
    const scoreUpdates = [];

    holes.forEach(function(hole)
    {
        const holeNr = parseInt(hole.nr);
        const sc = playerScores.find(function(item) { return parseInt(item.hole) === holeNr; });
        if (!sc || parseInt(sc.strokes) <= 0) return;

        const strokesGiven = app.logic.calculateHoleVorgabeForHcp(startHcp, spieltag, holeNr);
        const netto = app.logic.calculateNettoStableford(parseInt(sc.strokes), parseInt(hole.par), strokesGiven);

        playedHoles++;
        totalStrokes += parseInt(sc.strokes);
        totalNetto += netto;
        scoreUpdates.push({ scorecard: sc, strokesGiven: strokesGiven, hcpStart: startHcp });
    });

    const is9 = (spieltag.bahnAnzahl === 9 || String(spieltag.rundenTyp || '').startsWith('9'));
    const requiredHoles = is9 ? 9 : (parseInt(spieltag.bahnAnzahl) || 18);
    const stablefordSoll = is9 ? 18 : 36;
    let endHcp = parseInt(startHcp);

    if (playedHoles >= requiredHoles)
    {
        if (totalNetto > stablefordSoll)
        {
            endHcp = Math.max(0, Math.round(parseInt(startHcp) - ((totalNetto - stablefordSoll) * 0.5)));
        }
        else if (totalNetto < stablefordSoll)
        {
            endHcp = Math.min(54, Math.round(parseInt(startHcp) + ((stablefordSoll - totalNetto) * 0.1)));
        }
    }

    return {
        startHcp: parseInt(startHcp),
        endHcp: endHcp,
        totalNetto: totalNetto,
        totalStrokes: totalStrokes,
        playedHoles: playedHoles,
        requiredHoles: requiredHoles,
        complete: playedHoles >= requiredHoles,
        scoreUpdates: scoreUpdates
    };
};

app.logic.recalculateSeasonFromStart = async function()
{
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
