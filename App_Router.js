// =========================================================================
// BMAssistent / LIE Scorecard - Router-Komponente mit Auto-Safe Guard
// App_Router.js
// BSD (Allman) Style
// =========================================================================

app.router = 
{
    navigate: function(viewName, params)
    {
        // === AUTO-SAFE GUARD ===
        // Vor dem View-Wechsel prüfen wir auf ungesicherte temporäre Scores
        if (app.state.liveScores && Object.keys(app.state.liveScores).length > 0)
        {
            console.log("[Router Guard] Ungesicherte Scores entdeckt. Starte Auto-Sync...");
            
            // Ermittle die Kontextdaten aus dem aktuellen Zustand
            let activeSpieltagId = params ? params.id : null;
            let activeFlightSeq = params ? params.flightSeq : 1;
            
            if (!activeSpieltagId && app.state.spieltage)
            {
                const aktRunde = app.state.spieltage.find(function(st) { return st.status === 'Aktiv'; });
                if (aktRunde) activeSpieltagId = aktRunde.id;
            }
            
            if (activeSpieltagId)
            {
                // Führt den Sync lautlos im Hintergrund aus
                app.logic.syncScoresWithServer(activeSpieltagId, activeFlightSeq);
            }
        }

        // Stoppt das Polling der alten View
        app.logic.stopLivePolling();

        app.state.currentView = viewName;
        const container = document.getElementById('app-container');
        if (!container) 
        {
            return;
        }

        // Navigations-Elemente aktualisieren
        app.router.updateNavigationUI(viewName);

        switch (viewName)
        {
            case 'login':
                container.innerHTML = app.views.login();
                break;

            case 'pin_aendern':
                container.innerHTML = app.views.pin_aendern();
                break;

            case 'dashboard':
                container.innerHTML = app.views.dashboard();
                break;

            case 'spieltage':
                container.innerHTML = app.views.spieltage();
                break;

            case 'spieltag_neu':
                container.innerHTML = app.views.spieltag_neu();
                break;

            case 'leaderboard':
                if (params && params.id)
                {
                    container.innerHTML = app.views.leaderboard(params.id, params.mode);
                    app.logic.startLivePolling(params.id);
                }
                break;

            case 'score_eingabe':
                if (params && params.id && params.hole)
                {
                    container.innerHTML = app.views.score_eingabe(params.id, params.hole, params.flightSeq);
                    app.logic.startLivePolling(params.id, params.hole, params.flightSeq);
                }
                break;

            case 'spieler':
                container.innerHTML = app.views.spieler_liste();
                break;

            case 'spieler_edit':
                container.innerHTML = app.views.spieler_edit(params ? params.id : null);
                break;

            case 'admin':
                if (typeof app.views.admin === 'function')
                {
                    container.innerHTML = app.views.admin();
                }
                else
                {
                    container.innerHTML = '<p class="text-stone-400 p-4">Admin-Ansicht nicht verfügbar.</p>';
                }
                break;

            case 'help':
                container.innerHTML = app.views.help();
                break;

            default:
                container.innerHTML = '<p class="text-stone-400 p-4">Ansicht nicht gefunden.</p>';
        }

        window.scrollTo(0, 0);
    },

    updateNavigationUI: function(viewName)
    {
        if (typeof app.logic.updateHeaderRoleIcon === 'function')
        {
            app.logic.updateHeaderRoleIcon();
        }

        const actionBtn = document.getElementById('header-action-btn');
        const navBar = document.getElementById('bottom-nav');
        const adminNavBtn = document.getElementById('nav-admin');

        if (!actionBtn || !navBar) 
        {
            return;
        }

        const isAdmin = app.state.currentUser && app.state.currentUser.role === 'Admin';
        const isLeiter = app.state.currentUser && (app.state.currentUser.role === 'Admin' || app.state.currentUser.role === 'Spielleiter');

        // Header-Aktions-Button (+ Plus zum Runden anlegen)
        if (viewName === 'spieltage' && isLeiter)
        {
            actionBtn.classList.remove('hidden');
        }
        else
        {
            actionBtn.classList.add('hidden');
        }

        // Steuerung des Admin-Buttons in der Bottom Navigation
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

        // Sichtbarkeit der gesamten Footer-Leiste
        if (viewName === 'login')
        {
            navBar.classList.add('hidden');
        }
        else
        {
            navBar.classList.remove('hidden');
            
            // Zurücksetzen aller Tab-Stylings
            document.querySelectorAll('#bottom-nav button').forEach(function(btn)
            {
                btn.classList.remove('text-emerald-600', 'font-bold');
                btn.classList.add('text-stone-400');
            });

            // Aktiven Tab ermitteln
            let activeTabId = "";
            if (viewName === 'dashboard') activeTabId = 'nav-dash';
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
    }
};