// =========================================================================
// BMAssistent / LIE Scorecard - Golfplätze, Bahnen & Erweitere WHS-Tabellen
// Views_Golfplaetze.js
// BSD (Allman) Style
// =========================================================================

app.views = app.views || {};

app.views.golfplaetze = function()
{
    const isAdmin = app.state.currentUser && app.state.currentUser.role === 'Admin';
    const plaetze = app.state.golfplaetze || [];

    let plaetzeCardsHtml = "";

    if (plaetze.length === 0)
    {
        plaetzeCardsHtml = `
            <div class="bg-white border border-zinc-200 rounded-3xl p-8 text-center space-y-3 shadow-xs col-span-full">
                <i class="fas fa-map-marked-alt text-emerald-600 text-3xl"></i>
                <p class="text-zinc-600 font-bold text-xs">Noch keine Golfplätze hinterlegt.</p>
                ${isAdmin ? '<p class="text-[11px] text-zinc-400">Klicke oben auf "Neuer Golfclub", um den ersten Platz hinzuzufügen.</p>' : ''}
            </div>
        `;
    }
    else
    {
        plaetzeCardsHtml = plaetze.map(
            function(platz)
            {
                if (platz.istGeloescht) return '';

                const kurse = (app.state.kurse || []).filter(
                    function(k)
                    {
                        return String(k.platzId) === String(platz.id) && !k.istGeloescht;
                    }
                );

                let kurseBadgeHtml = "";
                if (kurse.length > 0)
                {
                    kurseBadgeHtml = kurse.map(
                        function(k)
                        {
                            return `<span class="bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded-md text-[10px] font-bold">${k.name || '18-Loch Platz'} (${k.parTotal ? 'Par ' + k.parTotal : '18 Bahnen'})</span>`;
                        }
                    ).join(' ');
                }
                else
                {
                    kurseBadgeHtml = `<span class="bg-zinc-100 text-zinc-500 border border-zinc-200 px-2 py-0.5 rounded-md text-[10px] font-medium">Kein Kurs angelegt</span>`;
                }

                return `
                    <div class="bg-white border border-zinc-200 rounded-2xl p-5 shadow-xs hover:border-emerald-500/60 transition space-y-3 flex flex-col justify-between">
                        <div class="space-y-2">
                            <div class="flex justify-between items-start">
                                <div>
                                    <h3 class="font-black text-zinc-900 text-base leading-snug">${platz.name || 'Unbenannter Golfclub'}</h3>
                                    <p class="text-xs text-zinc-500 font-medium flex items-center gap-1.5 mt-0.5">
                                        <i class="fas fa-location-dot text-red-500 text-xs shrink-0"></i>
                                        <span>${platz.adresse || 'Keine Adresse angegeben'}</span>
                                    </p>
                                </div>
                            </div>

                            <div class="flex flex-wrap gap-1.5 pt-1">
                                ${kurseBadgeHtml}
                            </div>
                        </div>

                        <!-- KONTAKT & AKTIONEN -->
                        <div class="pt-3 border-t border-zinc-100 space-y-2.5">
                            <div class="grid grid-cols-2 gap-2 text-xs">
                                ${platz.telefon ? `
                                    <button onclick="app.logic.callGolfclub('${platz.telefon}', '${platz.name}')" class="bg-zinc-50 hover:bg-zinc-100 border border-zinc-200 text-zinc-800 py-2 px-2.5 rounded-xl font-bold flex items-center justify-center gap-1.5 transition touch-target">
                                        <i class="fas fa-phone text-emerald-600 text-xs"></i>
                                        <span class="truncate">Anrufen</span>
                                    </button>
                                ` : `
                                    <button disabled class="bg-zinc-50 border border-zinc-100 text-zinc-300 py-2 px-2.5 rounded-xl font-medium flex items-center justify-center gap-1.5 text-xs opacity-60">
                                        <i class="fas fa-phone text-zinc-300 text-xs"></i>
                                        <span>Keine Tel.</span>
                                    </button>
                                `}

                                ${platz.email ? `
                                    <a href="mailto:${platz.email}" class="bg-zinc-50 hover:bg-zinc-100 border border-zinc-200 text-zinc-800 py-2 px-2.5 rounded-xl font-bold flex items-center justify-center gap-1.5 transition touch-target truncate">
                                        <i class="fas fa-envelope text-blue-600 text-xs"></i>
                                        <span class="truncate">E-Mail</span>
                                    </a>
                                ` : `
                                    <button disabled class="bg-zinc-50 border border-zinc-100 text-zinc-300 py-2 px-2.5 rounded-xl font-medium flex items-center justify-center gap-1.5 text-xs opacity-60">
                                        <i class="fas fa-envelope text-zinc-300 text-xs"></i>
                                        <span>Keine Mail</span>
                                    </button>
                                `}
                            </div>

                            <div class="grid grid-cols-2 gap-2">
                                <button onclick="app.logic.openVorgabetabelleModal('${platz.id}')" class="bg-emerald-700 hover:bg-emerald-800 text-white py-2 px-2.5 rounded-xl font-bold text-xs transition flex items-center justify-center gap-1.5 shadow-2xs touch-target">
                                    <i class="fas fa-table-list"></i>
                                    <span>Vorgabetabelle</span>
                                </button>

                                <button onclick="app.logic.openGolfplatzEditModal('${platz.id}')" class="bg-zinc-100 hover:bg-zinc-200 text-zinc-800 py-2 px-2.5 rounded-xl font-bold text-xs transition flex items-center justify-center gap-1.5 touch-target">
                                    <i class="fas fa-pen text-zinc-500"></i>
                                    <span>Bearbeiten</span>
                                </button>
                            </div>

                            ${platz.website ? `
                                <div class="text-center pt-0.5">
                                    <a href="${platz.website.startsWith('http') ? platz.website : 'https://' + platz.website}" target="_blank" class="text-[11px] font-bold text-emerald-700 hover:underline inline-flex items-center gap-1">
                                        <i class="fas fa-globe text-[10px]"></i> Website besuchen <i class="fas fa-external-link-alt text-[9px]"></i>
                                    </a>
                                </div>
                            ` : ''}
                        </div>
                    </div>
                `;
            }
        ).join('');
    }

    return `
        <div class="space-y-5 max-w-4xl mx-auto pb-12 animate-fade-in">
            <!-- Header -->
            <div class="border-b border-zinc-200 pb-3 flex justify-between items-center">
                <div class="flex items-center space-x-2">
                    <button onclick="app.router.navigate('dashboard')" class="text-zinc-500 touch-target">
                        <i class="fas fa-arrow-left"></i>
                    </button>
                    <div>
                        <h2 class="text-lg font-black text-zinc-900 tracking-tight">Golfplätze & Clubs</h2>
                        <p class="text-xs text-zinc-400 font-medium -mt-0.5">Kontaktdaten, Abschläge (CR/Slope) & Stroke Index</p>
                    </div>
                </div>
                ${isAdmin ? `
                    <button onclick="app.logic.openGolfplatzEditModal(null)" class="bg-emerald-700 hover:bg-emerald-800 text-white px-3 py-1.5 rounded-xl text-xs font-bold shadow-xs transition flex items-center gap-1.5 touch-target">
                        <i class="fas fa-plus"></i>
                        <span>Neuer Golfclub</span>
                    </button>
                ` : ''}
            </div>

            <!-- GRID DER GOLFCLUBS -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                ${plaetzeCardsHtml}
            </div>

            <!-- MODAL: GOLFPLATZ EDIT / NEU -->
            <div id="golfplatz-edit-modal" class="fixed inset-0 z-50 bg-zinc-900/60 backdrop-blur-xs hidden flex items-center justify-center p-4">
                <div class="bg-white rounded-3xl max-w-2xl w-full p-6 space-y-4 shadow-2xl border border-zinc-100 max-h-[90vh] overflow-y-auto">
                    <div class="flex justify-between items-center border-b border-zinc-100 pb-3">
                        <h3 id="golfplatz-modal-title" class="font-black text-zinc-900 text-base">Golfclub bearbeiten</h3>
                        <button onclick="app.logic.closeGolfplatzModal()" class="text-zinc-400 hover:text-zinc-600 touch-target">
                            <i class="fas fa-times text-lg"></i>
                        </button>
                    </div>

                    <form id="golfplatz-form" onsubmit="app.logic.saveGolfplatzForm(event)" class="space-y-4">
                        <input type="hidden" id="modal-platz-id" value="">

                        <!-- STAMMDATEN -->
                        <div class="space-y-3">
                            <h4 class="font-extrabold text-xs text-zinc-900 uppercase tracking-wider flex items-center gap-1.5">
                                <i class="fas fa-building text-emerald-700"></i> Club-Stammdaten
                            </h4>

                            <div>
                                <label class="block text-[11px] font-extrabold text-zinc-500 uppercase tracking-wider mb-1">Club-Name *</label>
                                <input type="text" id="modal-platz-name" required class="w-full bg-zinc-50 border border-zinc-200 rounded-xl p-2.5 text-xs font-semibold text-zinc-800 focus:outline-none focus:border-emerald-600" placeholder="z.B. Golf-Club Bremer Schweiz e.V.">
                            </div>

                            <div>
                                <label class="block text-[11px] font-extrabold text-zinc-500 uppercase tracking-wider mb-1">Adresse</label>
                                <input type="text" id="modal-platz-adresse" class="w-full bg-zinc-50 border border-zinc-200 rounded-xl p-2.5 text-xs font-semibold text-zinc-800 focus:outline-none focus:border-emerald-600" placeholder="Straße, PLZ Ort">
                            </div>

                            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                <div>
                                    <label class="block text-[11px] font-extrabold text-zinc-500 uppercase tracking-wider mb-1">Telefonnummer</label>
                                    <input type="tel" id="modal-platz-telefon" class="w-full bg-zinc-50 border border-zinc-200 rounded-xl p-2.5 text-xs font-semibold text-zinc-800" placeholder="0421 681321">
                                </div>
                                <div>
                                    <label class="block text-[11px] font-extrabold text-zinc-500 uppercase tracking-wider mb-1">E-Mail</label>
                                    <input type="email" id="modal-platz-email" class="w-full bg-zinc-50 border border-zinc-200 rounded-xl p-2.5 text-xs font-semibold text-zinc-800" placeholder="info@club.de">
                                </div>
                                <div>
                                    <label class="block text-[11px] font-extrabold text-zinc-500 uppercase tracking-wider mb-1">Website</label>
                                    <input type="url" id="modal-platz-website" class="w-full bg-zinc-50 border border-zinc-200 rounded-xl p-2.5 text-xs font-semibold text-zinc-800" placeholder="https://www.club.de">
                                </div>
                            </div>
                        </div>

                        <!-- ABSCHLÄGE (CR & SLOPE WERTE) -->
                        <div class="pt-3 border-t border-zinc-100 space-y-3">
                            <h4 class="font-extrabold text-xs text-zinc-900 uppercase tracking-wider flex items-center gap-1.5">
                                <i class="fas fa-flag text-emerald-700"></i> Abschläge (CR & Slope Werte)
                            </h4>

                            <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                                <div class="bg-zinc-100 p-2 rounded-xl space-y-1">
                                    <span class="block text-[10px] font-black text-zinc-700 uppercase">Herren Weiß</span>
                                    <input type="number" step="0.1" id="modal-cr-herren-weiss" class="w-full bg-white border border-zinc-200 rounded-lg p-1.5 text-xs font-bold" placeholder="CR 71.2">
                                    <input type="number" id="modal-slope-herren-weiss" class="w-full bg-white border border-zinc-200 rounded-lg p-1.5 text-xs font-bold" placeholder="SR 127">
                                </div>

                                <div class="bg-amber-50 p-2 rounded-xl space-y-1 border border-amber-200/60">
                                    <span class="block text-[10px] font-black text-amber-900 uppercase">Herren Gelb</span>
                                    <input type="number" step="0.1" id="modal-cr-herren-gelb" class="w-full bg-white border border-amber-200 rounded-lg p-1.5 text-xs font-bold" placeholder="CR 71.2">
                                    <input type="number" id="modal-slope-herren-gelb" class="w-full bg-white border border-amber-200 rounded-lg p-1.5 text-xs font-bold" placeholder="SR 125">
                                </div>

                                <div class="bg-red-50 p-2 rounded-xl space-y-1 border border-red-200/60">
                                    <span class="block text-[10px] font-black text-red-900 uppercase">Herren Rot</span>
                                    <input type="number" step="0.1" id="modal-cr-herren-rot" class="w-full bg-white border border-red-200 rounded-lg p-1.5 text-xs font-bold" placeholder="CR 67.1">
                                    <input type="number" id="modal-slope-herren-rot" class="w-full bg-white border border-red-200 rounded-lg p-1.5 text-xs font-bold" placeholder="SR 113">
                                </div>

                                <div class="bg-orange-50 p-2 rounded-xl space-y-1 border border-orange-200/60">
                                    <span class="block text-[10px] font-black text-orange-900 uppercase">Herren Orange</span>
                                    <input type="number" step="0.1" id="modal-cr-herren-orange" class="w-full bg-white border border-orange-200 rounded-lg p-1.5 text-xs font-bold" placeholder="CR 62.4">
                                    <input type="number" id="modal-slope-herren-orange" class="w-full bg-white border border-orange-200 rounded-lg p-1.5 text-xs font-bold" placeholder="SR 105">
                                </div>
                            </div>

                            <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
                                <div class="bg-rose-50 p-2 rounded-xl space-y-1 border border-rose-200/60">
                                    <span class="block text-[10px] font-black text-rose-900 uppercase">Damen Rot</span>
                                    <input type="number" step="0.1" id="modal-cr-damen-rot" class="w-full bg-white border border-rose-200 rounded-lg p-1.5 text-xs font-bold" placeholder="CR 72.4">
                                    <input type="number" id="modal-slope-damen-rot" class="w-full bg-white border border-rose-200 rounded-lg p-1.5 text-xs font-bold" placeholder="SR 120">
                                </div>

                                <div class="bg-orange-50 p-2 rounded-xl space-y-1 border border-orange-200/60">
                                    <span class="block text-[10px] font-black text-orange-900 uppercase">Damen Orange</span>
                                    <input type="number" step="0.1" id="modal-cr-damen-orange" class="w-full bg-white border border-orange-200 rounded-lg p-1.5 text-xs font-bold" placeholder="CR 66.4">
                                    <input type="number" id="modal-slope-damen-orange" class="w-full bg-white border border-orange-200 rounded-lg p-1.5 text-xs font-bold" placeholder="SR 110">
                                </div>
                            </div>
                        </div>

                        <!-- BAHNEN 1 BIS 18 (PAR & SI) -->
                        <div class="pt-3 border-t border-zinc-100 space-y-3">
                            <div class="flex justify-between items-center">
                                <h4 class="font-extrabold text-xs text-zinc-900 uppercase tracking-wider flex items-center gap-1.5">
                                    <i class="fas fa-list-ol text-emerald-700"></i> Bahnen 1–18 (Par & Stroke Index)
                                </h4>
                                <span class="text-[10px] font-bold text-zinc-400">SI = Vorgabenrang</span>
                            </div>

                            <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 max-h-48 overflow-y-auto p-1 bg-zinc-50 rounded-2xl border border-zinc-200">
                                ${Array.from({ length: 18 }).map((_, idx) => {
                                    const holeNr = idx + 1;
                                    return `
                                        <div class="bg-white p-2 rounded-xl border border-zinc-200 space-y-1 shadow-2xs">
                                            <span class="block text-[10px] font-black text-emerald-800 text-center border-b border-zinc-100 pb-0.5">Bahn ${holeNr}</span>
                                            <div class="flex items-center gap-1">
                                                <span class="text-[9px] font-extrabold text-zinc-400">PAR</span>
                                                <input type="number" id="modal-hole-par-${holeNr}" class="w-full bg-zinc-50 rounded text-center text-xs font-bold p-1" value="4" min="3" max="5">
                                            </div>
                                            <div class="flex items-center gap-1">
                                                <span class="text-[9px] font-extrabold text-zinc-400">SI</span>
                                                <input type="number" id="modal-hole-si-${holeNr}" class="w-full bg-zinc-50 rounded text-center text-xs font-bold p-1" value="${holeNr}" min="1" max="18">
                                            </div>
                                        </div>
                                    `;
                                }).join('')}
                            </div>
                        </div>

                        <div class="pt-4 grid grid-cols-2 gap-2">
                            <button type="button" onclick="app.logic.closeGolfplatzModal()" class="bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-bold py-2.5 rounded-xl text-xs transition">
                                Abbrechen
                            </button>
                            <button type="submit" class="bg-emerald-700 hover:bg-emerald-800 text-white font-bold py-2.5 rounded-xl text-xs transition shadow-xs">
                                Speichern
                            </button>
                        </div>
                    </form>
                </div>
            </div>

            <!-- MODAL: VORGABETABELLE ANZEIGEN -->
            <div id="vorgabetabelle-modal" class="fixed inset-0 z-50 bg-zinc-900/60 backdrop-blur-xs hidden flex items-center justify-center p-4">
                <div class="bg-white rounded-3xl max-w-xl w-full p-6 space-y-4 shadow-2xl border border-zinc-100 max-h-[90vh] overflow-y-auto">
                    <div class="flex justify-between items-center border-b border-zinc-100 pb-3">
                        <div>
                            <h3 id="vorgabe-modal-platzname" class="font-black text-zinc-900 text-base">Vorgabetabelle</h3>
                            <p id="vorgabe-modal-kursname" class="text-xs text-zinc-400 font-medium">Course Handicaps nach WHS</p>
                        </div>
                        <button onclick="app.logic.closeVorgabetabelleModal()" class="text-zinc-400 hover:text-zinc-600 touch-target">
                            <i class="fas fa-times text-lg"></i>
                        </button>
                    </div>

                    <div id="vorgabetabelle-content" class="space-y-4">
                        <!-- Dynamischer Inhalt -->
                    </div>
                </div>
            </div>
        </div>
    `;
};

