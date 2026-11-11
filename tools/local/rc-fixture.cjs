'use strict';

// Local synthetic starting point, not an importer or a production initializer.
function fixture() {
    const players = Array.from({length: 12}, (_, i) => {
        const id = 'MS' + String(i + 1).padStart(2, '0');
        return {id, name: 'Synthetic ' + id, nickname: id, hcpLIE: 26,
            role: i === 0 ? 'Admin' : i === 4 ? 'Spielleiter' : 'Spieler'};
    });
    const round = {id: 'RC-ROUND', date: '2026-11-11', kursId: 'RC-COURSE',
        rundenTyp: '9-Front', bahnAnzahl: 9, status: 'Aktiv', teilnehmerCsv: players.map(p => p.id).join(',')};
    const flights = [0, 4, 8].map((start, i) => ({id: 'FL-RC-ROUND-' + (i + 1),
        spieltagId: round.id, seq: i + 1, spielerIdsCsv: players.slice(start, start + 4).map(p => p.id).join(',')}));
    return {players, round, flights, writers: ['MS01', 'MS05', 'MS09']};
}

async function seed(db) {
    const guard = require('../../functions/local-guard');
    guard.validate(process.env);
    if (db.projectId !== guard.PROJECT) throw new Error('Only the local demo database is allowed.');
    if ((await db.listCollections()).length) throw new Error('RC requires an empty local emulator; no existing data will be replaced.');
    const data = fixture(), crypto = require('node:crypto');
    const salt = 'synthetic-rc-only', pinHash = 'scrypt$' + salt + '$' + crypto.scryptSync('1234', salt, 32).toString('hex');
    const batch = db.batch();
    for (const player of data.players) {
        batch.set(db.collection('spieler').doc(player.id), {...player, pinHash, mustChangePin: false});
        batch.set(db.collection('spieler_public').doc(player.id), player);
    }
    batch.set(db.collection('kurse').doc('RC-COURSE'), {id: 'RC-COURSE', name: 'Synthetic RC course', bahnAnzahl: 18});
    for (let nr = 1; nr <= 18; nr++) batch.set(db.collection('bahnen').doc('RC-H' + nr),
        {id: 'RC-H' + nr, kursId: 'RC-COURSE', nr, par: 4, si: nr});
    for (let hcp = 0; hcp <= 54; hcp++) batch.set(db.collection('handicaps').doc('RC-T' + hcp),
        {kursId: 'RC-COURSE', vorgabe: hcp, spielvorgabe: hcp});
    batch.set(db.collection('config').doc('saison'), {saisonStartDatum: '2026-01-01'});
    await batch.commit();
    // Use the existing authoritative implementation, not hand-written snapshots.
    await require('../../functions/round-start').createRoundStart(db)(
        {uid: 'MS01', token: {playerId: 'MS01', role: 'Admin', mustChangePin: false}},
        {spieltagObj: data.round, flightsPayload: data.flights});
    return data;
}
module.exports = {fixture, seed};
