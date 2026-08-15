// =========================================================================
// BMAssistent / LIE Scorecard - Bridge Logic
// App_Logic_Bridge.js
// BSD (Allman) Style
// =========================================================================

var app = app || {};
app.logic = app.logic || {};

app.logic.refreshGlobalAppData = async function()
{
    // Ziel-Objekte im Namensraum sicherstellen
    app.data = app.data || {};
    app.state = app.state || {};

    app.data.spieler = app.data.spieler || [];
    app.data.spieltage = app.data.spieltage || [];
    app.data.scores = app.data.scores || [];

    app.state.spieler = app.state.spieler || [];
    app.state.spieltage = app.state.spieltage || [];
    app.state.scoreCards = app.state.scoreCards || [];
    app.state.flights = app.state.flights || [];
    app.state.kurse = app.state.kurse || [];
    app.state.golfplaetze = app.state.golfplaetze || [];
    app.state.bahnen = app.state.bahnen || [];
    app.state.handicaps = app.state.handicaps || [];
    app.state.liveScores = app.state.liveScores || {};

    const refreshBtn = document.getElementById('global-refresh-icon');
    if (refreshBtn)
    {
        refreshBtn.classList.add('fa-spin');
    }

    try
    {
        if (!app.db)
        {
            throw new Error('Firestore-Datenbankinstanz (app.db) ist nicht initialisiert.');
        }

        // Parallelisiertes Laden aller Kern-Kollektionen aus Firestore
        const [spielerSnap, spieltageSnap, scoresSnap] = await Promise.all([
            app.db.collection('spieler').get(),
            app.db.collection('spieltage').get(),
            app.db.collection('scores').get()
        ]);

        // Spieler verarbeiten
        const spielerData = [];
        spielerSnap.forEach(function(doc)
        {
            spielerData.push(Object.assign({ id: doc.id }, doc.data()));
        });
        app.data.spieler = spielerData;
        app.state.spieler = spielerData;

        // Spieltage verarbeiten
        const spieltageData = [];
        spieltageSnap.forEach(function(doc)
        {
            spieltageData.push(Object.assign({ id: doc.id }, doc.data()));
        });
        app.data.spieltage = spieltageData;
        app.state.spieltage = spieltageData;

        // Scores verarbeiten
        const scoresData = [];
        scoresSnap.forEach(function(doc)
        {
            scoresData.push(Object.assign({ id: doc.id }, doc.data()));
        });
        app.data.scores = scoresData;
        app.state.scoreCards = scoresData;

        console.log('[Bridge] Globaler App-Datensatz erfolgreich geladen:', app.data);

        // Nach dem Datenladen die aktuelle Ansicht aktualisieren (falls bereits navigiert)
        if (app.router && typeof app.router.renderCurrentView === 'function' && app.router.currentView)
        {
            app.router.renderCurrentView();
        }
    }
    catch (err)
    {
        console.error('[Bridge] Fehler beim Laden der Firestore-Daten:', err);

        if (app.logic.showToast)
        {
            app.logic.showToast('Fehler beim Aktualisieren der Daten.', 'error');
        }
    }
    finally
    {
        if (refreshBtn)
        {
            refreshBtn.classList.remove('fa-spin');
        }
    }
};