// ==========================================
// LOGIK FUNKTIONEN FÜR GOLFPLÄTZE
// ==========================================

app.logic.callGolfclub = function(telefonnummer, clubname)
{
    if (!telefonnummer) return;

    const cleanNumber = telefonnummer.replace(/[^0-9+]/g, '');

    app.logic.showConfirm(
        "Golfclub anrufen",
        `Möchtest du jetzt bei "${clubname}" (${telefonnummer}) anrufen?`,
        function()
        {
            window.location.href = `tel:${cleanNumber}`;
        }
    );
};

app.logic.openGolfplatzEditModal = function(platzId)
{
    const modal = document.getElementById('golfplatz-edit-modal');
    const title = document.getElementById('golfplatz-modal-title');
    const inputId = document.getElementById('modal-platz-id');
    const inputName = document.getElementById('modal-platz-name');
    const inputAdresse = document.getElementById('modal-platz-adresse');
    const inputTelefon = document.getElementById('modal-platz-telefon');
    const inputEmail = document.getElementById('modal-platz-email');
    const inputWebsite = document.getElementById('modal-platz-website');

    if (!modal) return;

    if (platzId)
    {
        const platz = (app.state.golfplaetze || []).find(function(p) { return String(p.id) === String(platzId); });
        const kurs = (app.state.kurse || []).find(function(k) { return String(k.platzId) === String(platzId); });

        if (title) title.innerText = "Golfclub bearbeiten";
        if (inputId) inputId.value = platzId;
        if (inputName) inputName.value = platz ? (platz.name || '') : '';
        if (inputAdresse) inputAdresse.value = platz ? (platz.adresse || '') : '';
        if (inputTelefon) inputTelefon.value = platz ? (platz.telefon || '') : '';
        if (inputEmail) inputEmail.value = platz ? (platz.email || '') : '';
        if (inputWebsite) inputWebsite.value = platz ? (platz.website || '') : '';

        // Abschläge setzen
        document.getElementById('modal-cr-herren-weiss').value = kurs ? (kurs.crHerrenWeiss || 71.2) : 71.2;
        document.getElementById('modal-slope-herren-weiss').value = kurs ? (kurs.slopeHerrenWeiss || 127) : 127;
        document.getElementById('modal-cr-herren-gelb').value = kurs ? (kurs.crHerrenGelb || 71.2) : 71.2;
        document.getElementById('modal-slope-herren-gelb').value = kurs ? (kurs.slopeHerrenGelb || 125) : 125;
        document.getElementById('modal-cr-herren-rot').value = kurs ? (kurs.crHerrenRot || 67.1) : 67.1;
        document.getElementById('modal-slope-herren-rot').value = kurs ? (kurs.slopeHerrenRot || 113) : 113;
        document.getElementById('modal-cr-herren-orange').value = kurs ? (kurs.crHerrenOrange || 62.4) : 62.4;
        document.getElementById('modal-slope-herren-orange').value = kurs ? (kurs.slopeHerrenOrange || 105) : 105;

        document.getElementById('modal-cr-damen-rot').value = kurs ? (kurs.crDamenRot || 72.4) : 72.4;
        document.getElementById('modal-slope-damen-rot').value = kurs ? (kurs.slopeDamenRot || 120) : 120;
        document.getElementById('modal-cr-damen-orange').value = kurs ? (kurs.crDamenOrange || 66.4) : 66.4;
        document.getElementById('modal-slope-damen-orange').value = kurs ? (kurs.slopeDamenOrange || 110) : 110;

        // Bahnen laden (falls vorhanden)
        const bahnen = (app.state.bahnen || []).filter(function(b) { return kurs && String(b.kursId) === String(kurs.id); });
        for (let i = 1; i <= 18; i++)
        {
            const bMatch = bahnen.find(function(b) { return parseInt(b.nr) === i; });
            const inputPar = document.getElementById(`modal-hole-par-${i}`);
            const inputSi = document.getElementById(`modal-hole-si-${i}`);
            if (inputPar) inputPar.value = bMatch ? bMatch.par : 4;
            if (inputSi) inputSi.value = bMatch ? bMatch.si : i;
        }
    }
    else
    {
        const isAdmin = app.state.currentUser && app.state.currentUser.role === 'Admin';
        if (!isAdmin)
        {
            if (typeof app.logic.showToast === 'function')
            {
                app.logic.showToast("Neue Golfplätze können nur vom Admin angelegt werden.", "error");
            }
            return;
        }

        if (title) title.innerText = "Neuen Golfclub anlegen";
        if (inputId) inputId.value = "";
        if (inputName) inputName.value = "";
        if (inputAdresse) inputAdresse.value = "";
        if (inputTelefon) inputTelefon.value = "";
        if (inputEmail) inputEmail.value = "";
        if (inputWebsite) inputWebsite.value = "";

        // Standard-Defaults (z.B. Bremer Schweiz)
        document.getElementById('modal-cr-herren-weiss').value = "71.2";
        document.getElementById('modal-slope-herren-weiss').value = "127";
        document.getElementById('modal-cr-herren-gelb').value = "71.2";
        document.getElementById('modal-slope-herren-gelb').value = "125";
        document.getElementById('modal-cr-herren-rot').value = "67.1";
        document.getElementById('modal-slope-herren-rot').value = "113";
        document.getElementById('modal-cr-herren-orange').value = "62.4";
        document.getElementById('modal-slope-herren-orange').value = "105";

        document.getElementById('modal-cr-damen-rot').value = "72.4";
        document.getElementById('modal-slope-damen-rot').value = "120";
        document.getElementById('modal-cr-damen-orange').value = "66.4";
        document.getElementById('modal-slope-damen-orange').value = "110";

        for (let i = 1; i <= 18; i++)
        {
            const inputPar = document.getElementById(`modal-hole-par-${i}`);
            const inputSi = document.getElementById(`modal-hole-si-${i}`);
            if (inputPar) inputPar.value = 4;
            if (inputSi) inputSi.value = i;
        }
    }

    modal.classList.remove('hidden');
};

