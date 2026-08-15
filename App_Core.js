
// =========================================================================
// BMAssistent / LIE Scorecard - Globaler Anwendungs-State
// App_Core.html
// BSD (Allman) Style
// =========================================================================

window.app = window.app || {};

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
    tempFlights: [],
    tempZufallsFlights: [],
    tempManualFlights: {},
    liveScores: {},
    
    // NEU: Polling-Infrastruktur
    pollingIntervalId: null, // Hält die ID des laufenden window.setInterval
    currentPollingRate: 60   // Standard-Takt (wird dynamisch vom Server überschrieben)
};
