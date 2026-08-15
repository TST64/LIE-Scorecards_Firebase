// =========================================================================
// BMAssistent / LIE Scorecard - Spieltag Anlegen & Flight-Auslosung
// Views_SpieltagNeu.js
// BSD (Allman) Style
// =========================================================================

app.views.spieltag_neu = function()
{
    // Heutiges Datum als Standard festlegen (YYYY-MM-DD)
    const today = new Date().toISOString().split('T')[0];

    // Kurse für Dropdown aufbereiten
    let kurseOptionsHtml = "";
    if (app.state.kurse && app.state.kurse.length > 0)
    {
        kurseOptionsHtml = app.state.kurse.map(function(k)
        {
            const platz = app.state.golfplaetze ? app.state.golfplaetze.find(function(p) { return String(p.id) === String(k.platzId); }) : null;
            const platzName = platz ? platz.name : "";
            return `<option value="${k.id}">${platzName} - ${k.name}</option>`;
        }).join('');
    }

    // Spieler-Auswahl-Checkboxes generieren (Standardmäßig alle abgewählt)
    let spielerCheckboxesHtml = "";
    if (app.state.spieler && app.state.spieler.length > 0)
    {
        spielerCheckboxesHtml = app.state.spieler.map(function(s)
        {
            return `
                <label class="flex items-center space-x-3 p-2 bg-stone-50 border border-stone-200 rounded-xl cursor-pointer hover:bg-stone-100 transition">
                    <input type="checkbox" name="teilnehmer" value="${s.id}" onchange="app.logic.renderAvailablePlayerChips()" class="w-4 h-4 text-emerald-600 rounded border-stone-300 focus:ring-emerald-500">
                    <span class="text-xs font-semibold text-stone-800">${s.name} (${s.nickname})</span>
                </label>
            `;
        }).join('');
    }

    return `
        <div class="space-y-5 pb-12">
            <!-- Header -->
            <div class="flex items-center space-x-2">
                <button onclick="app.router.navigate('spieltage')" class="text-stone-500 touch-target"><i class="fas fa-arrow-left"></i></button>
                <div>
                    <h2 class="text-lg font-bold text-stone-800">Neuen Spieltag anlegen</h2>
                    <p class="text-xs text-stone-400 -mt-1">Runde planen & Flights zusammenstellen</p>
                </div>
            </div>

            <!-- Formular Container -->
            <div class="bg-white border border-stone-200 rounded-2xl p-4 shadow-2xs space-y-4">
                
                <!-- Datum & Kurs -->
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div class="flex flex-col space-y-1">
                        <label class="text-[10px] font-bold text-stone-500 uppercase">Datum</label>
                        <input type="date" id="new-spieltag-date" value="${today}" class="bg-stone-50 border border-stone-200 text-xs rounded-xl px-3 py-2.5 focus:border-emerald-600 outline-none font-semibold">
                    </div>
                    <div class="flex flex-col space-y-1">
                        <label class="text-[10px] font-bold text-stone-500 uppercase">Golfplatz / Kurs</label>
                        <select id="new-spieltag-kurs" class="bg-stone-50 border border-stone-200 text-xs rounded-xl px-3 py-2.5 focus:border-emerald-600 outline-none font-semibold">
                            ${kurseOptionsHtml}
                        </select>
                    </div>
                </div>

                <!-- Modus-Auswahl (Zufall vs Manuell) -->
                <div class="flex flex-col space-y-1 pt-2 border-t border-stone-100">
                    <label class="text-[10px] font-bold text-stone-500 uppercase">Flight-Einteilung</label>
                    <div class="grid grid-cols-2 gap-2 p-1 bg-stone-100 rounded-xl border border-stone-200">
                        <label class="flex items-center justify-center p-2 rounded-lg cursor-pointer text-xs font-bold text-stone-700 space-x-1.5 has-[:checked]:bg-white has-[:checked]:shadow-2xs has-[:checked]:text-emerald-800">
                            <input type="radio" name="flight-mode" value="auto" checked onchange="app.logic.toggleFlightMode()" class="hidden">
                            <i class="fas fa-dice"></i>
                            <span>Zufall / Loosen</span>
                        </label>
                        <label class="flex items-center justify-center p-2 rounded-lg cursor-pointer text-xs font-bold text-stone-700 space-x-1.5 has-[:checked]:bg-white has-[:checked]:shadow-2xs has-[:checked]:text-emerald-800">
                            <input type="radio" name="flight-mode" value="manual" onchange="app.logic.toggleFlightMode()" class="hidden">
                            <i class="fas fa-hand-pointer"></i>
                            <span>Manuell</span>
                        </label>
                    </div>
                </div>

                <!-- Teilnehmer-Auswahl -->
                <div class="flex flex-col space-y-2 pt-2 border-t border-stone-100">
                    <label class="text-[10px] font-bold text-stone-500 uppercase">Teilnehmer auswählen</label>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto p-1">
                        ${spielerCheckboxesHtml}
                    </div>
                </div>

                <!-- BEREICH A: Automatische Auslosung -->
                <div id="auto-flight-section" class="space-y-3 pt-2 border-t border-stone-100">
                    <label class="text-[10px] font-bold text-stone-500 uppercase">Gewünschte Flight-Größe</label>
                    
                    <!-- NEU: Standard-Aufteilung als Default -->
                    <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <label class="flex items-center space-x-2 p-2 bg-stone-50 border border-stone-200 rounded-xl cursor-pointer hover:bg-stone-100 transition text-xs font-semibold text-stone-800">
                            <input type="radio" name="flight-size" value="standard" checked class="text-emerald-600 focus:ring-emerald-500">
                            <span>Standard (Optimiert)</span>
                        </label>
                        <label class="flex items-center space-x-2 p-2 bg-stone-50 border border-stone-200 rounded-xl cursor-pointer hover:bg-stone-100 transition text-xs font-semibold text-stone-800">
                            <input type="radio" name="flight-size" value="2" class="text-emerald-600 focus:ring-emerald-500">
                            <span>Nur 2er Flights</span>
                        </label>
                        <label class="flex items-center space-x-2 p-2 bg-stone-50 border border-stone-200 rounded-xl cursor-pointer hover:bg-stone-100 transition text-xs font-semibold text-stone-800">
                            <input type="radio" name="flight-size" value="3" class="text-emerald-600 focus:ring-emerald-500">
                            <span>Nur 3er Flights</span>
                        </label>
                        <label class="flex items-center space-x-2 p-2 bg-stone-50 border border-stone-200 rounded-xl cursor-pointer hover:bg-stone-100 transition text-xs font-semibold text-stone-800">
                            <input type="radio" name="flight-size" value="4" class="text-emerald-600 focus:ring-emerald-500">
                            <span>Nur 4er Flights</span>
                        </label>
                    </div>

                    <button onclick="app.logic.previewFlights()" class="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-xl transition text-sm shadow-xs">
                        <i class="fas fa-random mr-1"></i> Flights auslosen
                    </button>
                </div>

                <!-- Vorschau-Container für Zufalls-Flights -->
                <div id="flight-preview-container" class="hidden space-y-2 pt-2 border-t border-stone-100"></div>

                <!-- BEREICH B: Manuelle Flight-Zuweisung -->
                <div id="manual-flight-section" class="hidden space-y-3 pt-2 border-t border-stone-100">
                    <div class="flex justify-between items-center">
                        <span class="text-[10px] font-bold text-stone-500 uppercase">Verfügbare Spieler</span>
                    </div>
                    <div id="available-players-chips" class="flex flex-wrap gap-1.5 p-2 bg-stone-50 border border-stone-200 rounded-xl min-h-[42px]"></div>

                    <div class="flex justify-between items-center pt-2">
                        <span class="text-[10px] font-bold text-stone-500 uppercase">Flights Konfiguration</span>
                        <button onclick="app.logic.addEmptyManualFlight()" class="text-xs text-emerald-700 font-bold hover:underline">
                            <i class="fas fa-plus-circle"></i> Flight hinzufügen
                        </button>
                    </div>
                    
                    <div id="manual-flights-builder" class="space-y-3"></div>

                    <button onclick="app.logic.saveManualFlights()" class="w-full bg-stone-900 hover:bg-stone-800 text-white font-bold py-3 rounded-xl transition text-sm shadow-xs mt-2">
                        <i class="fas fa-check-circle mr-1"></i> Spieltag & Flights speichern
                    </button>
                </div>

            </div>
        </div>
    `;
};