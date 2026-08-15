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
    // 1. Splash Screen ausblenden
    const loadingEl = document.getElementById('app-loading');
    if (loadingEl)
    {
        loadingEl.classList.add('hidden');
    }

    // 2. State & Fallbacks sicherstellen
    app.data = app.data || {};
    app.state = app.state || {};
    app.state.spieler = app.state.spieler || [];
    app.state.spieltage = app.state.spieltage || [];
    app.state.scoreCards = app.state.scoreCards || [];
    app.state.liveScores = app.state.liveScores || {};

    // 3. Routing-Ziel & Parameter sichern
    const targetView = viewName || 'login';
    app.router.currentView = targetView;
    app.router.currentParams = params || null;

    // 4. UI-Elemente anpassen (Bottom Nav, Header Actions)
    app.router.updateNavigationUI(targetView);

    // 5. Container im DOM abgreifen
    const container = document.getElementById('app-container');
    if (!container)
    {
        console.error('[Router] Container #app-container im DOM nicht gefunden.');
        return;
    }

    // 6. Parameter entpacken
    let p1 = params;
    let p2 = undefined;
    let p3 = undefined;

    if (params && typeof params === 'object')
    {
        p1 = params.id !== undefined ? params.id : params.hole;
        p2 = params.mode !== undefined ? params.mode : params.hole;
        p3 = params.flightSeq !== undefined ? params.flightSeq : undefined;
    }

    // 7. Ansicht mit Parametern rendern
    if (app.views && typeof app.views[targetView] === 'function')
    {
        container.innerHTML = app.views[targetView](p1, p2, p3);
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
    const bottomNav = document.getElementById('bottom-nav');
    const headerLogoutBtn = document.getElementById('header-logout-btn');
    const headerActionBtn = document.getElementById('header-action-btn');

    if (viewName === 'login')
    {
        if (bottomNav) bottomNav.classList.add('hidden');
        if (headerLogoutBtn) headerLogoutBtn.classList.add('hidden');
        if (headerActionBtn) headerActionBtn.classList.add('hidden');
        return;
    }

    if (bottomNav) bottomNav.classList.remove('hidden');
    if (headerLogoutBtn && app.state && app.state.currentUser) headerLogoutBtn.classList.remove('hidden');

    const navButtons = document.querySelectorAll('.nav-btn');
    navButtons.forEach(function(btn)
    {
        btn.classList.remove('text-emerald-600');
        btn.classList.add('text-stone-400');
    });

    let activeNavId = null;
    if (viewName === 'dashboard') activeNavId = 'nav-dash';
    else if (viewName === 'spieltage' || viewName === 'spieltag_neu') activeNavId = 'nav-rounds';
    else if (viewName === 'spieler') activeNavId = 'nav-players';
    else if (viewName === 'help') activeNavId = 'nav-help';
    else if (viewName === 'admin' || viewName === 'admin_gruppe') activeNavId = 'nav-admin';

    if (activeNavId)
    {
        const activeBtn = document.getElementById(activeNavId);
        if (activeBtn)
        {
            activeBtn.classList.remove('text-stone-400');
            activeBtn.classList.add('text-emerald-600');
        }
    }
};