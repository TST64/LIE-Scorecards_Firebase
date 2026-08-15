// =========================================================================
// BMAssistent / LIE Scorecard - Startup Bootstrapper
// App_Start.js
// BSD (Allman) Style
// =========================================================================

var app = app || {};

app.initStart = async function()
{
    // Globalen State sicherstellen
    app.state = app.state || {};
    app.state.liveScores = app.state.liveScores || {};
    app.data = app.data || {};

    // 1. Firebase initialisieren
    if (app.core && typeof app.core.init === 'function')
    {
        app.core.init();
    }

    // 2. Daten aus Firestore laden
    if (app.logic && typeof app.logic.refreshGlobalAppData === 'function')
    {
        await app.logic.refreshGlobalAppData();
    }

    // 3. Auto-Login prüfen: Gespeicherte User-ID aus localStorage wiederherstellen
    const savedUserId = localStorage.getItem('lie_scorecard_user_id');
    if (savedUserId && app.state.spieler && app.state.spieler.length > 0)
    {
        const restoredUser = app.state.spieler.find(function(s)
        {
            return String(s.id).trim() === String(savedUserId).trim();
        });

        if (restoredUser)
        {
            app.state.currentUser = restoredUser;
            
            if (app.logic && typeof app.logic.updateHeaderRoleIcon === 'function')
            {
                app.logic.updateHeaderRoleIcon();
            }
        }
    }

    // 4. Routing durchführen (Dashboard wenn eingeloggt, sonst Login)
    if (app.router && typeof app.router.navigate === 'function')
    {
        const defaultTarget = (app.state && app.state.currentUser) ? 'dashboard' : 'login';
        app.router.navigate(defaultTarget);
    }
    else
    {
        const loadingEl = document.getElementById('app-loading');
        if (loadingEl)
        {
            loadingEl.classList.add('hidden');
        }
    }
};