app.logic.closeGolfplatzModal = function()
{
    const modal = document.getElementById('golfplatz-edit-modal');
    if (modal) modal.classList.add('hidden');
};

app.logic.saveGolfplatzForm = async function(event)
{
    event.preventDefault();

    const id = document.getElementById('modal-platz-id').value;
    const name = document.getElementById('modal-platz-name').value.trim();
    const adresse = document.getElementById('modal-platz-adresse').value.trim();
    const telefon = document.getElementById('modal-platz-telefon').value.trim();
    const email = document.getElementById('modal-platz-email').value.trim();
    const website = document.getElementById('modal-platz-website').value.trim();

    if (!name) return;

    try
    {
        let docRefId = id;

        const dataPlatz = {
            name: name,
            adresse: adresse,
            telefon: telefon,
            email: email,
            website: website,
            updatedAt: new Date().toISOString()
        };

        if (docRefId)
        {
            await app.db.collection('golfplaetze').doc(docRefId).update(dataPlatz);
        }
        else
        {
            const newRef = await app.db.collection('golfplaetze').add(dataPlatz);
            docRefId = newRef.id;
        }

        const bestehenderKurs = (app.state.kurse || []).find(function(k) { return String(k.platzId) === String(docRefId); });

        // Par-Summe berechnen
        let totalPar = 0;
        for (let i = 1; i <= 18; i++)
        {
            totalPar += parseInt(document.getElementById(`modal-hole-par-${i}`).value) || 4;
        }

        const dataKurs = {
            platzId: docRefId,
            name: "18-Loch Platz",
            bahnAnzahl: 18,
            parTotal: totalPar,
            
            crHerrenWeiss: parseFloat(document.getElementById('modal-cr-herren-weiss').value) || 71.2,
            slopeHerrenWeiss: parseInt(document.getElementById('modal-slope-herren-weiss').value) || 127,
            crHerrenGelb: parseFloat(document.getElementById('modal-cr-herren-gelb').value) || 71.2,
            slopeHerrenGelb: parseInt(document.getElementById('modal-slope-herren-gelb').value) || 125,
            crHerrenRot: parseFloat(document.getElementById('modal-cr-herren-rot').value) || 67.1,
            slopeHerrenRot: parseInt(document.getElementById('modal-slope-herren-rot').value) || 113,
            crHerrenOrange: parseFloat(document.getElementById('modal-cr-herren-orange').value) || 62.4,
            slopeHerrenOrange: parseInt(document.getElementById('modal-slope-herren-orange').value) || 105,

            crDamenRot: parseFloat(document.getElementById('modal-cr-damen-rot').value) || 72.4,
            slopeDamenRot: parseInt(document.getElementById('modal-slope-damen-rot').value) || 120,
            crDamenOrange: parseFloat(document.getElementById('modal-cr-damen-orange').value) || 66.4,
            slopeDamenOrange: parseInt(document.getElementById('modal-slope-damen-orange').value) || 110
        };

        let kursId = null;
        if (bestehenderKurs)
        {
            await app.db.collection('kurse').doc(bestehenderKurs.id).update(dataKurs);
            kursId = bestehenderKurs.id;
        }
        else
        {
            const newKursRef = await app.db.collection('kurse').add(dataKurs);
            kursId = newKursRef.id;
        }

        // Bahnen 1 bis 18 speichern
        for (let i = 1; i <= 18; i++)
        {
            const holePar = parseInt(document.getElementById(`modal-hole-par-${i}`).value) || 4;
            const holeSi = parseInt(document.getElementById(`modal-hole-si-${i}`).value) || i;

            const existingBahn = (app.state.bahnen || []).find(
                function(b) { return String(b.kursId) === String(kursId) && parseInt(b.nr) === i; }
            );

            const bahnData = {
                kursId: kursId,
                nr: i,
                par: holePar,
                si: holeSi
            };

            if (existingBahn)
            {
                await app.db.collection('bahnen').doc(existingBahn.id).update(bahnData);
            }
            else
            {
                await app.db.collection('bahnen').add(bahnData);
            }
        }

        if (typeof app.logic.showToast === 'function')
        {
            app.logic.showToast("Golfclub & Bahnen wurden gespeichert!", "success");
        }

        app.logic.closeGolfplatzModal();
        if (typeof app.logic.refreshGlobalAppData === 'function')
        {
            app.logic.refreshGlobalAppData();
        }
    }
    catch (err)
    {
        console.error("[Golfplatz Speichern] Fehler:", err);
        if (typeof app.logic.showToast === 'function')
        {
            app.logic.showToast("Fehler beim Speichern des Golfclubs.", "error");
        }
    }
};

