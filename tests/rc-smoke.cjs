'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const {launch} = require('./s08-2-devices.cjs'), U = require('./s08-2-ui.cjs');

async function run(profile, port, db, data) {
    const root = fs.mkdtempSync(path.resolve('.local-runtime/rc-smoke-')), devices = [];
    try {
        for (let i = 0; i < 3; i++) devices.push(await launch(profile, port, path.join(root, 'p' + i)));
        await Promise.all(devices.map(async (device, i) => {
            const c = device.client, owner = data.writers[i];
            await U.login(c, owner, '1234'); await U.open(c, data.round.id, 1, owner);
            for (const player of data.players.slice(i * 4, i * 4 + 4)) {
                await U.stroke(c, player.id, 1, 5);
                const card = (await db.collection('scorecards').doc('SC-RC-ROUND-' + player.id + '-1').get()).data();
                assert.equal(card.strokes, 5); assert.match(card._sync.generation, /^gen:/);
            }
        }));
        const round = (await db.collection('spieltage').doc(data.round.id).get()).data();
        assert.equal(round.hcpSnapshotVersion, 1); assert.equal(Object.keys(round.hcpStart).length, 12);
        assert.equal((await db.collection('scorecards').get()).size, 12);
        const closed = await Promise.all(devices.map(d => d.stop()));
        assert.ok(closed.every(p => p.forbiddenOrigins === 0));
        fs.writeFileSync('.local-runtime/rc-smoke-proof.json', JSON.stringify({basis: '3d55211',
            project: profile.projectId, players: 12, writers: 3, flights: 3, confirmedCards: 12,
            authoritativeRoundStart: true, forbiddenOrigins: 0, productionReady: false}, null, 2));
        console.log('PASS RC focused startup: 12 players, 3 UI writers, 12 confirmed V2 cards. No production approval.');
    } finally {await Promise.allSettled(devices.map(d => d.stop()));}
}
module.exports = {run};
