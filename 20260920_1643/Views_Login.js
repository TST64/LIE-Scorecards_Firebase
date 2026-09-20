// =========================================================================
// BMAssistent / LIE Scorecard - Login & PIN-Änderung Ansichten
// Views_Login.js
// BSD (Allman) Style
// =========================================================================

// Kapselt die Login-Ansicht im app.views Namespace
app.views.login = function()
{
    // Generiere die Optionen für das Spieler-Dropdown
    const spielerOptionen = app.state.spieler.map(function(s)
    {
        return `<option value="${s.id}">${s.nickname} (${s.name})</option>`;
    }).join('');

    return `
        <div class="space-y-6 pt-6 flex flex-col justify-center min-h-[70vh]">
            <div class="text-center space-y-2">
                <div class="w-16 h-16 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center text-2xl mx-auto shadow-2xs">
                    <i class="fas fa-lock"></i>
                </div>
                <h2 class="text-xl font-black text-stone-800 tracking-wide">LIE Clubhaus Login</h2>
                <p class="text-xs text-stone-400 max-w-xs mx-auto">Wähle deinen Namen aus und gib deine persönliche PIN ein, um Scores zu erfassen.</p>
            </div>

            <div class="bg-stone-50 border border-stone-200 rounded-2xl p-5 shadow-2xs space-y-4">
                <div class="flex flex-col space-y-1">
                    <label class="text-xs font-bold text-stone-500 uppercase">Wer bist du?</label>
                    <select id="loginSpielerSelect" class="w-full bg-white border border-stone-200 rounded-xl px-3 py-3 text-sm focus:border-emerald-600 outline-none shadow-3xs font-medium">
                        <option value="" disabled selected>Namen auswählen...</option>
                        ${spielerOptionen}
                    </select>
                </div>

                <div class="flex flex-col space-y-1">
                    <label class="text-xs font-bold text-stone-500 uppercase">Deine PIN / E-Mail-Code</label>
                    <input type="password" id="loginPinInput" inputmode="numeric" pattern="[0-9]*" maxlength="6" placeholder="••••••" class="w-full bg-white border border-stone-200 rounded-xl px-4 py-3 text-center text-xl tracking-widest font-black focus:border-emerald-600 outline-none shadow-3xs">
                </div>

                <button onclick="app.logic.submitPin(event)" id="loginSubmitBtn" class="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3.5 rounded-xl transition text-sm shadow-xs mt-2 flex items-center justify-center space-x-2 touch-target">
                    <i class="fas fa-sign-in-alt"></i>
                    <span>Einloggen</span>
                </button>

                <div class="pt-2 text-center">
                    <button type="button" onclick="app.logic.requestMailPin()" id="reqMailPinBtn" class="text-stone-500 hover:text-emerald-700 text-xs font-semibold underline transition">
                        <i class="fas fa-paper-plane mr-1"></i> PIN vergessen / Code per Mail anfordern
                    </button>
                </div>
            </div>
        </div>
    `;
};

// Ansicht für die Zwangseingabe/Änderung einer persönlichen PIN
app.views.pin_aendern = function()
{
    const user = app.state.currentUser;
    const nickname = user ? user.nickname : "Golfer";

    return `
        <div class="space-y-6 pt-6 flex flex-col justify-center min-h-[70vh]">
            <div class="text-center space-y-2">
                <div class="w-16 h-16 bg-amber-100 text-amber-700 rounded-full flex items-center justify-center text-2xl mx-auto shadow-2xs">
                    <i class="fas fa-key"></i>
                </div>
                <h2 class="text-xl font-black text-stone-800 tracking-wide">PIN festlegen</h2>
                <p class="text-xs text-stone-400 max-w-xs mx-auto">Hallo ${nickname}! Bitte vergebe deine persönliche, 4-stellige PIN für künftige Logins.</p>
            </div>

            <div class="bg-stone-50 border border-stone-200 rounded-2xl p-5 shadow-2xs space-y-4">
                <div class="flex flex-col space-y-1">
                    <label class="text-xs font-bold text-stone-500 uppercase">Neue PIN (min. 4 Zahlen)</label>
                    <input type="password" id="pin-new-1" inputmode="numeric" pattern="[0-9]*" maxlength="6" placeholder="••••" class="w-full bg-white border border-stone-200 rounded-xl px-4 py-3 text-center text-xl tracking-widest font-black focus:border-emerald-600 outline-none shadow-3xs">
                </div>

                <div class="flex flex-col space-y-1">
                    <label class="text-xs font-bold text-stone-500 uppercase">PIN wiederholen</label>
                    <input type="password" id="pin-new-2" inputmode="numeric" pattern="[0-9]*" maxlength="6" placeholder="••••" class="w-full bg-white border border-stone-200 rounded-xl px-4 py-3 text-center text-xl tracking-widest font-black focus:border-emerald-600 outline-none shadow-3xs">
                </div>

                <button onclick="app.logic.changePin()" id="change-pin-btn" class="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3.5 rounded-xl transition text-sm shadow-xs mt-2 flex items-center justify-center space-x-2 touch-target">
                    <i class="fas fa-save"></i>
                    <span>PIN dauerhaft speichern</span>
                </button>
            </div>
        </div>
    `;
};

// Hilfsfunktion zum Anfordern des Einmal-Codes im Frontend
app.logic.requestMailPin = function()
{
    const spielerId = document.getElementById('loginSpielerSelect')?.value;

    if (!spielerId)
    {
        app.logic.showToast("Bitte wähle zuerst deinen Namen im Dropdown aus!", "info");
        return;
    }

    const btn = document.getElementById('reqMailPinBtn');
    if (btn)
    {
        btn.disabled = true;
        btn.innerHTML = `<i class="fas fa-spinner fa-spin mr-1"></i> Sende E-Mail...`;
    }

    app.logic.apiRequest('requestTempPin', { spielerId: spielerId })
        .then(function(response)
        {
            if (response && response.success)
            {
                app.logic.showToast("Einmal-Code per E-Mail gesendet! Bitte prüfe dein Postfach.", "success");
            }
            else
            {
                app.logic.showToast("Fehler beim Senden: " + (response.error || "Unbekannt"), "error");
            }

            if (btn)
            {
                btn.disabled = false;
                btn.innerHTML = `<i class="fas fa-paper-plane mr-1"></i> PIN vergessen / Code per Mail anfordern`;
            }
        })
        .catch(function(err)
        {
            app.logic.showToast("Netzwerkfehler: " + err.message, "error");
            if (btn)
            {
                btn.disabled = false;
                btn.innerHTML = `<i class="fas fa-paper-plane mr-1"></i> PIN vergessen / Code per Mail anfordern`;
            }
        });
};