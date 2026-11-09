'use strict';
async function seed()
{
    const guard = require('../../functions/local-guard');
    const env = { ...process.env, FUNCTIONS_EMULATOR: 'true' };
    const options = guard.validate(env);
    const admin = require('../../functions/node_modules/firebase-admin');
    const instance = admin.initializeApp({ ...options, credential: guard.credential(admin) }, 'local-seed');
    try
    {
        const db = instance.firestore();
        const crypto = require('node:crypto');
        const salt = 'synthetic-local-fixture-salt';
        // Fixture PIN is intentionally public, synthetic and local-only: 1234.
        const pinHash = 'scrypt$' + salt + '$' + crypto.scryptSync('1234', salt, 32).toString('hex');
        const batch = db.batch();
        for (const [id, role] of [['local-player-a', 'Spieler'], ['local-player-b', 'Spieler'], ['local-admin', 'Admin'], ['local-manager', 'Spielleiter']])
        {
            const data = { id, name: 'Synthetic ' + id, nickname: id, role, hcpLIE: 26, email: id + '@example.invalid' };
            batch.set(db.collection('spieler').doc(id), { ...data, pinHash, mustChangePin: false });
            batch.set(db.collection('spieler_public').doc(id), data);
        }
        batch.set(db.collection('spieltage').doc('local-round'), { id: 'local-round', date: '2026-01-01', status: 'Aktiv',
            kursId: 'local-course', rundenTyp: '9-Front', bahnAnzahl: 9, teilnehmerCsv: 'local-player-a,local-player-b',
            hcpStart: { 'local-player-a': 26, 'local-player-b': 26 },
            holeAllowances: Object.fromEntries(['local-player-a','local-player-b'].map(id=>[id,Object.fromEntries(Array.from({length:9},(_,i)=>[i+1,2]))])) });
        batch.set(db.collection('flights').doc('local-flight'), { id: 'local-flight', spieltagId: 'local-round', seq: 1,
            spielerIdsCsv: 'local-player-a,local-player-b' });
        batch.set(db.collection('kurse').doc('local-course'), { id: 'local-course', name: 'Synthetic course' });
        for (let hole = 1; hole <= 9; hole++)
        {
            batch.set(db.collection('bahnen').doc('local-hole-' + hole), { id: 'local-hole-' + hole, kursId: 'local-course', nr: hole, par: 4, si: hole });
            batch.set(db.collection('scorecards').doc('SC-local-round-local-player-a-' + hole), {
                id: 'SC-local-round-local-player-a-' + hole, spieltagId: 'local-round', spielerId: 'local-player-a', hole,
                strokes: 5, puts: 2, hcpStart: 26, strokesGiven: 2 });
        }
        batch.set(db.collection('config').doc('saison'), { saisonStartDatum: '2026-01-01' });
        batch.set(db.collection('spieltage').doc('local-closed'), { id: 'local-closed', status: 'Beendet' });
        batch.set(db.collection('scorecards').doc('local-closed-score'), { spieltagId: 'local-closed', spielerId: 'local-player-a', hole: 1, strokes: 5 });
        await batch.commit();
    }
    finally { await instance.delete(); }
}
module.exports = { seed };
