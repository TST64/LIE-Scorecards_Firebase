// =========================================================================
// BMAssistent / LIE Scorecard - Server Communication & Bridge Layer
// App_Logic_Bridge.js
// BSD (Allman) Style
// =========================================================================

window.google = window.google || {};
window.google.script = {
    run: {
        withSuccessHandler: function(cb) { this.successCb = cb; return this; },
        withFailureHandler: function(cb) { this.failureCb = cb; return this; },
        __call: function(action, args) {
            console.log(`[BRIDGE] Weiterleitung an API: ${action}`);
            const payload = args.length > 0 ? args[0] : {};
            
            app.logic.apiRequest(action, payload).then(res => {
                if (res.success) { 
                    if (this.successCb) this.successCb(res); 
                } else { 
                    console.error(`[BRIDGE Error] ${action}:`, res.error);
                    if (this.failureCb) this.failureCb(res.error); 
                }
            });
            return this;
        }
    }
};

// Proxy für legacy google.script.run
google.script.run = new Proxy(google.script.run, {
    get: function(target, prop) {
        if (prop === 'withSuccessHandler' || prop === 'withFailureHandler' || prop === 'successCb' || prop === 'failureCb') return target[prop];
        return function(...args) { return target.__call(prop, args); };
    }
});

// Basis-Namespace
app.logic = app.logic || {};

// API Interface via JSONP
app.logic.apiRequest = function(action, payload = {})
{
    console.log(`[API Request] Action: ${action}`);

    return new Promise((resolve, reject) => 
    {
        if (typeof CONFIG === "undefined" || !CONFIG.API_URL) 
        {
            console.error("[API Error] CONFIG oder CONFIG.API_URL ist nicht definiert!");
            app.logic.showToast("Konfigurationsfehler: API_URL fehlt", "error");
            return resolve({ success: false, error: "CONFIG fehlt" });
        }

        const callbackName = "gas_callback_" + Math.random().toString(36).substring(2, 15);
        
        window[callbackName] = function(data) 
        {
            document.body.removeChild(script);
            delete window[callbackName];
            resolve(data);
        };

        const dataPayload = JSON.stringify({ action: action, ...payload });
        const finalUrl = `${CONFIG.API_URL}?callback=${callbackName}&data=${encodeURIComponent(dataPayload)}`;

        const script = document.createElement("script");
        script.src = finalUrl;
        script.onerror = function() 
        {
            document.body.removeChild(script);
            delete window[callbackName];
            console.error("[API Error] JSONP-Request fehlgeschlagen.");
            app.logic.showToast("Server-Verbindungsfehler", "error");
            resolve({ success: false, error: "Verbindungsfehler" });
        };

        document.body.appendChild(script);
    });
};

// Globaler Daten-Refresh
app.logic.refreshGlobalAppData = async function()
{
    const icon = document.getElementById('global-refresh-icon');
    const btn = document.getElementById('global-refresh-btn');
    
    if (btn && icon)
    {
        btn.disabled = true;
        icon.classList.add('fa-spin');
    }

    try 
    {
        const response = await app.logic.apiRequest('getInitialAppData');
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

            if (app.state.currentUser)
            {
                const freshUserMatch = app.state.spieler.find(function(s) 
                { 
                    return String(s.id).trim() === String(app.state.currentUser.id).trim(); 
                });
                
                if (freshUserMatch)
                {
                    app.state.currentUser = freshUserMatch;
                }
            }

            app.router.updateNavigationUI(app.state.currentView);
            app.logic.updateHeaderRoleIcon();
            app.router.navigate(app.state.currentView);
        }
    } 
    catch (err) 
    {
        console.error("Fehler beim Hintergrund-Refresh:", err);
        app.logic.showToast("Daten konnten nicht aktualisiert werden. Offline?", "error");
    }
    finally 
    {
        setTimeout(function()
        {
            if (btn && icon)
            {
                btn.disabled = false;
                icon.classList.remove('fa-spin');
            }
        }, 500);
    }
};

// Polling Steuerung
app.logic.startLivePolling = function(spieltagId, holeNr, flightSeq)
{
    app.logic.stopLivePolling();

    const triggerUpdate = function()
    {
        const statusDot = document.getElementById('connection-status');
        if (statusDot)
        {
            statusDot.className = "w-3 h-3 rounded-full bg-amber-400";
        }

        app.logic.apiRequest('getLiveScoreUpdates', { spieltagId: spieltagId })
            .then(function(response)
            {
                if (statusDot)
                {
                    statusDot.className = "w-3 h-3 rounded-full bg-emerald-400";
                }

                if (response && response.success)
                {
                    const otherRoundScores = app.state.scoreCards.filter(function(sc)
                    {
                        return String(sc.spieltagId).trim() !== String(spieltagId).trim();
                    });
                    app.state.scoreCards = otherRoundScores.concat(response.scoreCards || []);

                    if (response.pollingRate && response.pollingRate !== app.state.currentPollingRate)
                    {
                        app.state.currentPollingRate = response.pollingRate;
                        app.logic.startLivePolling(spieltagId, holeNr, flightSeq);
                    }

                    const container = document.getElementById('app-container');
                    if (container)
                    {
                        if (app.state.currentView === 'leaderboard')
                        {
                            const activeTab = document.querySelector('[onclick*="brutto"]')?.classList.contains('bg-white') ? 'brutto' : 'netto';
                            container.innerHTML = app.views.leaderboard(spieltagId, activeTab);
                        }
                        else if (app.state.currentView === 'score_eingabe' && holeNr)
                        {
                            const ungesicherteAenderungen = Object.keys(app.state.liveScores).filter(function(k)
                            {
                                return k.startsWith(spieltagId + "_");
                            }).length;

                            if (ungesicherteAenderungen === 0)
                            {
                                container.innerHTML = app.views.score_eingabe(spieltagId, holeNr, flightSeq);
                            }
                        }
                    }
                }
            })
            .catch(function(err)
            {
                if (statusDot)
                {
                    statusDot.className = "w-3 h-3 rounded-full bg-red-400";
                }
                console.warn("Polling-Update fehlgeschlagen:", err);
            });
    };

    const msInterval = (app.state.currentPollingRate || 60) * 1000;
    app.state.pollingIntervalId = setInterval(triggerUpdate, msInterval);
};

app.logic.stopLivePolling = function()
{
    if (app.state.pollingIntervalId)
    {
        clearInterval(app.state.pollingIntervalId);
        app.state.pollingIntervalId = null;
    }
};