// =========================================================================
// BMAssistent / LIE Scorecard - Globaler Anwendungs-State & Core Module
// App_Core.js
// BSD (Allman) Style
// =========================================================================

var app = app || {};

app.state = 
{
    currentView: 'login',
    currentUser: null,
    leaderboardViewMode: 'matrix', 
    spieler: [],
    golfplaetze: [],
    kurse: [],
    bahnen: [],
    handicaps: [],
    spieltage: [],
    scoreCards: [],
    flights: [],
    kalenderTermine: [],
    tempFlights: [],
    tempZufallsFlights: [],
    tempManualFlights: {},
    liveScores: {},
    activeManualFlightSeq: 1,
    pollingIntervalId: null,
    currentPollingRate: 60
};

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
            console.error('[App_Core] Firebase-Konfiguration fehlt.');
            return;
        }

        if (!firebase.apps.length)
        {
            firebase.initializeApp(config);
            
            const dbInstance = firebase.firestore();
            
            // Verhindert CORS- / WebChannel-Sperren bei lokaler Entwicklung (127.0.0.1 / localhost)
            dbInstance.settings({
                experimentalAutoDetectLongPolling: true
            });
            
            app.db = dbInstance;
            console.log('[Firebase] Cloud Firestore erfolgreich initialisiert.');
        }
        else if (!app.db)
        {
            app.db = firebase.firestore();
        }
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

app.initCore = app.core.init;
app.initFirebase = app.core.initFirebase;