// Modal: Vorgabetabelle für alle Abschlagfarben & Spieler anzeigen
app.logic.openVorgabetabelleModal = function(platzId)
{
    const modal = document.getElementById('vorgabetabelle-modal');
    const titlePlatz = document.getElementById('vorgabe-modal-platzname');
    const titleKurs = document.getElementById('vorgabe-modal-kursname');
    const container = document.getElementById('vorgabetabelle-content');

    if (!modal || !container) return;

    const platz = (app.state.golfplaetze || []).find(function(p) { return String(p.id) === String(platzId); });
    const kurs = (app.state.kurse || []).find(function(k) { return String(k.platzId) === String(platzId); });

    if (titlePlatz) titlePlatz.innerText = platz ? platz.name : "Vorgabetabelle";
    if (titleKurs) titleKurs.innerText = kurs ? `${kurs.name} (Par ${kurs.parTotal || 71})` : "18-Loch Kurs";

    const crHerrenGelb = kurs ? (kurs.crHerrenGelb || 71.2) : 71.2;
    const slopeHerrenGelb = kurs ? (kurs.slopeHerrenGelb || 125) : 125;
    
    const crHerrenRot = kurs ? (kurs.crHerrenRot || 67.1) : 67.1;
    const slopeHerrenRot = kurs ? (kurs.slopeHerrenRot || 113) : 113;

    const crDamenRot = kurs ? (kurs.crDamenRot || 72.4) : 72.4;
    const slopeDamenRot = kurs ? (kurs.slopeDamenRot || 120) : 120;

    const parTotal = kurs ? (kurs.parTotal || 71) : 71;

    // 1. Personalisiere Ansicht für eure Spieler-Gruppe
    const activeSpieler = (app.state.spieler || []).filter(function(s) { return s && !s.istGeloescht; });
    
    let gruppenHtml = "";
    if (activeSpieler.length > 0)
    {
        gruppenHtml = activeSpieler.map(
            function(sp)
            {
                const hcp = parseFloat(sp.hcpLIE) || 26.0;

                // WHS-Formel anwenden
                const chGelb = Math.round(hcp * (slopeHerrenGelb / 113) + (crHerrenGelb - parTotal));
                const chHerrenRot = Math.round(hcp * (slopeHerrenRot / 113) + (crHerrenRot - parTotal));
                const chDamenRot = Math.round(hcp * (slopeDamenRot / 113) + (crDamenRot - parTotal));

                return `
                    <tr class="border-b border-zinc-100 text-xs">
                        <td class="py-2 px-3 font-bold text-zinc-800 flex items-center gap-1.5">
                            <i class="fas fa-user-circle text-emerald-600"></i>
                            ${sp.nickname || sp.name}
                        </td>
                        <td class="py-2 px-2 text-center font-semibold text-zinc-500">${hcp.toFixed(1)}</td>
                        <td class="py-2 px-2 font-black text-amber-900 text-center bg-amber-50/60">+${chGelb}</td>
                        <td class="py-2 px-2 font-black text-red-900 text-center bg-red-50/60">+${chHerrenRot}</td>
                        <td class="py-2 px-2 font-black text-rose-900 text-center bg-rose-50/60">+${chDamenRot}</td>
                    </tr>
                `;
            }
        ).join('');
    }

    container.innerHTML = `
        <div class="grid grid-cols-3 gap-1.5 text-center text-xs">
            <div class="bg-amber-50 border border-amber-200 rounded-xl p-2">
                <span class="block text-[9px] font-black text-amber-900 uppercase">Herren Gelb</span>
                <span class="font-bold text-zinc-800 text-[10px] block mt-0.5">CR ${crHerrenGelb} / SR ${slopeHerrenGelb}</span>
            </div>
            <div class="bg-red-50 border border-red-200 rounded-xl p-2">
                <span class="block text-[9px] font-black text-red-900 uppercase">Herren Rot</span>
                <span class="font-bold text-zinc-800 text-[10px] block mt-0.5">CR ${crHerrenRot} / SR ${slopeHerrenRot}</span>
            </div>
            <div class="bg-rose-50 border border-rose-200 rounded-xl p-2">
                <span class="block text-[9px] font-black text-rose-900 uppercase">Damen Rot</span>
                <span class="font-bold text-zinc-800 text-[10px] block mt-0.5">CR ${crDamenRot} / SR ${slopeDamenRot}</span>
            </div>
        </div>

        ${activeSpieler.length > 0 ? `
            <div class="space-y-1.5 pt-1">
                <h4 class="text-[10px] font-black text-zinc-400 uppercase tracking-wider px-1">Eure LIE-Gruppe (Persönliche Vorgaben)</h4>
                <div class="bg-zinc-50 rounded-2xl overflow-hidden border border-zinc-200">
                    <table class="w-full">
                        <thead>
                            <tr class="bg-zinc-200/70 text-[9px] font-extrabold text-zinc-500 uppercase">
                                <th class="py-1.5 px-3 text-left">Spieler</th>
                                <th class="py-1.5 px-2 text-center">HCP</th>
                                <th class="py-1.5 px-2 text-center text-amber-900">H. Gelb</th>
                                <th class="py-1.5 px-2 text-center text-red-900">H. Rot</th>
                                <th class="py-1.5 px-2 text-center text-rose-900">D. Rot</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${gruppenHtml}
                        </tbody>
                    </table>
                </div>
            </div>
        ` : ''}
    `;

    modal.classList.remove('hidden');
};

app.logic.closeVorgabetabelleModal = function()
{
    const modal = document.getElementById('vorgabetabelle-modal');
    if (modal) modal.classList.add('hidden');
};