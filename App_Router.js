// =========================================================================
// BMAssistent / LIE Scorecard - Client-Side Router
// App_Router.js
// BSD (Allman) Style
// =========================================================================

var app = app || {};
app.router = app.router || {};

app.router.currentView = null;
app.router.currentParams = null;


// =========================================================================
// Navigation
// =========================================================================

app.router.navigate = function(viewName, params)
{

    // ---------------------------------------------------------------------
    // Vorhandenes Live-Polling beim View-Wechsel beenden
    // ---------------------------------------------------------------------

    if (app.logic && typeof app.logic.stopLivePolling === 'function')
    {
        app.logic.stopLivePolling();
    }


    // ---------------------------------------------------------------------
    // Loading-Anzeige ausblenden
    // ---------------------------------------------------------------------

    const loadingEl = document.getElementById('app-loading');

    if (loadingEl)
    {
        loadingEl.classList.add('hidden');
    }


    // ---------------------------------------------------------------------
    // State absichern
    // ---------------------------------------------------------------------

    app.state = app.state || {};
    app.state.spieler = app.state.spieler || [];
    app.state.spieltage = app.state.spieltage || [];
    app.state.scoreCards = app.state.scoreCards || [];
    app.state.liveScores = app.state.liveScores || {};


    // ---------------------------------------------------------------------
    // Ziel-View bestimmen
    // ---------------------------------------------------------------------

    let targetView = viewName || 'login';

    // Kompatibilitäts-Aliase
    if (targetView === 'spieltag-neu')
    {
        targetView = 'spieltag_neu';
    }

    if (targetView === 'gruppe')
    {
        targetView = 'spieler';
    }

    if (targetView === 'admin_gruppe')
    {
        targetView = 'spieler';
    }


    app.router.currentView = targetView;
    app.router.currentParams = params || null;
    app.state.currentView = targetView;


    // ---------------------------------------------------------------------
    // Navigation aktualisieren
    // ---------------------------------------------------------------------

    app.router.updateNavigationUI(targetView);


    // ---------------------------------------------------------------------
    // Zielcontainer
    // ---------------------------------------------------------------------

    const container = document.getElementById('app-container');

    if (!container)
    {
        console.error('[Router] Container #app-container im DOM nicht gefunden.');
        return;
    }


    // ---------------------------------------------------------------------
    // View rendern
    // ---------------------------------------------------------------------

    let html = "";

    switch (targetView)
    {
        case 'login':
            html = app.views.login ? app.views.login() : "";
            break;

        case 'pin_aendern':
            html = app.views.pin_aendern ? app.views.pin_aendern() : "";
            break;

        case 'dashboard':
            html = app.views.dashboard ? app.views.dashboard() : "";
            break;

        case 'live_dashboard':
            html = app.views.liveDashboard
                ? app.views.liveDashboard()
                : "";
            break;

        case 'spieltage':
            html = app.views.spieltage
                ? app.views.spieltage(params)
                : "";
            break;

        case 'spieltag_neu':
            html = app.views.spieltagNeu
                ? app.views.spieltagNeu()
                : "";
            break;

        case 'score_eingabe':
            html = app.views.scoreEingabe
                ? app.views.scoreEingabe(params)
                : "";
            break;

        case 'score_schnellerfassung':
            html = app.views.scoreSchnellerfassung
                ? app.views.scoreSchnellerfassung(params)
                : "";
            break;

        case 'leaderboard':
            html = app.views.leaderboard
                ? app.views.leaderboard(params)
                : "";
            break;

        case 'golfplaetze':
            html = app.views.golfplaetze
                ? app.views.golfplaetze()
                : "";
            break;

        case 'kalender':
            html = app.views.kalender
                ? app.views.kalender()
                : "";
            break;

        case 'wetter':
            html = app.views.wetter
                ? app.views.wetter()
                : "";
            break;

        case 'spieler':
            html = app.views.spieler
                ? app.views.spieler()
                : "";
            break;

        case 'admin':
            html = app.views.admin
                ? app.views.admin()
                : "";
            break;

        case 'spieler_edit':
            if (app.views.spielerEdit)
            {
                html = app.views.spielerEdit(params);
            }
            else if (app.views.spieler_edit)
            {
                html = app.views.spieler_edit(params);
            }
            break;

        case 'hilfe':
        case 'help':
            if (typeof app.views.help === 'function')
            {
                html = app.views.help();
            }
            else if (typeof app.views.hilfe === 'function')
            {
                html = app.views.hilfe();
            }
            break;

        default:
            console.warn(
                '[Router] View "' + targetView +
                '" nicht gefunden. Lade sicheren Fallback.'
            );

            // Ohne angemeldeten Benutzer niemals einfach das Dashboard zeigen.
            if (app.state.currentUser && app.views.dashboard)
            {
                targetView = 'dashboard';
                html = app.views.dashboard();
            }
            else if (app.views.login)
            {
                targetView = 'login';
                html = app.views.login();
            }

            app.router.currentView = targetView;
            app.state.currentView = targetView;
            app.router.updateNavigationUI(targetView);
            break;
    }


    container.innerHTML = html;

    window.scrollTo(0, 0);


    // ---------------------------------------------------------------------
    // Live-Polling für Views starten, die aktuelle Spieldaten benötigen
    // ---------------------------------------------------------------------

    if (targetView === 'leaderboard' &&
        params &&
        params.id &&
        app.logic &&
        typeof app.logic.startLivePolling === 'function')
    {
        app.logic.startLivePolling(params.id);
    }
    else if (targetView === 'score_eingabe' &&
             params &&
             params.id &&
             app.logic &&
             typeof app.logic.startLivePolling === 'function')
    {
        app.logic.startLivePolling(
            params.id,
            params.hole || null,
            params.flightSeq
        );
    }
};


