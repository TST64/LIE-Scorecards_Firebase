// Separate browser bootstrap. Loading this module performs no SDK/network work.
(function(root)
{
    'use strict';
    const projectId = 'lie-scorecards-preprod', origin = 'https://' + projectId + '.web.app';
    const calls = new Set(['getLoginPlayers','verifyPlayerPin','getPlayerSessionState','updatePlayerPin',
        'readOwnFlightScoresV2','saveScoreOperationsV2','readPublishedSeasonV1','roundClosureV1','createRoundStart']);
    function validate(profile, config, location, apps)
    {
        if (!profile || profile.mode !== 'preprod' || profile.projectId !== projectId || profile.origin !== origin
            || profile.region !== 'europe-west1' || Object.hasOwn(profile,'emulators')
            || !location || location.protocol !== 'https:' || location.origin !== origin
            || !config || config.projectId !== projectId || config.authDomain !== projectId + '.firebaseapp.com'
            || ![projectId+'.firebasestorage.app',projectId+'.appspot.com'].includes(config.storageBucket)
            || !/^AIza[A-Za-z0-9_-]{35}$/.test(config.apiKey || '') || !/^\d+$/.test(config.messagingSenderId || '')
            || !new RegExp('^1:'+config.messagingSenderId+':web:[a-f0-9]+$').test(config.appId || '')
            || Object.keys(config).some(k => !['projectId','authDomain','storageBucket','apiKey','appId','messagingSenderId'].includes(k))
            || apps?.length) throw new Error('PreProd environment contract rejected.');
        return Object.freeze(JSON.parse(JSON.stringify(profile)));
    }
    function create(profile, config, location, sdk)
    {
        validate(profile, config, location, sdk.apps);
        const cfg = Object.freeze({...config}), key = 'preprod:' + projectId;
        let instance, db, functions, started = false;
        function assertReady()
        {
            if (!started || sdk.apps.length !== 1 || sdk.app() !== instance || instance.options.projectId !== projectId
                || instance.options.authDomain !== cfg.authDomain || instance.options.appId !== cfg.appId)
                throw new Error('PreProd Firebase is not ready.');
        }
        async function checkOnline()
        {
            assertReady(); if (navigator.onLine === false) throw new Error('PreProd is offline; local data retained.');
        }
        return Object.freeze({mode:'preprod', projectId, key,
            storageName:name => name + '__' + key, assertReady, checkOnline,
            start:async function()
            {
                if (started) { assertReady(); return db; }
                validate(profile, cfg, location, sdk.apps);
                if (navigator.serviceWorker?.controller) throw new Error('Use a fresh PreProd browser context.');
                instance = sdk.initializeApp(cfg);
                instance.auth(); db = instance.firestore(); functions = instance.functions('europe-west1');
                // Never call useEmulator; region and project belong to this instance.
                started = true; assertReady(); return db;
            },
            callable:function(name)
            {
                assertReady(); if (!calls.has(name)) throw new Error('Callable unavailable in field test.');
                const call = functions.httpsCallable(name);
                return async data => { await checkOnline(); return call(data); };
            }
        });
    }
    const api = {validate, create, projectId};
    if (typeof module !== 'undefined') module.exports = api; else root.LieEnvironment = Object.freeze(api);
})(typeof window === 'undefined' ? globalThis : window);
