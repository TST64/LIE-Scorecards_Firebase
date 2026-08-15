// =========================================================================
// BMAssistent / LIE Scorecard - Router Module
// App_Router.js
// BSD (Allman) Style
// =========================================================================

var app = app || {};
app.router = app.router || {};

app.router.currentView = null;

app.router.navigate = function(viewName)
{
    // 1. Splash Screen ausblenden
    const loadingEl = document.getElementById('app-loading');
    if (loadingEl)
    {
        loadingEl.classList.add('hidden');
    }

    // 2. Datenobjekte & Fallbacks sicherstellen
    app.data = app.data || {};
    app.state = app.state || {};
    app.state.spieler = app.state.spieler || [];
    app.state.spieltage = app.state.spieltage || [];
    app.state.scoreCards = app.state.scoreCards || [];
    app.state.liveScores = app.state.liveScores || {};

    // 3. Routing-Ziel bestimmen
    const targetView = viewName || 'login';
    app.router.currentView = targetView;

    // 4. UI-Elemente anpassen (Bottom Nav, Header Actions)
    app.router.updateNavigationUI(targetView);

    // 5. Container-Element abgreifen
    const container = document.getElementById('app-container');
    if (!container)
    {
        console.error('[Router] Container #app-container im DOM nicht gefunden.');
        return;
    }

    // 6. Ansicht rendern & HTML in den DOM-Container injizieren
    if (app.views && typeof app.views[targetView] === 'function')
    {
        container.innerHTML = app.views[targetView]();
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
        app.router.navigate(app.router.currentView);
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

    // Login-Screen Sonderbehandlung
    if (viewName === 'login')
    {
        if (bottomNav)
        {
            bottomNav.classList.add('hidden');
        }

        if (headerLogoutBtn)
        {
            headerLogoutBtn.classList.add('hidden');
        }

        if (headerActionBtn)
        {
            headerActionBtn.classList.add('hidden');
        }

        return;
    }

    // Bottom Navigation für angemeldete Bereiche einblenden
    if (bottomNav)
    {
        bottomNav.classList.remove('hidden');
    }

    if (headerLogoutBtn && app.state && app.state.currentUser)
    {
        headerLogoutBtn.classList.remove('hidden');
    }

    // Aktiven Navigation-Tab optisch hervorheben
    const navButtons = document.querySelectorAll('.nav-btn');
    navButtons.forEach(function(btn)
    {
        btn.classList.remove('text-emerald-600');
        btn.classList.add('text-stone-400');
    });

    let activeNavId = null;
    if (viewName === 'dashboard')
    {
        activeNavId = 'nav-dash';
    }
    else if (viewName === 'spieltage' || viewName === 'spieltag_neu')
    {
        activeNavId = 'nav-rounds';
    }
    else if (viewName === 'spieler')
    {
        activeNavId = 'nav-players';
    }
    else if (viewName === 'help')
    {
        activeNavId = 'nav-help';
    }
    else if (viewName === 'admin' || viewName === 'admin_gruppe')
    {
        activeNavId = 'nav-admin';
    }

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