// =========================================================================
// Aktuelle View erneut rendern
// =========================================================================

app.router.renderCurrentView = function()
{
    if (app.router.currentView)
    {
        app.router.navigate(
            app.router.currentView,
            app.router.currentParams
        );
    }
    else
    {
        const defaultTarget =
            (app.state && app.state.currentUser)
                ? 'dashboard'
                : 'login';

        app.router.navigate(defaultTarget);
    }
};


// =========================================================================
// Navigation / Header aktualisieren
// =========================================================================

app.router.updateNavigationUI = function(viewName)
{
    if (app.logic &&
        typeof app.logic.updateHeaderRoleIcon === 'function')
    {
        app.logic.updateHeaderRoleIcon();
    }

    const actionBtn = document.getElementById('header-action-btn');
    const navBar = document.getElementById('bottom-nav');
    const adminNavBtn = document.getElementById('nav-admin');

    const currentUser =
        app.state
            ? app.state.currentUser
            : null;

    const isAdmin =
        currentUser &&
        currentUser.role === 'Admin';

    const isLeiter =
        currentUser &&
        (
            currentUser.role === 'Admin' ||
            currentUser.role === 'Spielleiter'
        );


    // ---------------------------------------------------------------------
    // Header Action Button
    // ---------------------------------------------------------------------

    if (actionBtn)
    {
        if (viewName === 'spieltage' && isLeiter)
        {
            actionBtn.classList.remove('hidden');
        }
        else
        {
            actionBtn.classList.add('hidden');
        }
    }


    // ---------------------------------------------------------------------
    // Admin Navigation
    // ---------------------------------------------------------------------

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


    // ---------------------------------------------------------------------
    // Login / PIN-Wechsel:
    // Bottom Navigation ausblenden
    // ---------------------------------------------------------------------

    if (navBar)
    {
        if (viewName === 'login' || viewName === 'pin_aendern')
        {
            navBar.classList.add('hidden');
            return;
        }

        navBar.classList.remove('hidden');
    }


    // ---------------------------------------------------------------------
    // Aktiven Navigationseintrag markieren
    // ---------------------------------------------------------------------

    const navBtns = document.querySelectorAll('.nav-btn');

    navBtns.forEach(function(btn)
    {
        btn.classList.remove(
            'text-emerald-700',
            'text-amber-600',
            'text-emerald-600',
            'font-bold'
        );

        btn.classList.add('text-zinc-400');
    });


    let activeTabId = "";

    if (viewName === 'dashboard')
    {
        activeTabId = 'nav-dash';
    }
    else if (viewName === 'live_dashboard')
    {
        activeTabId = 'nav-stats';
    }
    else if (
        viewName === 'spieltage' ||
        viewName === 'spieltag_neu' ||
        viewName === 'score_eingabe' ||
        viewName === 'score_schnellerfassung' ||
        viewName === 'leaderboard'
    )
    {
        activeTabId = 'nav-rounds';
    }
    else if (viewName === 'kalender')
    {
        activeTabId = 'nav-calendar';
    }
    else if (
        viewName === 'spieler' ||
        viewName === 'spieler_edit'
    )
    {
        activeTabId = 'nav-players';
    }
    else if (viewName === 'admin')
    {
        activeTabId = 'nav-admin';
    }


    const activeBtn = document.getElementById(activeTabId);

    if (activeBtn)
    {
        activeBtn.classList.remove('text-zinc-400');

        if (activeTabId === 'nav-admin')
        {
            activeBtn.classList.add(
                'text-amber-600',
                'font-bold'
            );
        }
        else
        {
            activeBtn.classList.add(
                'text-emerald-700',
                'font-bold'
            );
        }
    }
};


// =========================================================================
// Kompatibilität mit Code, der noch updateNavState() verwendet
// =========================================================================

app.router.updateNavState = function(activeView)
{
    app.router.updateNavigationUI(activeView);
};