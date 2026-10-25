'use strict';

// Dependency-free runner: real IndexedDB in installed headless Chrome/Edge,
// fake transport only, isolated temporary browser profile, loopback HTTP only.
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { memoryDatabase, fieldValue } = require('../functions/test/memory-score-database');
const { createScoreOperationsV2, readDocumentState } = require('../functions/score-operations-v2');

async function main()
{
    const candidates = [
        path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Google/Chrome/Application/chrome.exe'),
        path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Microsoft/Edge/Application/msedge.exe')
    ];
    let executable;
    for (const candidate of candidates)
    {
        try
        {
            await fs.access(candidate);
            executable = candidate;
            break;
        }
        catch (error)
        {
            // Try the next already-installed browser; never download one.
        }
    }
    if (!executable)
    {
        throw new Error('No installed Chrome/Edge found.');
    }
    const root = path.resolve(__dirname, '..');
    const testDb = memoryDatabase();
    const writeV2 = createScoreOperationsV2(testDb, fieldValue);
    const testAuth = { uid: 'A', token: { playerId: 'A', role: 'Spieler' } };
    const allowed = new Set(['/App_Storage_ScoreSync.js', '/App_Logic_ScoreSyncV2.js',
        '/tests/score-sync-v2.html', '/tests/score-sync-v2.test.js', '/tests/score-sync-storage.html']);
    const server = http.createServer(async function(request, response)
    {
        const url = new URL(request.url, 'http://127.0.0.1');
        // These endpoints exist only in this disposable local test process.
        // They invoke the actual server core with an injected in-memory DB.
        if (request.method === 'POST' && url.pathname.startsWith('/test-api/'))
        {
            try
            {
                let body = '';
                for await (const chunk of request)
                {
                    body += chunk;
                    if (body.length > 1048576)
                    {
                        throw new Error('Test payload too large');
                    }
                }
                const data = JSON.parse(body || '{}');
                let result;
                if (url.pathname === '/test-api/seed')
                {
                    const suffix = randomUUID();
                    const c = { ownerUid: 'A', playerId: 'A', spieltagId: 'I-' + suffix,
                        flightId: 'F-' + suffix, spielerId: 'A', hole: 1, mode: 'ownFlight' };
                    c.documentId = 'SC-' + c.spieltagId + '-A-1';
                    await testDb.collection('spieler').doc('A').set({ role: 'Spieler' });
                    await testDb.collection('spieltage').doc(c.spieltagId).set({ status: 'Aktiv', rundenTyp: '18', bahnAnzahl: 18 });
                    await testDb.collection('flights').doc(c.flightId).set({ spieltagId: c.spieltagId, spielerIdsCsv: 'A' });
                    await testDb.collection('scorecards').doc(c.documentId).set({ id: c.documentId,
                        spieltagId: c.spieltagId, spielerId: 'A', hole: 1, strokes: 4, puts: 2,
                        lady: true, maxscore: false, hcpStart: 20, strokesGiven: 1 });
                    result = { context: c };
                }
                else if (url.pathname === '/test-api/call')
                {
                    result = await writeV2(testAuth, data);
                }
                else if (url.pathname === '/test-api/delete')
                {
                    await testDb.collection('scorecards').doc(data.documentId).delete();
                    result = { deleted: true };
                }
                else if (url.pathname === '/test-api/recreate')
                {
                    await testDb.collection('scorecards').doc(data.documentId).set({ id: data.documentId,
                        spieltagId: data.spieltagId, spielerId: data.spielerId, hole: data.hole, strokes: 9 });
                    result = { recreated: true };
                }
                else if (url.pathname === '/test-api/read')
                {
                    const snap = await testDb.collection('scorecards').doc(data.documentId).get();
                    const state = readDocumentState(snap);
                    result = { generation: state.generation, fieldRevisions: state.revisions, values: {}, raw: snap.data() };
                    for (const field of ['strokes', 'puts', 'lady', 'maxscore'])
                    {
                        if (snap.exists && Object.hasOwn(snap.data(), field))
                        {
                            result.values[field] = snap.data()[field];
                        }
                    }
                }
                else
                {
                    throw new Error('Unknown local test endpoint');
                }
                response.setHeader('Content-Type', 'application/json');
                response.end(JSON.stringify(result));
            }
            catch (error)
            {
                response.writeHead(400, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: error.message }));
            }
            return;
        }
        if (!allowed.has(url.pathname))
        {
            response.writeHead(404).end();
            return;
        }
        try
        {
            const content = await fs.readFile(path.join(root, url.pathname));
            response.setHeader('Content-Type', url.pathname.endsWith('.js') ? 'text/javascript' : 'text/html; charset=utf-8');
            response.end(content);
        }
        catch (error)
        {
            response.writeHead(500).end(error.message);
        }
    });
    await new Promise(function(resolve) { server.listen(0, '127.0.0.1', resolve); });
    const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'lie-score-sync-browser-'));
    let browser;
    let socket;
    let stderr = '';
    try
    {
        browser = spawn(executable, ['--headless=new', '--disable-gpu', '--no-first-run',
            '--no-default-browser-check', '--disable-extensions', '--disable-background-networking',
            '--disable-component-update', '--disable-sync', '--remote-debugging-address=127.0.0.1',
            '--remote-debugging-port=0', '--user-data-dir=' + profile,
            '--no-proxy-server',
            '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1', 'about:blank'],
            { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
        browser.stderr.on('data', function(chunk) { stderr = (stderr + chunk).slice(-4000); });
        const activePort = path.join(profile, 'DevToolsActivePort');
        let lines;
        for (let attempt = 0; attempt < 150; attempt++)
        {
            try
            {
                lines = (await fs.readFile(activePort, 'utf8')).trim().split(/\r?\n/);
                break;
            }
            catch (error)
            {
                await new Promise(function(resolve) { setTimeout(resolve, 100); });
            }
        }
        if (!lines)
        {
            throw new Error('Browser debugging startup timed out: ' + stderr);
        }
        socket = new WebSocket('ws://127.0.0.1:' + lines[0] + lines[1]);
        await new Promise(function(resolve, reject)
        {
            socket.addEventListener('open', resolve, { once: true });
            socket.addEventListener('error', reject, { once: true });
        });
        let nextId = 0;
        const pending = new Map();
        const loadWaiters = [];
        socket.addEventListener('message', function(event)
        {
            const message = JSON.parse(event.data);
            if (message.id && pending.has(message.id))
            {
                const item = pending.get(message.id);
                pending.delete(message.id);
                clearTimeout(item.timeout);
                if (message.error)
                {
                    item.reject(new Error(JSON.stringify(message.error)));
                }
                else
                {
                    item.resolve(message.result);
                }
            }
            if (message.method === 'Page.loadEventFired')
            {
                loadWaiters.splice(0).forEach(function(resolve) { resolve(); });
            }
        });
        function command(method, params, sessionId)
        {
            return new Promise(function(resolve, reject)
            {
                const id = ++nextId;
                const timeout = setTimeout(function()
                {
                    pending.delete(id);
                    reject(new Error('CDP timeout: ' + method));
                }, 30000);
                pending.set(id, { resolve: resolve, reject: reject, timeout: timeout });
                socket.send(JSON.stringify({ id: id, method: method, params: params, sessionId: sessionId }));
            });
        }
        const target = await command('Target.createTarget', { url: 'about:blank' });
        const attached = await command('Target.attachToTarget', { targetId: target.targetId, flatten: true });
        const session = attached.sessionId;
        await command('Page.enable', {}, session);
        async function navigate(url)
        {
            let timeout;
            const loaded = new Promise(function(resolve, reject)
            {
                loadWaiters.push(resolve);
                timeout = setTimeout(function() { reject(new Error('Page load timeout')); }, 15000);
            });
            await command('Page.navigate', { url: url }, session);
            try
            {
                await loaded;
            }
            finally
            {
                clearTimeout(timeout);
            }
        }
        const base = 'http://127.0.0.1:' + server.address().port;
        await navigate(base + '/tests/score-sync-v2.html');
        const result = await command('Runtime.evaluate',
            { expression: 'window.scoreSyncV2Tests', awaitPromise: true, returnByValue: true }, session);
        if (result.exceptionDetails || !result.result.value)
        {
            const diagnostic = await command('Runtime.evaluate',
            {
                expression: 'JSON.stringify({url:location.href,ready:document.readyState,body:document.body && document.body.innerText,scripts:Array.from(document.scripts).map(s=>s.src),app:typeof app})',
                returnByValue: true
            }, session);
            throw new Error('Browser test evaluation failed: ' + JSON.stringify(result) + '\n' + JSON.stringify(diagnostic));
        }
        const summary = result.result.value;
        console.log(JSON.stringify(summary, null, 2));
        if (summary.failed)
        {
            process.exitCode = 1;
        }
        await navigate(base + '/tests/score-sync-storage.html');
        const regression = await command('Runtime.evaluate',
        {
            expression: '(async function() { await document.getElementById("run").onclick(); return document.getElementById("result").textContent; })()',
            awaitPromise: true, returnByValue: true
        }, session);
        const report = regression.result.value;
        console.log(report);
        if (regression.exceptionDetails || !report || report.includes('FAIL:') || !report.includes('Alle Tests bestanden'))
        {
            process.exitCode = 1;
        }
        await command('Browser.close', {});
    }
    finally
    {
        if (socket)
        {
            socket.close();
        }
        if (browser && browser.exitCode === null)
        {
            browser.kill();
        }
        await new Promise(function(resolve) { server.close(resolve); });
        // Browser profile is disposable test data, outside the repository.
        if (path.resolve(profile).startsWith(path.resolve(os.tmpdir()) + path.sep)
            && path.basename(profile).startsWith('lie-score-sync-browser-'))
        {
            await fs.rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
        }
    }
}

main().catch(function(error)
{
    console.error(error);
    process.exitCode = 1;
});
