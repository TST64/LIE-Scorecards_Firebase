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

    async function initFirebase()
    {
        if (!app.environment) throw new Error('Local environment bootstrap missing.');
        app.db = await app.environment.start();
    }
    async function init() { await initFirebase(); }

    return {
        init: init,
        initFirebase: initFirebase
    };
})();

app.initCore = app.core.init;
app.initFirebase = app.core.initFirebase;


