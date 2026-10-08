// =========================================================================
// BMAssistent / LIE Scorecard - Client-Side Router
// App_Router.js
// BSD (Allman) Style
// =========================================================================

var app = app || {};
app.router = app.router || {};

app.router.navigate = function(viewName, params)
{
    // Auto-sync pending scores before changing views
    if (typeof app.logic.syncPendingScores === 'function')
    {
        app.logic.syncPendingScores();
    }

    const container = document.getElementById('app-container');
    if (!container) return;

    let html = "";

    switch (viewName)
    {
        case 'dashboard':
            html = app.views.dashboard ? app.views.dashboard() : "";
            break;
        case 'live_dashboard':
            html = (app.views.liveDashboard || app.views.live_dashboard) ? (app.views.liveDashboard || app.views.live_dashboard)() : "";
            break;
        case 'spieltage':
            html = app.views.spieltage ? app.views.spieltage(params) : "";
            break;
        case 'spieltag_neu':
            html = app.views.spieltagNeu ? app.views.spieltagNeu() : "";
            break;
        case 'score_eingabe':
            html = app.views.scoreEingabe ? app.views.scoreEingabe(params) : "";
            break;
        case 'score_schnellerfassung':
            html = (app.views.scoreSchnellerfassung || app.views.score_schnellerfassung) ? (app.views.scoreSchnellerfassung || app.views.score_schnellerfassung)(params) : "";
            break;
        case 'leaderboard':
            html = app.views.leaderboard ? app.views.leaderboard(params) : "";
            break;
        case 'golfplaetze':
            html = app.views.golfplaetze ? app.views.golfplaetze() : "";
            break;
        case 'kalender':
            html = app.views.kalender ? app.views.kalender() : "";
            break;
        case 'wetter':
            html = app.views.wetter ? app.views.wetter() : "";
            break;
        case 'spieler':
        case 'admin_gruppe':
            html = (app.views.spieler || app.views.adminGruppe) ? (app.views.spieler || app.views.adminGruppe)() : "";
            break;
        case 'admin':
            html = app.views.admin ? app.views.admin() : "";
            break;
        case 'spieler_edit':
            html = app.views.spielerEdit ? app.views.spielerEdit(params) : "";
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
            html = app.views.dashboard ? app.views.dashboard() : "";
            break;
    }

    container.innerHTML = html;
    window.scrollTo(0, 0);

    // Update bottom navigation bar active styles & admin visibility
    if (typeof app.router.updateNavState === 'function')
    {
        app.router.updateNavState(viewName);
    }
};

app.router.updateNavState = function(activeView)
{
    // Sichtbarkeit des Admin-Buttons basierend auf der Rolle steuern
    const adminBtn = document.getElementById('nav-admin');
    const currentUser = app.state.currentUser;
    if (adminBtn)
    {
        if (currentUser && currentUser.role === 'Admin')
        {
            adminBtn.classList.remove('hidden');
        }
        else
        {
            adminBtn.classList.add('hidden');
        }
    }

    const navBtns = document.querySelectorAll('.nav-btn');
    navBtns.forEach(function(btn)
    {
        btn.classList.remove('text-emerald-700', 'text-amber-600', 'text-emerald-600');
        btn.classList.add('text-zinc-400');
    });

    if (activeView === 'dashboard')
    {
        const el = document.getElementById('nav-dash');
        if (el) { el.classList.remove('text-zinc-400'); el.classList.add('text-emerald-700'); }
    }
    else if (activeView === 'live_dashboard')
    {
        const el = document.getElementById('nav-stats');
        if (el) { el.classList.remove('text-zinc-400'); el.classList.add('text-emerald-700'); }
    }
    else if (activeView === 'spieltage' || activeView === 'spieltag_neu' || activeView === 'score_eingabe' || activeView === 'score_schnellerfassung' || activeView === 'leaderboard')
    {
        const el = document.getElementById('nav-rounds');
        if (el) { el.classList.remove('text-zinc-400'); el.classList.add('text-emerald-700'); }
    }
    else if (activeView === 'kalender')
    {
        const el = document.getElementById('nav-calendar');
        if (el) { el.classList.remove('text-zinc-400'); el.classList.add('text-emerald-600'); }
    }
    else if (activeView === 'spieler' || activeView === 'spieler_edit')
    {
        const el = document.getElementById('nav-players');
        if (el) { el.classList.remove('text-zinc-400'); el.classList.add('text-emerald-700'); }
    }
    else if (activeView === 'admin' || activeView === 'admin_gruppe')
    {
        const el = document.getElementById('nav-admin');
        if (el) { el.classList.remove('text-zinc-400'); el.classList.add('text-amber-600'); }
    }
};


