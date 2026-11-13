'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const {launch} = require('./s08-2-devices.cjs'), U = require('./s08-2-ui.cjs');
const {createViaUi} = require('./rc-round-start-ui.cjs');

async function run(profile, port, db, data) {
    const root = fs.mkdtempSync(path.resolve('.local-runtime/rc-smoke-')), devices = [];
    try {
        for (let i = 0; i < 3; i++) devices.push(await launch(profile, port, path.join(root, 'p' + i)));
        await U.login(devices[0].client, 'MS01', '1234');
        const created = await createViaUi(devices[0].client, data);
        assert.equal(created.errorCode, undefined); assert.equal(created.result.success, true);
        const roundId = created.result.spieltag.id;
        const flights = (await db.collection('flights').where('spieltagId', '==', roundId).get()).docs
            .map(d => d.data().spielerIdsCsv.split(','));
        assert.equal(flights.length, 3);
        const ownFlight = flights.findIndex(members => members.includes('MS01'));
        assert.ok(ownFlight >= 0); [flights[0], flights[ownFlight]] = [flights[ownFlight], flights[0]];
        await Promise.all(devices.map(async (device, i) => {
            const c = device.client, owner = i === 0 ? 'MS01' : flights[i][0];
            if (i > 0) await U.login(c, owner, '1234');
            await U.open(c, roundId, 1, owner);
            for (const playerId of flights[i]) {
                await U.stroke(c, playerId, 1, 5);
                const card = (await db.collection('scorecards').doc('SC-' + roundId + '-' + playerId + '-1').get()).data();
                assert.equal(card.strokes, 5); assert.match(card._sync.generation, /^gen:/);
            }
        }));
        const round = (await db.collection('spieltage').doc(roundId).get()).data();
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
