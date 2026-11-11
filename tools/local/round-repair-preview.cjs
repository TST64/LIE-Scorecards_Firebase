'use strict';
// Pure offline diagnosis. No SDK, network, database or apply/save operation.
const H = require('../../functions/hcp-rules'), {createHash} = require('node:crypto');
const hash = value => createHash('sha256').update(JSON.stringify(value) ?? 'undefined').digest('hex');
const members = round => typeof round.teilnehmerCsv === 'string' ? round.teilnehmerCsv.split(',').map(s => s.trim()).filter(Boolean) : [];

function preview(input, roundId, target) {
    const originalHash = hash(input), data = structuredClone(input || {}), reasons = [];
    const rounds = Array.isArray(data.rounds) ? data.rounds : [], cards = Array.isArray(data.scorecards) ? data.scorecards : [];
    const result = {readOnly: true, saveImplemented: false, automaticCorrection: false, persistAllowed: false,
        sourceHash: originalHash, roundId, target, blockingReasons: reasons, rawCardCount: cards.length};
    if ([...rounds,...cards].some(r => !r || typeof r !== 'object' || Array.isArray(r))) {
        reasons.push('malformed-round-or-card-record'); result.previewComplete=false; return result;
    }
    const round = rounds.find(r => r.id === roundId);
    if (!round) { reasons.push('round-not-found'); return result; }
    if (!Array.isArray(data.scorecards)) reasons.push('scorecard-inventory-missing');
    if (new Set(rounds.map(r => r.id)).size !== rounds.length || rounds.some(r => !r.id)) reasons.push('duplicate-or-missing-round-identity');
    const ids = members(round), own = cards.filter(c => c.spieltagId === roundId);
    result.recorded = {rundenTyp: round.rundenTyp, bahnAnzahl: round.bahnAnzahl, status: round.status,
        hcpStart: round.hcpStart, hcpEnd: round.hcpEnd, nettoSieger: round.nettoSieger, bruttoSieger: round.bruttoSieger};
    result.holesByPlayer = Object.fromEntries(ids.map(id => [id, own.filter(c => c.spielerId === id).map(c => c.hole).sort((a,b) => a-b)]));
    result.displayFindings = [
        'Spieltage defaults to the current-month filter; all/month/season/my have different membership and date filters.',
        'Deleted/aborted flags, missing IDs, participant IDs and status can independently hide a round.',
        'Personal performance omits a round when positive-stroke played count is below its configured 9/18-hole requirement.',
        'A Strich with no positive strokes can also reduce that legacy performance count.',
        'Legacy leaderboard data without S06 snapshots is blocked, not automatically converted.'
    ];
    if (!['9-Front','9-Back'].includes(target)) reasons.push('explicit-front-or-back-selection-required');
    if (round.rundenTyp !== '18' || round.bahnAnzahl !== 18) reasons.push('source-is-not-consistent-numeric-18-hole-round');
    if (!ids.length || new Set(ids).size !== ids.length) reasons.push('missing-or-duplicate-participants');
    if (rounds.some(r => !members(r).length || new Set(members(r)).size !== members(r).length
        || r.teilnehmerCsv.split(',').some(p => !p || p !== p.trim()))) reasons.push('participant-encoding-needs-explicit-resolution');
    if (round.status !== 'Beendet') reasons.push('source-not-closed');
    if (round.istGeloescht || round.istGelöscht) reasons.push('deleted-source-needs-explicit-investigation');
    const first = target === '9-Back' ? 10 : 1, last = first + 8;
    const outside = own.filter(c => !Number.isSafeInteger(c.hole) || c.hole < first || c.hole > last);
    result.cardsOutsideSelectedRange = outside.map(c => ({id: c.id, playerId: c.spielerId, hole: c.hole}));
    if (outside.length) reasons.push('cards-outside-selected-range-no-automatic-remap-or-exclusion');
    const keys = own.map(c => c.spielerId + ':' + c.hole);
    if (new Set(keys).size !== keys.length || new Set(cards.map(c => c.id)).size !== cards.length || cards.some(c => !c.id)) reasons.push('duplicate-or-missing-card-identity');
    if (own.some(c => !ids.includes(c.spielerId))) reasons.push('orphan-player-card');
    if (cards.some(c => !rounds.some(r => r.id === c.spieltagId && members(r).includes(c.spielerId)))) reasons.push('orphan-round-or-player-card');
    const chainPlayers = new Set(rounds.flatMap(members));
    if ([...chainPlayers].some(id => !Object.hasOwn(data.initialHcp || {}, id))) reasons.push('verified-initial-hcp-missing');
    if (rounds.some(r => !Array.isArray(r.hcpHoleData) || !Array.isArray(r.hcpCourseTable))) reasons.push('historical-hole-or-course-table-evidence-missing');
    if (rounds.some(r => Object.keys(r.hcpStartOverrides || {}).length)) reasons.push('historical-overrides-require-explicit-resolution');
    if (rounds.some(r => typeof r.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(r.date)
        || !Number.isFinite(Date.parse(r.date)) || new Date(r.date).toISOString().slice(0,10) !== r.date)) reasons.push('round-date-missing-or-invalid');
    if (rounds.some(r => r.status !== 'Beendet')) reasons.push('unclosed-round-in-affected-chain');
    for (const a of rounds) for (const b of rounds) if (a.id !== b.id && a.date === b.date && members(a).some(id => members(b).includes(id))) {
        if (!reasons.includes('ambiguous-round-order')) reasons.push('ambiguous-round-order');
    }
    const proposed = rounds.map(r => r.id === roundId ? {...r, rundenTyp: target, bahnAnzahl: 9} : r);
    result.proposedRoundMetadata = {rundenTyp: target, bahnAnzahl: 9};
    if (!reasons.length) {
        try {
            const before = H.plan(rounds, cards, data.initialHcp, r => r.hcpHoleData, r => r.hcpCourseTable);
            const after = H.plan(proposed, cards, data.initialHcp, r => r.hcpHoleData, r => r.hcpCourseTable);
            result.impact = after.entries.map(e => {
                const source = rounds.find(r => r.id === e.roundId), prior = before.entries.find(x => x.roundId === e.roundId && x.playerId === e.playerId);
                return {roundId: e.roundId, playerId: e.playerId, date: source.date,
                    recordedStartHcp: source.hcpStart?.[e.playerId] ?? null, recordedEndHcp: source.hcpEnd?.[e.playerId] ?? null,
                    recomputedBeforeComplete: prior?.complete === true, proposedComplete: e.complete === true,
                    proposedStartHcp: e.startHcp ?? null, proposedEndHcp: e.endHcp ?? null,
                    proposedNetto: e.totalNetto ?? null, proposedStrokes: e.totalStrokes ?? null, errors: e.errors || []};
            });
            result.results = proposed.filter(r => r.date >= round.date).map(r => {
                const rows = result.impact.filter(e => e.roundId === r.id);
                const complete = rows.length === members(r).length && rows.every(e => e.proposedComplete);
                const best = complete ? Math.max(...rows.map(e => e.proposedNetto)) : null;
                return {roundId: r.id, recordedNettoWinner: r.nettoSieger ?? null,
                    proposedNettoWinners: complete ? rows.filter(e => e.proposedNetto === best).map(e => e.playerId) : [],
                    bruttoOrPuttingRankingApproved: false, complete};
            });
            if (after.entries.some(e => !e.complete)) reasons.push('incomplete-or-contradictory-score-chain');
            result.proposedFinalHcp = after.currentHcp;
        } catch (error) { reasons.push('invalid-calculation-basis: ' + error.message); }
    }
    result.previewComplete = reasons.length === 0;
    result.rawValuesUnchanged = hash(input) === originalHash && hash(data.scorecards) === hash(input.scorecards);
    result.requiredBeforeAnySave = ['Explicit administrator choice and approval of this exact source hash',
        'Verified historical basis, full original archive, no pending writers or active follow-up round',
        'Versioned round-type repair with CAS, resumable staging and one atomic publication; not implemented here'];
    return result;
}

