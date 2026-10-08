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

    app.logic.registerServiceWorker();

    try
    {
        if (typeof app.initCore === 'function')
        {
            await app.initCore();
        }


        // Nach einem Reload muss Firebase Auth zunächst die gespeicherte
        // Sitzung aus dem Browser wiederherstellen. currentUser kann direkt
        // nach der Initialisierung noch kurzzeitig null sein.
        const authUser = await new Promise(function(resolve)
        {
            let unsubscribe = null;

            unsubscribe = firebase.auth().onAuthStateChanged(
                function(user)
                {
                    if (unsubscribe)
                    {
                        unsubscribe();
                    }

                    resolve(user);
                },
                function(error)
                {
                    console.error("[Auth] Wiederherstellung der Sitzung fehlgeschlagen:", error);

                    if (unsubscribe)
                    {
                        unsubscribe();
                    }

                    resolve(null);
                }
            );
        });

        let claims = {};

        if (authUser)
        {
            const tokenResult = await authUser.getIdTokenResult();
            claims = tokenResult.claims || {};
        }

        // Nach einem Seitenwechsel bleibt die Firebase-Session erhalten.
        // Nur wenn bereits ein gültiger Spieler-Claim vorhanden ist, wird die App direkt geöffnet.
        if (claims.playerId)
        {
            await app.logic.apiRequest('getInitialAppData');

            const savedUserId = String(claims.playerId);
            const matchedUser = (app.state.spieler || []).find(function(s)
            {
                return String(s.id).trim() === savedUserId.trim();
            });

            if (matchedUser)
            {
                app.state.currentUser = matchedUser;
                app.state.currentUser.mustChangePin = !!claims.mustChangePin;

                localStorage.setItem('lie_scorecard_user_id', savedUserId);

                if (typeof app.logic.updateHeaderRoleIcon === 'function')
                {
                    app.logic.updateHeaderRoleIcon();
                }

                if (claims.mustChangePin)
                {
                    app.router.navigate('pin_aendern');
                }
                else
                {
                    app.router.navigate('dashboard');
                }
                return;
            }

            await firebase.auth().signOut();
        }

        // Vor dem Login werden ausschließlich die für die Namensauswahl notwendigen
        // öffentlichen Spielerdaten geladen.
        await app.logic.loadLoginPlayers();
        localStorage.removeItem('lie_scorecard_user_id');
        app.state.currentUser = null;
        app.router.navigate('login');
    }
    catch (err)
    {
        console.error("[App] Initialisierung fehlgeschlagen:", err);
        app.logic.showToast("Die App konnte nicht vollständig gestartet werden.", "error");
        try
        {
            await app.logic.loadLoginPlayers();
            app.router.navigate('login');
        }
        catch (loginErr)
        {
            console.error("[App] Login-Liste konnte nicht geladen werden:", loginErr);
        }
    }
};




