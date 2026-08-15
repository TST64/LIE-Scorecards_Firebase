// =========================================================================
// BMAssistent / LIE Scorecard - Core Module
// App_Core.js
// BSD (Allman) Style
// =========================================================================

var app = app || {};

app.core = (function()
{
    'use strict';

    function initFirebase()
    {
        if (typeof firebase === 'undefined')
        {
            console.error('[App_Core] Firebase SDK wurde nicht geladen.');
            return;
        }

        const config = window.firebaseConfig || (typeof firebaseConfig !== 'undefined' ? firebaseConfig : null);

        if (!config)
        {
            console.error('[App_Core] Firebase-Konfiguration (firebaseConfig) fehlt oder ist undefined.');
            return;
        }

        if (!firebase.apps.length)
        {
            firebase.initializeApp(config);
        }

        app.db = firebase.firestore();

        // Strikte Long-Polling Konfiguration ohne ungültiges 'merge'
        app.db.settings({
            experimentalForceLongPolling: true,
            experimentalAutoDetectLongPolling: false
        });

        console.log('[Firebase] Cloud Firestore erfolgreich initialisiert.');
    }

    function init()
    {
        initFirebase();
    }

    return {
        init: init,
        initFirebase: initFirebase
    };
})();

app.initFirebase = app.core.initFirebase;