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
    if (app.environment) return; // No SW registration or cache reuse in local mode.
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

    // Contract failures escape before the legacy login-list fallback can run.
    try
    {
        if (window.LIE_PREPROD_PROFILE && window.LIE_LOCAL_PROFILE) throw new Error('Mixed startup profiles.');
        app.environment = LieEnvironment.create(window.LIE_PREPROD_PROFILE || window.LIE_LOCAL_PROFILE, window.firebaseConfig,
            window.location, firebase, async function(profile)
            {
                // PreProd uses its separate strict HTTPS/project adapter, not
                // the loopback readiness service. The local adapter is unchanged.
                if (profile.mode === 'preprod') return;
                if (navigator.serviceWorker && navigator.serviceWorker.controller)
                    throw new Error('Use a fresh local browser profile: active service worker.');
                const response = await fetch('/__local/ready', {cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(3000)});
                const actual = await response.json();
                if (!response.ok || JSON.stringify(actual) !== JSON.stringify(profile))
                    throw new Error('Local emulator readiness mismatch.');
            });
        await app.initCore();
    }
    catch (error)
    {
        document.getElementById('app-container').textContent = 'Anwendungsstart gesperrt: ' + error.message;
        return;
    }
    app.logic.registerServiceWorker();

    try
    {
        app.environment.assertReady();


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

        if (authUser && navigator.onLine === false && app.openOfflineScoreEntryV2
            && await app.openOfflineScoreEntryV2(authUser))
        {
            return;
        }

        let claims = {};

        if (authUser)
        {
            claims = await app.logic.readPlayerSessionState(authUser);
        }

        // Nach einem Seitenwechsel bleibt die Firebase-Session erhalten.
        // Nur wenn bereits ein gültiger Spieler-Claim vorhanden ist, wird die App direkt geöffnet.
        if (claims.playerId)
        {
            if (claims.mustChangePin) await app.logic.loadLoginPlayers();
            else await app.logic.apiRequest('getInitialAppData');

            const savedUserId = String(claims.playerId);
            const matchedUser = (app.state.spieler || []).find(function(s)
            {
                return String(s.id).trim() === savedUserId.trim();
            });

            if (matchedUser)
            {
                app.state.currentUser = matchedUser;
                app.state.currentUser.mustChangePin = !!claims.mustChangePin;
                app.state.currentUser.role = claims.role;

                localStorage.setItem('lie_scorecard_user_id', savedUserId);

                if (typeof app.logic.updateHeaderRoleIcon === 'function')
                {
                    app.logic.updateHeaderRoleIcon();
                }

                if(!claims.mustChangePin && app.logic.resumeScoreAutoSyncV2)app.logic.resumeScoreAutoSyncV2().catch(()=>{});
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




