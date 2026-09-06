// =========================================================================
// BMAssistent / LIE Scorecard - Application Startup & Lifecycle
// App_Start.js
// BSD (Allman) Style
// =========================================================================

var app = app || {};

app.initStart = async function()
{
    console.log("[App] Starting LIE Scorecard initialization...");

    // 1. Initialize core systems and wait for Firebase / app.db to be ready
    if (typeof app.initCore === 'function')
    {
        await app.initCore();
    }

    // 2. Load initial app data from Firestore
    try
    {
        const res = await app.logic.apiRequest('getInitialAppData');
        if (res && res.success)
        {
            app.state.spieler = res.spieler || [];
            app.state.spieltage = res.spieltage || [];
            app.state.scoreCards = res.scoreCards || [];
            app.state.flights = res.flights || [];
            app.state.kurse = res.kurse || [];
            app.state.golfplaetze = res.golfplaetze || [];
            app.state.bahnen = res.bahnen || [];
            app.state.handicaps = res.handicaps || [];
            app.state.kalenderTermine = res.kalenderTermine || []; // <--- Ergänzt
        }
    }
    catch (err)
    {
        console.error("[App] Error loading initial app data:", err);
    }

    // 3. Check for persisted user session in localStorage
    const savedUserId = localStorage.getItem('lie_scorecard_user_id');
    if (savedUserId && app.state.spieler)
    {
        const matchedUser = app.state.spieler.find(function(s)
        {
            return String(s.id).trim() === String(savedUserId).trim();
        });

        if (matchedUser)
        {
            app.state.currentUser = matchedUser;
            if (typeof app.logic.updateHeaderRoleIcon === 'function')
            {
                app.logic.updateHeaderRoleIcon();
            }
            
            // Route to PIN change if forced, otherwise straight to dashboard
            if (matchedUser.mustChangePin)
            {
                app.router.navigate('pin_aendern');
            }
            else
            {
                app.router.navigate('dashboard');
            }
            return;
        }
    }

    // 4. Default fallback to login view if no valid session exists
    app.router.navigate('login');
};

// Auto-trigger startup when DOM is fully loaded
window.addEventListener('DOMContentLoaded', function()
{
    if (typeof app.initStart === 'function')
    {
        app.initStart();
    }
});

