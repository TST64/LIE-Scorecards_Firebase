// =========================================================================
// BMAssistent / LIE Scorecard - Application Startup & Lifecycle
// App_Start.js
// BSD (Allman) Style
// =========================================================================

var app = app || {};
app.logic = app.logic || {};

// Registrierung des Service Workers für PWA-Installation und automatische Updates
app.logic.registerServiceWorker = function()
{
    if ('serviceWorker' in navigator)
    {
        navigator.serviceWorker.register('./sw.js')
            .then(function(registration)
            {
                // Erzwinge eine Update-Prüfung bei jedem Start der App
                registration.update();

                // Prüfe erneut auf Updates, wenn der Anwender das Smartphone entsperrt oder zur App zurückkehrt
                document.addEventListener('visibilitychange', function()
                {
                    if (document.visibilityState === 'visible')
                    {
                        registration.update();
                    }
                });
            })
            .catch(function(err)
            {
                console.error('[SW] Registrierung fehlgeschlagen:', err);
            });

        // Wenn auf GitHub eine neue Version hochgeladen und der SW aktualisiert wurde, Seite neu laden
        let refreshing = false;
        navigator.serviceWorker.addEventListener('controllerchange', function()
        {
            if (!refreshing)
            {
                refreshing = true;
                if (typeof app.logic.showToast === 'function')
                {
                    app.logic.showToast("Neue App-Version geladen! Aktualisiere...", "success");
                }
                setTimeout(function()
                {
                    window.location.reload();
                }, 800);
            }
        });
    }
};

app.initStart = async function()
{
    console.log("[App] Starting LIE Scorecard initialization...");

    // 1. Service Worker für PWA-Installierbarkeit & Auto-Updates registrieren
    app.logic.registerServiceWorker();

    // 2. Initialize core systems and wait for Firebase / app.db to be ready
    if (typeof app.initCore === 'function')
    {
        await app.initCore();
    }

    // 3. Load initial app data from Firestore
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
            app.state.kalenderTermine = res.kalenderTermine || [];
        }
    }
    catch (err)
    {
        console.error("[App] Error loading initial app data:", err);
    }

    // 4. Check for persisted user session in localStorage
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

    // 5. Default fallback to login view if no valid session exists
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

// Saison-Datum aus Config laden
if (app.db && typeof app.db.collection === 'function')
{
    app.db.collection('config').doc('saison').get().then(
        function(doc)
        {
            if (doc.exists)
            {
                app.state.saisonStartDatum = doc.data().saisonStartDatum || '2026-10-01';
            }
            else
            {
                app.state.saisonStartDatum = '2026-10-01';
            }
        }
    ).catch(
        function()
        {
            app.state.saisonStartDatum = '2026-10-01';
        }
    );
}