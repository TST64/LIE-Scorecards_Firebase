// =========================================================================
// BMAssistent / LIE Scorecard - Golfplätze & Vorgabetabellen
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
                            return `<span class="bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded-md text-[10px] font-bold">${k.name || 'Standard Kurs'} (${k.bahnAnzahl || 18} Bahnen)</span>`;
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
                        <p class="text-xs text-zinc-400 font-medium -mt-0.5">Kontaktdaten, Adressen & WHS-Vorgaben</p>
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
                <div class="bg-white rounded-3xl max-w-lg w-full p-6 space-y-4 shadow-2xl border border-zinc-100 max-h-[90vh] overflow-y-auto">
                    <div class="flex justify-between items-center border-b border-zinc-100 pb-3">
                        <h3 id="golfplatz-modal-title" class="font-black text-zinc-900 text-base">Golfclub bearbeiten</h3>
                        <button onclick="app.logic.closeGolfplatzModal()" class="text-zinc-400 hover:text-zinc-600 touch-target">
                            <i class="fas fa-times text-lg"></i>
                        </button>
                    </div>

                    <form id="golfplatz-form" onsubmit="app.logic.saveGolfplatzForm(event)" class="space-y-3">
                        <input type="hidden" id="modal-platz-id" value="">

                        <div>
                            <label class="block text-[11px] font-extrabold text-zinc-500 uppercase tracking-wider mb-1">Club-Name *</label>
                            <input type="text" id="modal-platz-name" required class="w-full bg-zinc-50 border border-zinc-200 rounded-xl p-2.5 text-xs font-semibold text-zinc-800 focus:outline-none focus:border-emerald-600" placeholder="z.B. Golf-Club Bremer Schweiz e.V.">
                        </div>

                        <div>
                            <label class="block text-[11px] font-extrabold text-zinc-500 uppercase tracking-wider mb-1">Adresse</label>
                            <input type="text" id="modal-platz-adresse" class="w-full bg-zinc-50 border border-zinc-200 rounded-xl p-2.5 text-xs font-semibold text-zinc-800 focus:outline-none focus:border-emerald-600" placeholder="Straße, PLZ Ort">
                        </div>

                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                                <label class="block text-[11px] font-extrabold text-zinc-500 uppercase tracking-wider mb-1">Telefonnummer</label>
                                <input type="tel" id="modal-platz-telefon" class="w-full bg-zinc-50 border border-zinc-200 rounded-xl p-2.5 text-xs font-semibold text-zinc-800 focus:outline-none focus:border-emerald-600" placeholder="0421 681321">
                            </div>
                            <div>
                                <label class="block text-[11px] font-extrabold text-zinc-500 uppercase tracking-wider mb-1">E-Mail Adresse</label>
                                <input type="email" id="modal-platz-email" class="w-full bg-zinc-50 border border-zinc-200 rounded-xl p-2.5 text-xs font-semibold text-zinc-800 focus:outline-none focus:border-emerald-600" placeholder="info@golfclub-bremerschweiz.de">
                            </div>
                        </div>

                        <div>
                            <label class="block text-[11px] font-extrabold text-zinc-500 uppercase tracking-wider mb-1">Homepage URL</label>
                            <input type="url" id="modal-platz-website" class="w-full bg-zinc-50 border border-zinc-200 rounded-xl p-2.5 text-xs font-semibold text-zinc-800 focus:outline-none focus:border-emerald-600" placeholder="https://www.golfclub-bremerschweiz.de">
                        </div>

                        <!-- KURS-DATEN (Slope & CR) -->
                        <div class="pt-2 border-t border-zinc-100 space-y-3">
                            <h4 class="font-extrabold text-xs text-zinc-900 uppercase tracking-wider flex items-center gap-1.5">
                                <i class="fas fa-flag text-emerald-700"></i> Kurs & Vorgabewerte
                            </h4>

                            <div class="grid grid-cols-2 gap-3">
                                <div>
                                    <label class="block text-[10px] font-extrabold text-zinc-500 uppercase tracking-wider mb-1">Herren Gelb CR</label>
                                    <input type="number" step="0.1" id="modal-kurs-cr-herren" class="w-full bg-zinc-50 border border-zinc-200 rounded-xl p-2 text-xs font-semibold text-zinc-800" placeholder="71.2">
                                </div>
                                <div>
                                    <label class="block text-[10px] font-extrabold text-zinc-500 uppercase tracking-wider mb-1">Herren Gelb Slope</label>
                                    <input type="number" id="modal-kurs-slope-herren" class="w-full bg-zinc-50 border border-zinc-200 rounded-xl p-2 text-xs font-semibold text-zinc-800" placeholder="125">
                                </div>
                            </div>

                            <div class="grid grid-cols-2 gap-3">
                                <div>
                                    <label class="block text-[10px] font-extrabold text-zinc-500 uppercase tracking-wider mb-1">Damen Rot CR</label>
                                    <input type="number" step="0.1" id="modal-kurs-cr-damen" class="w-full bg-zinc-50 border border-zinc-200 rounded-xl p-2 text-xs font-semibold text-zinc-800" placeholder="72.4">
                                </div>
                                <div>
                                    <label class="block text-[10px] font-extrabold text-zinc-500 uppercase tracking-wider mb-1">Damen Rot Slope</label>
                                    <input type="number" id="modal-kurs-slope-damen" class="w-full bg-zinc-50 border border-zinc-200 rounded-xl p-2 text-xs font-semibold text-zinc-800" placeholder="120">
                                </div>
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
                <div class="bg-white rounded-3xl max-w-lg w-full p-6 space-y-4 shadow-2xl border border-zinc-100 max-h-[90vh] overflow-y-auto">
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

    const inputCrHerren = document.getElementById('modal-kurs-cr-herren');
    const inputSlopeHerren = document.getElementById('modal-kurs-slope-herren');
    const inputCrDamen = document.getElementById('modal-kurs-cr-damen');
    const inputSlopeDamen = document.getElementById('modal-kurs-slope-damen');

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

        if (inputCrHerren) inputCrHerren.value = kurs ? (kurs.crHerren || 71.2) : 71.2;
        if (inputSlopeHerren) inputSlopeHerren.value = kurs ? (kurs.slopeHerren || 125) : 125;
        if (inputCrDamen) inputCrDamen.value = kurs ? (kurs.crDamen || 72.4) : 72.4;
        if (inputSlopeDamen) inputSlopeDamen.value = kurs ? (kurs.slopeDamen || 120) : 120;
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

        if (inputCrHerren) inputCrHerren.value = "71.2";
        if (inputSlopeHerren) inputSlopeHerren.value = "125";
        if (inputCrDamen) inputCrDamen.value = "72.4";
        if (inputSlopeDamen) inputSlopeDamen.value = "120";
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

    const crHerren = parseFloat(document.getElementById('modal-kurs-cr-herren').value) || 71.2;
    const slopeHerren = parseInt(document.getElementById('modal-kurs-slope-herren').value) || 125;
    const crDamen = parseFloat(document.getElementById('modal-kurs-cr-damen').value) || 72.4;
    const slopeDamen = parseInt(document.getElementById('modal-kurs-slope-damen').value) || 120;

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

        const dataKurs = {
            platzId: docRefId,
            name: "18-Loch Platz",
            bahnAnzahl: 18,
            parTotal: 71,
            crHerren: crHerren,
            slopeHerren: slopeHerren,
            crDamen: crDamen,
            slopeDamen: slopeDamen
        };

        if (bestehenderKurs)
        {
            await app.db.collection('kurse').doc(bestehenderKurs.id).update(dataKurs);
        }
        else
        {
            await app.db.collection('kurse').add(dataKurs);
        }

        if (typeof app.logic.showToast === 'function')
        {
            app.logic.showToast("Golfclub-Daten wurden gespeichert!", "success");
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

// Vorgabetabelle mit Gruppen-Personalisierung und WHS-Standard
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

    const crHerren = kurs ? (kurs.crHerren || 71.2) : 71.2;
    const slopeHerren = kurs ? (kurs.slopeHerren || 125) : 125;
    const crDamen = kurs ? (kurs.crDamen || 72.4) : 72.4;
    const slopeDamen = kurs ? (kurs.slopeDamen || 120) : 120;
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
                // Exakte WHS-Formel anwenden
                const chHerren = Math.round(hcp * (slopeHerren / 113) + (crHerren - parTotal));
                const chDamen = Math.round(hcp * (slopeDamen / 113) + (crDamen - parTotal));

                return `
                    <tr class="border-b border-zinc-100 text-xs">
                        <td class="py-2 px-3 font-bold text-zinc-800 flex items-center gap-1.5">
                            <i class="fas fa-user-circle text-emerald-600"></i>
                            ${sp.nickname || sp.name}
                        </td>
                        <td class="py-2 px-2 text-center font-semibold text-zinc-500">${hcp.toFixed(1)}</td>
                        <td class="py-2 px-2 font-black text-amber-900 text-center bg-amber-50/50">+${chHerren}</td>
                        <td class="py-2 px-2 font-black text-rose-900 text-center bg-rose-50/50">+${chDamen}</td>
                    </tr>
                `;
            }
        ).join('');
    }

    container.innerHTML = `
        <div class="grid grid-cols-2 gap-2 text-center text-xs">
            <div class="bg-amber-50 border border-amber-200 rounded-xl p-2.5">
                <span class="block text-[9px] font-black text-amber-800 uppercase">Herren Gelb</span>
                <span class="font-bold text-zinc-800 mt-0.5 block">CR ${crHerren} &bull; Slope ${slopeHerren}</span>
            </div>
            <div class="bg-rose-50 border border-rose-200 rounded-xl p-2.5">
                <span class="block text-[9px] font-black text-rose-800 uppercase">Damen Rot</span>
                <span class="font-bold text-zinc-800 mt-0.5 block">CR ${crDamen} &bull; Slope ${slopeDamen}</span>
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
                                <th class="py-1.5 px-2 text-center text-amber-900">Gelb</th>
                                <th class="py-1.5 px-2 text-center text-rose-900">Rot</th>
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