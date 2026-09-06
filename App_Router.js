// =========================================================================
// BMAssistent / LIE Scorecard - Router Module
// App_Router.js
// BSD (Allman) Style
// =========================================================================

var app = app || {};
app.router = app.router || {};

app.router.currentView = null;
app.router.currentParams = null;

app.router.navigate = function(viewName, params)
{
    if (app.state.liveScores && Object.keys(app.state.liveScores).length > 0)
    {
        console.log("[Router Guard] Ungesicherte Scores entdeckt. Starte Auto-Sync...");
        
        let activeSpieltagId = params ? params.id : null;
        let activeFlightSeq = params ? params.flightSeq : 1;
        
        if (!activeSpieltagId && app.state.spieltage)
        {
            const aktRunde = app.state.spieltage.find(function(st) { return st.status === 'Aktiv'; });
            if (aktRunde) activeSpieltagId = aktRunde.id;
        }
        
        if (activeSpieltagId)
        {
            app.logic.syncScoresWithServer(activeSpieltagId, activeFlightSeq);
        }
    }

    if (app.logic && typeof app.logic.stopLivePolling === 'function')
    {
        app.logic.stopLivePolling();
    }

    const loadingEl = document.getElementById('app-loading');
    if (loadingEl)
    {
        loadingEl.classList.add('hidden');
    }

    app.state = app.state || {};
    app.state.spieler = app.state.spieler || [];
    app.state.spieltage = app.state.spieltage || [];
    app.state.scoreCards = app.state.scoreCards || [];
    app.state.kalenderTermine = app.state.kalenderTermine || []; // <--- Ergänzt
    app.state.liveScores = app.state.liveScores || {};

    const targetView = viewName || 'login';
    app.router.currentView = targetView;
    app.router.currentParams = params || null;
    app.state.currentView = targetView;

    app.router.updateNavigationUI(targetView);

    const container = document.getElementById('app-container');
    if (!container)
    {
        console.error('[Router] Container #app-container im DOM nicht gefunden.');
        return;
    }

    let p1 = params;
    let p2 = undefined;
    let p3 = undefined;

    if (params && typeof params === 'object')
    {
        p1 = params.id !== undefined ? params.id : params.hole;
        p2 = params.mode !== undefined ? params.mode : params.hole;
        p3 = params.flightSeq !== undefined ? params.flightSeq : undefined;
    }

    if (app.views && typeof app.views[targetView] === 'function')
    {
        container.innerHTML = app.views[targetView](p1, p2, p3);

        if (targetView === 'leaderboard' && params && params.id)
        {
            app.logic.startLivePolling(params.id);
        }
        else if (targetView === 'score_eingabe' && params && params.id && params.hole)
        {
            app.logic.startLivePolling(params.id, params.hole, params.flightSeq);
        }
    }
    else if (app.views && typeof app.views.dashboard === 'function')
    {
        console.warn('[Router] View "' + targetView + '" nicht gefunden. Lade Dashboard-Fallback.');
        app.router.currentView = 'dashboard';
        container.innerHTML = app.views.dashboard();
    }
    else
    {
        console.error('[Router] Keine passende View zum Rendern gefunden.');
    }

    window.scrollTo(0, 0);
};

app.router.renderCurrentView = function()
{
    if (app.router.currentView)
    {
        app.router.navigate(app.router.currentView, app.router.currentParams);
    }
    else
    {
        const defaultTarget = (app.state && app.state.currentUser) ? 'dashboard' : 'login';
        app.router.navigate(defaultTarget);
    }
};

app.router.updateNavigationUI = function(viewName)
{
    if (app.logic && typeof app.logic.updateHeaderRoleIcon === 'function')
    {
        app.logic.updateHeaderRoleIcon();
    }

    const actionBtn = document.getElementById('header-action-btn');
    const navBar = document.getElementById('bottom-nav');
    const adminNavBtn = document.getElementById('nav-admin');

    if (!actionBtn || !navBar) return;

    const isAdmin = app.state.currentUser && app.state.currentUser.role === 'Admin';
    const isLeiter = app.state.currentUser && (app.state.currentUser.role === 'Admin' || app.state.currentUser.role === 'Spielleiter');

    if (viewName === 'spieltage' && isLeiter)
    {
        actionBtn.classList.remove('hidden');
    }
    else
    {
        actionBtn.classList.add('hidden');
    }

    if (adminNavBtn)
    {
        if (isAdmin)
        {
            adminNavBtn.classList.remove('hidden');
        }
        else
        {
            adminNavBtn.classList.add('hidden');
        }
    }

    if (viewName === 'login')
    {
        navBar.classList.add('hidden');
    }
    else
    {
        navBar.classList.remove('hidden');
        
        document.querySelectorAll('#bottom-nav button').forEach(function(btn)
        {
            btn.classList.remove('text-emerald-600', 'font-bold');
            btn.classList.add('text-stone-400');
        });

        let activeTabId = "";
        if (viewName === 'dashboard') activeTabId = 'nav-dash';
        if (viewName === 'kalender') activeTabId = 'nav-calendar'; // <--- Ergänzt
        if (viewName === 'spieltage' || viewName === 'spieltag_neu' || viewName === 'leaderboard') activeTabId = 'nav-rounds';
        if (viewName === 'spieler' || viewName === 'spieler_edit') activeTabId = 'nav-players';
        if (viewName === 'admin') activeTabId = 'nav-admin';
        if (viewName === 'help') activeTabId = 'nav-help';

        const activeBtn = document.getElementById(activeTabId);
        if (activeBtn)
        {
            activeBtn.classList.remove('text-stone-400');
            activeBtn.classList.add('text-emerald-600', 'font-bold');
        }
    }
};