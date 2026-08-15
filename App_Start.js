// =========================================================================
// BMAssistent / LIE Scorecard - Startup Bootstrapper
// App_Start.html
// BSD (Allman) Style
// =========================================================================

app.onDataLoaded = function(response)
{
    const statusDot = document.getElementById('connection-status');
    
    if (response && response.success === true)
    {
        app.state.spieler = response.spieler || [];
        app.state.golfplaetze = response.golfplaetze || [];
        app.state.kurse = response.kurse || [];
        app.state.bahnen = response.bahnen || [];
        app.state.handicaps = response.handicaps || [];
        app.state.spieltage = response.spieltage || [];
        app.state.scoreCards = response.scoreCards || [];
        app.state.flights = response.flights || [];

        if (statusDot)
        {
            statusDot.className = "w-3 h-3 rounded-full bg-emerald-400";
        }

        // === AUTOMATISCHER LOGIN-CHECK PER LOCALSTORAGE ===
        const gespeicherteSpielerId = localStorage.getItem('lie_scorecard_user_id');
        let autoLoginErfolgreich = false;

        if (gespeicherteSpielerId)
        {
            const gefundenesProfil = app.state.spieler.find(function(s) 
            { 
                return String(s.id).trim() === String(gespeicherteSpielerId).trim(); 
            });

            if (gefundenesProfil)
            {
                app.state.currentUser = gefundenesProfil;
                autoLoginErfolgreich = true;
                
                setTimeout(function()
                {
                    app.router.navigate('dashboard');
                    app.logic.updateHeaderRoleIcon();
                }, 10);
            }
        }

        if (!autoLoginErfolgreich)
        {
            setTimeout(function()
            {
                app.router.navigate('login');
                app.logic.updateHeaderRoleIcon();
            }, 10);
        }
    }
    else
    {
        if (statusDot) 
        {
            statusDot.className = "w-3 h-3 rounded-full bg-red-500";
        }
        
        const container = document.getElementById('app-container');
        if (container)
        {
            container.innerHTML = `
                <div class="p-6 bg-red-50 text-red-800 rounded-2xl border border-red-200 space-y-2">
                    <h3 class="font-bold text-base"><i class="fas fa-exclamation-triangle"></i> Kritischer Ladefehler</h3>
                    <p class="text-xs">Die App-Datenbank konnte nicht geladen werden. Bitte wende dich an die Spielleitung.</p>
                    <pre class="bg-white p-2 rounded text-[10px] overflow-x-auto border border-red-100">${response ? response.error : 'Unbekannter Fehler'}</pre>
                </div>
            `;
        }
    }
};

// Start-Trigger zur Datenakquise (Sicher für dynamisches Skript-Laden)
app.initStart = function()
{
    const splashImg = document.getElementById('splash-logo');
    if (splashImg && app.logoString)
    {
        splashImg.src = app.logoString;
        splashImg.classList.remove('hidden'); 
    }

    // Visueller Hinweis, falls Google Apps Script einen Kaltstart (Cold Start) hat
    setTimeout(function() {
        const splashElement = document.getElementById('app-loading');
        if (splashElement && (!app.state || !app.state.spieler)) {
            console.warn("[START] GAS-Antwort lässt auf sich warten (Kaltstart)...");
            const label = splashElement.querySelector('p');
            if (label) {
                label.textContent = "Verbindung zum Server dauert etwas... (Kaltstart)";
            }
        }
    }, 4000);

    // 1. Wenn direkt in der GAS-Umgebung gehostet (HTML Service)
    if (typeof google !== 'undefined' && google.script && google.script.run)
    {
        google.script.run
            .withSuccessHandler(app.onDataLoaded)
            .withFailureHandler(function(err)
            {
                app.onDataLoaded({ success: false, error: "Netzwerk-Timeout beim Start:\n" + err.toString() });
            })
            .getInitialAppData();
    }
    // 2. Wenn über Web / GitHub Pages (über App_Logic_Bridge.js und config.js)
    else if (typeof app.logic !== 'undefined' && typeof app.logic.apiRequest === 'function')
    {
        console.log("[START] Lade initiale App-Daten über Bridge...");
        app.logic.apiRequest('getInitialAppData', {})
            .then(function(response) {
                console.log("[START] Daten erfolgreich von GAS empfangen:", response);
                app.onDataLoaded(response);
            })
            .catch(function(err) {
                console.error("[START] Fehler beim Laden der Init-Daten:", err);
                app.onDataLoaded({ 
                    success: false, 
                    error: "Fehler bei der Verbindung zu Google Apps Script:\n" + (err.message || err) 
                });
            });
    }
    else
    {
        app.onDataLoaded({ success: false, error: "Keine gültige API-Schnittstelle gefunden." });
    }
};

// Falls DOM bereits geladen ist (bei dynamischen Skripten), sofort ausführen, sonst auf Event warten:
if (document.readyState === 'complete' || document.readyState === 'interactive')
{
    app.initStart();
}
else
{
    document.addEventListener("DOMContentLoaded", app.initStart);
}