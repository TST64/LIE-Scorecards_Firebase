// Local-only Phase 2A contract. No SDK or network work occurs during loading.
(function(root)
{
    'use strict';
    const projectId = 'demo-lie-scorecards-local';
    function validate(profile, config, location, apps)
    {
        if (!profile || profile.mode !== 'local' || profile.projectId !== projectId
            || !config || config.projectId !== projectId || config.authDomain !== projectId + '.firebaseapp.com'
            || config.apiKey !== 'local-demo-key' || config.storageBucket !== projectId + '.appspot.com'
            || !location || !['127.0.0.1', 'localhost'].includes(location.hostname)
            || location.protocol !== 'http:') throw new Error('Local environment contract rejected.');
        const ports = [];
        for (const service of ['auth', 'firestore', 'functions'])
        {
            const endpoint = profile.emulators && profile.emulators[service];
            if (!endpoint || endpoint.host !== '127.0.0.1' || !Number.isInteger(endpoint.port)
                || endpoint.port < 1024 || endpoint.port > 65535) throw new Error('Invalid emulator endpoint.');
            ports.push(endpoint.port);
        }
        if (new Set(ports).size !== 3) throw new Error('Emulator ports must be distinct.');
        // Even same-project foreign instances may already have started network traffic.
        if (apps && apps.length) throw new Error('Firebase was initialized before the local guard.');
        return JSON.parse(JSON.stringify(profile));
    }
    function create(profile, config, location, sdk, ready)
    {
        const p = validate(profile, config, location, sdk.apps);
        const key = 'local:' + projectId;
        let instance, auth, db, functions, started = false;
        function assertReady()
        {
            if (!started || sdk.app() !== instance || instance.options.projectId !== projectId)
                throw new Error('Local Firebase is not ready.');
        }
        return Object.freeze({ key: key, projectId: projectId, mode: 'local',
            storageName: function(name) { return name + '__' + key; },
            assertReady: assertReady,
            checkOnline: async function() { assertReady(); await ready(p); assertReady(); },
            start: async function()
            {
                if (started) return db;
                // Readiness is exclusively a same-origin loopback probe, never Cloud.
                await ready(p);
                validate(p, config, location, sdk.apps);
                instance = sdk.initializeApp(config);
                auth = instance.auth();
                auth.useEmulator('http://127.0.0.1:' + p.emulators.auth.port, { disableWarnings: true });
                db = instance.firestore();
                db.useEmulator('127.0.0.1', p.emulators.firestore.port);
                functions = instance.functions('europe-west1');
                functions.useEmulator('127.0.0.1', p.emulators.functions.port);
                started = true;
                return db;
            },
            callable: function(name)
            {
                assertReady();
                const call = functions.httpsCallable(name);
                return async function(data) { assertReady(); await ready(p); assertReady(); return call(data); };
            }
        });
    }
    const api = { validate: validate, create: create, projectId: projectId };
    if (typeof module !== 'undefined') module.exports = api;
    else root.LieEnvironment = Object.freeze(api);
})(typeof window === 'undefined' ? globalThis : window);
