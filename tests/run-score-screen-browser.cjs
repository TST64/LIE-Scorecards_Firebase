'use strict';

// Offline DOM smoke test in an already installed browser; no Firebase SDK loaded.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lie-score-screen-'));
async function main()
{
let browser;
let socket;
try
{
    const repo = path.join(__dirname, '..');
    const css = fs.readFileSync(path.join(repo, 'Style.css'), 'utf8').replace(/@import[^;]+;/g, '');
    const sources = ['App_Storage_ScoreSync.js', 'App_Storage_ScoreEntryContext.js', 'App_Logic_ScoreEntryV2.js',
        'Views_ScoreEingabe.js', 'App_Router.js', 'tests/score-entry-fixture.cjs', 'tests/score-screen-browser.test.js'].map(function(file)
    {
        return fs.readFileSync(path.join(repo, file), 'utf8');
    }).join('\n');
    const html = '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
        + '<style>' + css + '.hidden{display:none}body{margin:0}header{height:56px;position:sticky;top:0;z-index:40}</style>'
        + '<header>LIE · Offline-Test</header><main id="app-container"></main><script>'
        + 'var app={views:{},logic:{},state:{}};' + sources + '</script>';
    const file = path.join(root, 'test.html');
    fs.writeFileSync(file, html);
    const executable = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync);
    if (!executable)
    {
        throw new Error('No installed Chrome/Edge found.');
    }
    browser = spawn(executable, ['--headless=new', '--disable-gpu', '--no-first-run', '--disable-background-networking',
        '--remote-debugging-port=0', '--user-data-dir=' + path.join(root, 'profile'), '--no-proxy-server',
        '--host-resolver-rules=MAP * ~NOTFOUND', 'about:blank'], { windowsHide: true, stdio: 'ignore' });
    const portFile = path.join(root, 'profile', 'DevToolsActivePort');
    for (let attempt = 0; !fs.existsSync(portFile) && attempt < 100; attempt++)
    {
        await new Promise(function(resolve)
        {
            setTimeout(resolve, 100);
        });
    }
    const lines = fs.readFileSync(portFile, 'utf8').trim().split(/\r?\n/);
    socket = new WebSocket('ws://127.0.0.1:' + lines[0] + lines[1]);
    await new Promise(function(resolve, reject)
    {
        socket.addEventListener('open', resolve, { once: true });
        socket.addEventListener('error', reject, { once: true });
    });
    let nextId = 0;
    const pending = new Map();
    socket.addEventListener('message', function(event)
    {
        const message = JSON.parse(event.data);
        const item = pending.get(message.id);
        if (item)
        {
            pending.delete(message.id);
            clearTimeout(item.timer);
            if (message.error)
            {
                item.reject(new Error(JSON.stringify(message.error)));
            }
            else
            {
                item.resolve(message.result);
            }
        }
    });
    function command(method, params, sessionId)
    {
        return new Promise(function(resolve, reject)
        {
            const id = ++nextId;
            const timer = setTimeout(function()
            {
                reject(new Error('CDP timeout: ' + method));
            }, 15000);
            pending.set(id, { resolve: resolve, reject: reject, timer: timer });
            socket.send(JSON.stringify({ id: id, method: method, params: params || {}, sessionId: sessionId }));
        });
    }
    const target = await command('Target.createTarget', { url: 'about:blank' });
    const attached = await command('Target.attachToTarget', { targetId: target.targetId, flatten: true });
    const session = attached.sessionId;
    for (const width of [320, 390, 1024])
    {
        await command('Emulation.setDeviceMetricsOverride', { width: width, height: 844, deviceScaleFactor: 1, mobile: true }, session);
        const url = new URL('file:///' + file.replaceAll('\\', '/')).href;
        for (const stage of ['reload', 'done'])
        {
            await command('Page.navigate', { url: url }, session);
            let result;
            for (let attempt = 0; attempt < 50; attempt++)
            {
                result = await command('Runtime.evaluate', { expression: 'window.scoreScreenTests',
                    awaitPromise: true, returnByValue: true }, session);
                if (result.exceptionDetails || result.result.value)
                {
                    break;
                }
                await new Promise(function(resolve)
                {
                    setTimeout(resolve, 100);
                });
            }
            if (result.exceptionDetails || result.result.value?.stage !== stage)
            {
                throw new Error(width + ': ' + JSON.stringify(result));
            }
            console.log(width + ': ' + JSON.stringify(result.result.value));
        }
        if (width === 390)
        {
            const capture = await command('Page.captureScreenshot', { format: 'png' }, session);
            const screenshot = path.join(os.tmpdir(), 'lie-score-screen-visual-390.png');
            fs.writeFileSync(screenshot, Buffer.from(capture.data, 'base64'));
            console.log('Screenshot: ' + screenshot);
        }
    }
    await command('Browser.close');
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
    if (path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(root).startsWith('lie-score-screen-'))
    {
        fs.rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    }
}

}
main().catch(function(error)
{
    console.error(error);
    process.exitCode = 1;
});
