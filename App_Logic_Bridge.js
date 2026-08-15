// =========================================================================
// BMAssistent / LIE Scorecard - Bridge Logic
// App_Logic_Bridge.js
// BSD (Allman) Style
// =========================================================================

var app = app || {};
app.logic = app.logic || {};

app.logic.refreshGlobalAppData = async function()
{
    app.data = app.data || {};
    app.state = app.state || {};

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

        const [
            spielerSnap, 
            spieltageSnap, 
            scorecardsSnap, 
            scoresSnap, 
            flightsSnap, 
            kurseSnap, 
            plaetzeSnap, 
            bahnenSnap,
            handicapsSnap
        ] = await Promise.all([
            app.db.collection('spieler').get().catch(function() { return { forEach: function() {} }; }),
            app.db.collection('spieltage').get().catch(function() { return { forEach: function() {} }; }),
            app.db.collection('scorecards').get().catch(function() { return { forEach: function() {} }; }),
            app.db.collection('scores').get().catch(function() { return { forEach: function() {} }; }),
            app.db.collection('flights').get().catch(function() { return { forEach: function() {} }; }),
            app.db.collection('kurse').get().catch(function() { return { forEach: function() {} }; }),
            app.db.collection('golfplaetze').get().catch(function() { return { forEach: function() {} }; }),
            app.db.collection('bahnen').get().catch(function() { return { forEach: function() {} }; }),
            app.db.collection('handicaps').get().catch(function() { return { forEach: function() {} }; })
        ]);

        // Spieler
        const spielerData = [];
        spielerSnap.forEach(function(doc) { spielerData.push(Object.assign({ id: doc.id }, doc.data())); });
        app.state.spieler = spielerData;

        // Spieltage
        const spieltageData = [];
        spieltageSnap.forEach(function(doc) { spieltageData.push(Object.assign({ id: doc.id }, doc.data())); });
        app.state.spieltage = spieltageData;

        // Scorecards aus beiden Kollektionen zusammenführen
        const scoresMap = {};
        scorecardsSnap.forEach(function(doc) { 
            const data = Object.assign({ id: doc.id }, doc.data());
            if (data.id) scoresMap[data.id] = data;
        });
        scoresSnap.forEach(function(doc) { 
            const data = Object.assign({ id: doc.id }, doc.data());
            if (data.id) scoresMap[data.id] = data;
        });
        app.state.scoreCards = Object.values(scoresMap);

        // Flights
        const flightsData = [];
        flightsSnap.forEach(function(doc) { flightsData.push(Object.assign({ id: doc.id }, doc.data())); });
        app.state.flights = flightsData;

        // Kurse, Plätze, Bahnen & Handicaps
        const kurseData = [];
        kurseSnap.forEach(function(doc) { kurseData.push(Object.assign({ id: doc.id }, doc.data())); });
        app.state.kurse = kurseData;

        const plaetzeData = [];
        plaetzeSnap.forEach(function(doc) { plaetzeData.push(Object.assign({ id: doc.id }, doc.data())); });
        app.state.golfplaetze = plaetzeData;

        const bahnenData = [];
        bahnenSnap.forEach(function(doc) { bahnenData.push(Object.assign({ id: doc.id }, doc.data())); });
        app.state.bahnen = bahnenData;

        const handicapsData = [];
        handicapsSnap.forEach(function(doc) { handicapsData.push(Object.assign({ id: doc.id }, doc.data())); });
        app.state.handicaps = handicapsData;

        console.log('[Bridge] Globaler App-Datensatz erfolgreich geladen:', app.state);

        if (app.router && typeof app.router.renderCurrentView === 'function' && app.router.currentView)
        {
            app.router.renderCurrentView();
        }
    }
    catch (err)
    {
        console.error('[Bridge] Fehler beim Laden der Firestore-Daten:', err);
    }
    finally
    {
        if (refreshBtn)
        {
            refreshBtn.classList.remove('fa-spin');
        }
    }
};