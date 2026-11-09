'use strict';
// Real app entry + real Compat SDK + synthetic demo emulators only.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
async function run(profile, port)
{
    const executable = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
        'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync);
    if (!executable) throw new Error('Installed Chrome or Edge required.');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lie-isolation-browser-'));
    const browser = spawn(executable, ['--headless=new', '--disable-gpu', '--no-first-run', '--disable-background-networking',
        '--remote-debugging-port=0', '--user-data-dir=' + dir, '--no-proxy-server',
        '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1', 'about:blank'],
        { windowsHide: true, stdio: 'ignore', env: { ...process.env,
            USERPROFILE: process.env.LIE_BROWSER_USERPROFILE,
            APPDATA: process.env.LIE_BROWSER_APPDATA, HOME: process.env.LIE_BROWSER_HOME } });
    let socket;
    let stage = 'browser startup';
    const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
    try
    {
        const portFile = path.join(dir, 'DevToolsActivePort');
        for (let i = 0; !fs.existsSync(portFile) && i < 100; i++) await sleep(100);
        const [debugPort, endpoint] = fs.readFileSync(portFile, 'utf8').trim().split(/\r?\n/);
        socket = new WebSocket('ws://127.0.0.1:' + debugPort + endpoint);
        await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
        let nextId = 0;
        const pending = new Map(), requests = [], forbidden = [], blocked = [];
        const allowed = new Set([port, ...Object.values(profile.emulators).map(x => x.port)]);
        socket.addEventListener('message', event =>
        {
            const m = JSON.parse(event.data);
            if (m.method === 'Network.requestWillBeSent')
            {
                const url = new URL(m.params.request.url);
                if (url.protocol === 'http:' || url.protocol === 'https:')
                {
                    requests.push({ host: url.hostname, port: Number(url.port || 80) });
                    if (url.hostname !== '127.0.0.1' || !allowed.has(Number(url.port))) forbidden.push(url.origin);
                }
            }
            if (m.method === 'Network.loadingFailed' && m.params.blockedReason) blocked.push(m.params.blockedReason);
            const item = pending.get(m.id);
            if (item) { pending.delete(m.id); clearTimeout(item.timer); m.error ? item.reject(new Error(m.error.message)) : item.resolve(m.result); }
        });
        function command(method, params = {}, sessionId)
        {
            return new Promise((resolve, reject) =>
            {
                const id = ++nextId;
                const timer = setTimeout(() => { pending.delete(id); reject(new Error('CDP timeout: ' + method)); }, 30000);
                pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params, sessionId }));
            });
        }
        const target = await command('Target.createTarget', { url: 'about:blank' });
        const { sessionId } = await command('Target.attachToTarget', { targetId: target.targetId, flatten: true });
        await command('Network.enable', {}, sessionId);
        async function evaluate(expression)
        {
            const r = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
            if (r.exceptionDetails) throw new Error('Browser assertion failed: ' + r.exceptionDetails.text + ' ' + (r.result.description || ''));
            return r.result.value;
        }
        async function waitFor(expression)
        {
            for (let i = 0; i < 200; i++)
            {
                // A real reload destroys the previous JS context while modules load.
                try { if (await evaluate(expression)) return; } catch (_) { /* retry observation only */ }
                await sleep(100);
            }
            throw new Error('App stage timeout: ' + expression);
        }
        const url = 'http://127.0.0.1:' + port;
        stage = 'normal app startup';
        await command('Page.navigate', { url }, sessionId);
        await waitFor("Boolean(window.app && app.environment && app.state.currentView === 'login' && app.state.spieler.length)");
        assert.equal(await evaluate('firebase.app().options.projectId'), profile.projectId);
        stage = 'anonymous Rules and wrong PIN';
        // Rules client tests use the actual browser SDK, not Admin SDK.
        assert.equal(await evaluate("app.db.collection('scorecards').get().then(()=>false, e=>e.code==='permission-denied')"), true);
        assert.equal(await evaluate("app.logic.callFunction('verifyPlayerPin',{spielerId:'local-player-a',pin:'9999'}).then(()=>false,e=>e.code==='functions/permission-denied')"), true);
        stage = 'custom token login';
        assert.equal(await evaluate("(async()=>{const r=await app.logic.callFunction('verifyPlayerPin',{spielerId:'local-player-a',pin:'1234'});await firebase.auth().signInWithCustomToken(r.customToken);return firebase.auth().currentUser.uid==='local-player-a';})()"), true);
        stage = 'session restore';
        await command('Page.reload', {}, sessionId);
        await waitFor("Boolean(window.app && app.state && app.state.currentUser && app.state.currentUser.id==='local-player-a')");
        stage = 'authenticated Rules';
        assert.equal(await evaluate("app.db.collection('scoreSyncV2Requests').get().then(()=>false,e=>e.code==='permission-denied')"), true);
        assert.equal(await evaluate("app.db.collection('spieler').doc('local-player-b').get().then(()=>false,e=>e.code==='permission-denied')"), true);
        assert.equal(await evaluate("app.db.collection('scorecards').doc('local-closed-score').set({puts:1},{merge:true}).then(()=>false,e=>e.code==='permission-denied')"), true);
        assert.equal(await evaluate("app.db.collection('scorecards').doc('SC-local-round-local-player-a-1').set({puts:3},{merge:true}).then(()=>true)"), true);
        stage = 'S01 real V1 delayed ACK 5/6 and independent server read';
        assert.equal(await evaluate(`(async()=>{
            await app.db.collection('scorecards').doc('SC-local-round-local-player-a-1').update({lady:true});
            await app.logic.refreshGlobalAppData(); app.router.navigate('score_schnellerfassung',{id:'local-round',flightSeq:1}); app.logic.initScoreAutoSync('local-round');
            window.s01Api=app.logic.apiRequest;
            app.logic.apiRequest=async(action,payload)=>{const response=await s01Api(action,payload);window.s01Committed=response.success;return new Promise(resolve=>{window.s01Release=()=>resolve(response);});};
            app.state.liveScores['local-round_local-player-a_1']=5;
            if(!app.logic.markScorePending('local-round','local-round_local-player-a_1'))return false;
            window.s01Running=app.logic.syncScoresWithServer('local-round',1,true);return true;
        })()`), true);
        await waitFor('Boolean(window.s01Committed && window.s01Release)');
        assert.equal(await evaluate(`(async()=>{
            app.state.liveScores['local-round_local-player-a_1']=6;app.logic.markScorePending('local-round','local-round_local-player-a_1');
            s01Release();await s01Running;
            const old=(await app.db.collection('scorecards').doc('SC-local-round-local-player-a-1').get({source:'server'})).data();
            if(old.strokes!==5||!app.state.pendingScoreKeys['local-round_local-player-a_1'])return false;
            app.logic.apiRequest=s01Api;await app.logic.syncScoresWithServer('local-round',1,true);
            const saved=(await app.db.collection('scorecards').doc('SC-local-round-local-player-a-1').get({source:'server'})).data();
            return saved.strokes===6&&saved.puts===3&&saved.lady===true&&!app.state.pendingScoreKeys['local-round_local-player-a_1']&&document.getElementById('score-sync-status').textContent.includes('Serverbestätigt');
        })()`), true);
        stage = 'S01 real V1 clear, zero and false';
        assert.equal(await evaluate(`(async()=>{
            const key='local-round_local-player-a_1_puts';delete app.state.liveScores[key];app.logic.markScorePending('local-round',key);
            await app.logic.syncScoresWithServer('local-round',1,true);
            const ref=app.db.collection('scorecards').doc('SC-local-round-local-player-a-1');
            if('puts' in (await ref.get({source:'server'})).data())return false;
            app.state.liveScores[key]=0;app.logic.markScorePending('local-round',key);
            app.state.liveScores['local-round_local-player-a_1_lady']=false;app.logic.markScorePending('local-round','local-round_local-player-a_1_lady');
            await app.logic.syncScoresWithServer('local-round',1,true);const saved=(await ref.get({source:'server'})).data();return saved.puts===0&&saved.lady===false;
        })()`), true);
        stage = 'S01 real V1 commit then lost ACK blocks replay after real reload';
        assert.equal(await evaluate(`(async()=>{
            app.logic.apiRequest=async(a,p)=>{await s01Api(a,p);throw new Error('synthetic ACK lost');};
            app.state.liveScores['local-round_local-player-a_2']=8;app.logic.markScorePending('local-round','local-round_local-player-a_2');
            await app.logic.syncScoresWithServer('local-round',1,true);
            const saved=(await app.db.collection('scorecards').doc('SC-local-round-local-player-a-2').get({source:'server'})).data();
            return saved.strokes===8&&!!app.state.pendingScoreKeys['local-round_local-player-a_2']&&document.getElementById('score-sync-status').textContent.includes('gesperrt');
        })()`), true);
        await command('Page.reload', {}, sessionId);
        await waitFor("Boolean(window.app && app.state && app.state.currentUser && app.state.currentUser.id==='local-player-a')");
        assert.equal(await evaluate(`(async()=>{
            app.logic.initScoreAutoSync('local-round');let calls=0;const original=app.logic.apiRequest;
            app.logic.apiRequest=async(...args)=>{calls++;return original(...args);};await app.logic.syncScoresWithServer('local-round',1,true);app.logic.apiRequest=original;
            const key='local-round_local-player-a_2';return calls===0&&app.state.liveScores[key]===8&&!!app.state.pendingScoreKeys[key]&&app.state.v1JournalState.blocked.has(key);
        })()`), true);
        // Production V2 read/write adapters, real Callable transport, real transactions.
        stage = 'V2 read';
        assert.equal(await evaluate("(async()=>{const r=await app.scoreSyncV2ReadCallableTransport({ownerUid:'local-player-a',playerId:'local-player-a',spieltagId:'local-round'});return r.flightId==='local-flight';})()"), true);
        stage = 'V2 write';
        assert.equal(await evaluate("(async()=>{const c={ownerUid:'local-player-a',playerId:'local-player-a',spieltagId:'local-round',flightId:'local-flight',mode:'ownFlight'};const r=await app.scoreSyncV2ReadCallableTransport({ownerUid:c.ownerUid,playerId:c.playerId,spieltagId:c.spieltagId});const card=r.cards.find(x=>x.spielerId==='local-player-a'&&x.hole===1);await app.scoreSyncStore.putServerSnapshot({...c,spielerId:'local-player-a',hole:1,documentId:card.documentId},card.values,card.fieldRevisions,{generation:card.generation});await app.scoreSyncStore.appendChanges({...c,spielerId:'local-player-a',hole:1,documentId:card.documentId},[{field:'puts',operation:'set',value:4}]);const response=await app.createFirebaseScoreSyncV2Adapter().sync(c);return response.results.every(x=>x.status==='acknowledged');})()"), true);
        stage = 'disabled mail';
        assert.equal(await evaluate("app.logic.callFunction('requestTempPin',{spielerId:'local-player-b'}).then(r=>r.success)"), true);
        // Exercise actual logout handler, with its real login-list reload.
        stage = 'logout and reload';
        await evaluate("app.logic.showConfirm=(title,message,type,yes)=>yes();app.logic.logout();true");
        await waitFor("firebase.auth().currentUser===null && app.state.currentView==='login'");
        await command('Page.reload', {}, sessionId);
        await waitFor("Boolean(window.app && app.state && app.state.currentView==='login' && app.state.spieler.length)");
        stage = 'manager and admin Rules';
        assert.equal(await evaluate("(async()=>{const r=await app.logic.callFunction('verifyPlayerPin',{spielerId:'local-manager',pin:'1234'});await firebase.auth().signInWithCustomToken(r.customToken);await app.db.collection('spieltage').doc('local-manager-test').set({status:'Aktiv'});return app.db.collection('scorecards').doc('local-closed-score').set({puts:1},{merge:true}).then(()=>false,e=>e.code==='permission-denied');})()"), true);
        assert.equal(await evaluate("(async()=>{await firebase.auth().signOut();const r=await app.logic.callFunction('verifyPlayerPin',{spielerId:'local-admin',pin:'1234'});await firebase.auth().signInWithCustomToken(r.customToken);await app.db.collection('scorecards').doc('local-closed-score').set({puts:1},{merge:true});return (await app.db.collection('spieler').doc('local-player-a').get()).exists;})()"), true);
        await evaluate('firebase.auth().signOut().then(()=>true)');
        stage = 'S04 PIN Auth/Claims/Rules/recovery';
        await require('./pin-s04-emulator.cjs').run({ evaluate, waitFor, reload: () => command('Page.reload', {}, sessionId) });
        stage = 'network assertions';
        if (forbidden.length) console.error('Unexpected request origins (no paths/data): ' + JSON.stringify([...new Set(forbidden)]));
        assert.equal(forbidden.length, 0, 'all normal app traffic must remain loopback');
        // Deliberate forbidden URL: CSP must block it before network transmission.
        stage = 'CSP negative control';
        const negative = await evaluate("(async()=>{let violations=0;const listener=e=>{if(e.effectiveDirective==='connect-src'&&e.blockedURI.startsWith('https://script.google.com'))violations++;};document.addEventListener('securitypolicyviolation',listener);const rejected=await fetch('https://script.google.com/lie-negative-control').then(()=>false,()=>true);await new Promise(r=>setTimeout(r,100));document.removeEventListener('securitypolicyviolation',listener);return {rejected,violations};})()");
        assert.equal(negative.rejected, true);
        assert.ok(negative.violations > 0, 'negative control must raise a real CSP violation before transmission');
        assert.ok(requests.some(r => r.port === profile.emulators.auth.port));
        assert.ok(requests.some(r => r.port === profile.emulators.firestore.port));
        assert.ok(requests.some(r => r.port === profile.emulators.functions.port));
        fs.writeFileSync(path.join(__dirname, '../.local-runtime/network-proof.json'), JSON.stringify({
            projectId: profile.projectId, normalForbiddenOrigins: 0, allowedPorts: [...allowed],
            observedLocalRequests: requests.filter(r => r.host === '127.0.0.1').length,
            cspNegativeControl: negative, rulesRoles: ['anonymous', 'Spieler', 'Spielleiter', 'Admin'] }, null, 2));
        console.log('PASS local real-app S01 V1 5/6, field patches, clear/zero/false, ACK loss/reload/no-replay with independent server reads; network/Auth/Functions/Firestore/Rules/V2/mail/logout; CSP blocked.');
        await command('Browser.close');
    }
    catch (error)
    {
        // Keep SDK response data and tokens out of test output.
        console.error('Browser integration failed at: ' + stage + ' (' + error.name + ')');
        if (stage === 'browser startup') console.error(error.message); // No app/account exists at this point.
        throw new Error('Local browser stage failed.');
    }
    finally { if (socket) socket.close(); if (browser.exitCode === null) browser.kill(); }
}
module.exports = { run };