function syntheticExample() {
    const players = ['SYN01', 'SYN02'], holes = Array.from({length:18}, (_,i) => ({nr:i+1, par:4, si:i+1}));
    const rounds = [1,2,3].map((n,i) => ({id:'SYN-R'+n, date:'2026-02-'+String(n).padStart(2,'0'),
        status:'Beendet', kursId:'SYN-K', rundenTyp:i ? '9-Front':'18', bahnAnzahl:i ? 9:18,
        teilnehmerCsv:players.join(','), hcpHoleData:holes, hcpCourseTable:[],
        hcpStart:{SYN01:26+i/10,SYN02:26+i/10}, hcpEnd:{SYN01:26+(i+1)/10,SYN02:26+(i+1)/10}, nettoSieger:'SYN01'}));
    const scorecards = rounds.flatMap(r => players.flatMap(p => Array.from({length:9}, (_,i) => ({
        id:'SC-'+r.id+'-'+p+'-'+(i+1), spieltagId:r.id, spielerId:p, hole:i+1, strokes:5, puts:2,
        lady:false, maxscore:false, historicalExtra:'preserve'}))));
    return {synthetic:true, rounds, scorecards, initialHcp:{SYN01:26,SYN02:26}};
}
module.exports = {preview, syntheticExample};
if (require.main === module) {
    if (process.argv.length !== 2) throw new Error('Only the bundled synthetic example is supported; no production file input.');
    const fs = require('node:fs'), input = syntheticExample();
    fs.mkdirSync('.local-runtime', {recursive:true});
    const output = {scope:'bundled synthetic example only; no Firebase access',
        front:preview(input,'SYN-R1','9-Front'), back:preview(input,'SYN-R1','9-Back')};
    fs.writeFileSync('.local-runtime/round-repair-preview.json',JSON.stringify(output,null,2));
    console.log('Read-only synthetic preview: .local-runtime/round-repair-preview.json; no save operation.');
}
