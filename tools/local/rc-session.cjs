'use strict';
require('./network-guard.cjs');
const {profile} = require('./profile.cjs'), {probe, createServer} = require('./server.cjs');
const guard = require('../../functions/local-guard'), admin = require('../../functions/node_modules/firebase-admin');

async function main() {
    const p = profile(); await probe(p);
    const port = Number(process.env.LIE_APP_PORT || 5501);
    if (!Number.isInteger(port) || port < 1024 || port > 65535
        || Object.values(p.emulators).some(e => e.port === port)) throw new Error('Invalid app port.');
    const instance = admin.initializeApp({...guard.validate(process.env), credential: guard.credential(admin)}, 'rc-local');
    let server;
    try {
        if ((await instance.auth().listUsers(1)).users.length) throw new Error('RC requires empty synthetic Auth.');
        const data = await require('./rc-fixture.cjs').seed(instance.firestore());
        server = createServer(p);
        await new Promise((resolve, reject) => {server.once('error', reject); server.listen(port, '127.0.0.1', resolve);});
        console.log('RC1 LOCAL http://127.0.0.1:' + port + ' | demo-lie-scorecards-local');
        console.log('12 synthetic players MS01-MS12; local fixture PIN 1234. Start as MS01 (Admin).');
        console.log('No round is pre-created. MS01: create the first Spieltag in the normal UI, then enter scores. One writer per flight.');
        console.log('Fresh browser profiles required. Synthetic session is volatile: no real scores, no production data.');
        if (process.argv.includes('--smoke')) {
            await require('../../tests/rc-smoke.cjs').run(p, port, instance.firestore(), data);
        } else {
            await new Promise(resolve => {process.once('SIGINT', resolve); process.once('SIGTERM', resolve);});
        }
    } finally {
        if (server) await new Promise(resolve => server.close(resolve));
        await instance.delete();
    }
}
main().catch(error => {console.error('RC local start failed (' + error.name + '); no cloud fallback.'); process.exitCode = 1;});
