'use strict';
require('./network-guard.cjs');
const { profile } = require('./profile.cjs');
const { createServer, probe } = require('./server.cjs');
async function main()
{
    const p = profile();
    await probe(p);
    await require('./seed.cjs').seed();
    const port = Number(process.env.LIE_APP_PORT || 5501);
    if (!Number.isInteger(port) || port < 1024 || port > 65535
        || Object.values(p.emulators).some(e => e.port === port)) throw new Error('Invalid app port.');
    const server = createServer(p);
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
    console.log('LOCAL demo-lie-scorecards-local http://127.0.0.1:' + port + ' (fresh browser profile required)');
    if (process.argv.includes('--test'))
    {
        try { await require('../../tests/local-integration.cjs').run(p, port); }
        finally { await new Promise(resolve => server.close(resolve)); }
    }
    else process.on('SIGINT', () => server.close(() => process.exit(0)));
}
main().catch(() => { console.error('Local session failed; no Cloud fallback.'); process.exitCode = 1; });
