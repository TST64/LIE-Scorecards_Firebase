// =========================================================================
// BMAssistent / LIE Scorecard - Kalender & Termine View
// Views_Kalender.js
// BSD (Allman) Style
// =========================================================================

app.views = app.views || {};

app.views.kalender = function()
{
    const currentUser = app.state.currentUser || {};
    const isLeiter = currentUser && (currentUser.role === 'Admin' || currentUser.role === 'Spielleiter');
    
    // Termine aus dem app.state laden (Standard: Chronologisch sortieren)
    const termine = [...(app.state.kalenderTermine || [])].sort((a, b) => new Date(a.datum) - new Date(b.datum));

    let termineHtml = "";

    if (termine.length === 0)
    {
        termineHtml = `
            <div class="bg-stone-50 border border-dashed border-stone-300 rounded-2xl p-8 text-center">
                <i class="fas fa-calendar-times text-stone-400 text-3xl mb-3"></i>
                <p class="text-stone-600 font-bold text-sm">Keine anstehenden Termine</p>
                <p class="text-stone-400 text-xs mt-1">Legt als Spielleiter den nächsten gemeinsamen Spieltag an!</p>
            </div>
        `;
    }
    else
    {
        termineHtml = termine.map(function(term)
        {
            const rsvps = term.rsvps || {};
            const myStatus = currentUser.id ? rsvps[currentUser.id] : null;

            // Zähler ermitteln
            let yesCount = 0, noCount = 0, maybeCount = 0;
            const yesNames = [], noNames = [], maybeNames = [];

            Object.keys(rsvps).forEach(function(sId)
            {
                const spieler = (app.state.spieler || []).find(s => String(s.id).trim() === String(sId).trim());
                const sName = spieler ? (spieler.nickname || spieler.name) : `ID ${sId}`;
                
                if (rsvps[sId] === 'yes') { yesCount++; yesNames.push(sName); }
                if (rsvps[sId] === 'no') { noCount++; noNames.push(sName); }
                if (rsvps[sId] === 'maybe') { maybeCount++; maybeNames.push(sName); }
            });

            // Datum formatieren
            let datumFormatted = term.datum;
            try
            {
                const d = new Date(term.datum);
                if (!isNaN(d.getTime()))
                {
                    datumFormatted = d.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
                }
            } catch (e) {}

            return `
                <div class="bg-white border border-stone-200 rounded-2xl p-4 sm:p-5 shadow-xs space-y-4">
                    <!-- Header Info -->
                    <div class="flex justify-between items-start gap-2">
                        <div>
                            <span class="inline-block px-2.5 py-0.5 bg-emerald-50 text-emerald-800 border border-emerald-200/60 rounded-md text-[10px] font-black uppercase tracking-wider mb-1">
                                <i class="far fa-clock mr-1"></i>${term.uhrzeit || '10:00'} Uhr
                            </span>
                            <h3 class="text-base font-bold text-stone-800">${term.titel}</h3>
                            <p class="text-xs text-stone-500 font-medium flex items-center gap-1 mt-0.5">
                                <i class="fas fa-map-marker-alt text-red-500"></i> ${term.ort || 'Golfplatz'}
                            </p>
                        </div>
                        <div class="text-right shrink-0">
                            <span class="text-xs font-bold text-stone-700 block">${datumFormatted}</span>
                            ${isLeiter ? `<button onclick="app.logic.deleteTermin('${term.id}')" class="text-stone-300 hover:text-red-600 transition text-xs mt-1"><i class="fas fa-trash-alt"></i></button>` : ''}
                        </div>
                    </div>

                    ${term.beschreibung ? `<p class="text-xs text-stone-600 bg-stone-50 p-2.5 rounded-xl border border-stone-100 font-medium">${term.beschreibung}</p>` : ''}

                    <!-- User RSVP Buttons -->
                    <div class="pt-2 border-t border-stone-100">
                        <span class="text-[10px] font-extrabold text-stone-400 uppercase tracking-wider block mb-2">Deine Rückmeldung:</span>
                        <div class="grid grid-cols-3 gap-2">
                            <button onclick="app.logic.saveRsvp('${term.id}', 'yes')" 
                                    class="py-2 px-1 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1 touch-target ${myStatus === 'yes' ? 'bg-emerald-600 text-white shadow-xs' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'}">
                                <i class="fas fa-check-circle"></i> Dabei
                            </button>
                            <button onclick="app.logic.saveRsvp('${term.id}', 'maybe')" 
                                    class="py-2 px-1 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1 touch-target ${myStatus === 'maybe' ? 'bg-amber-500 text-white shadow-xs' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'}">
                                <i class="fas fa-question-circle"></i> Unsicher
                            </button>
                            <button onclick="app.logic.saveRsvp('${term.id}', 'no')" 
                                    class="py-2 px-1 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1 touch-target ${myStatus === 'no' ? 'bg-red-600 text-white shadow-xs' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'}">
                                <i class="fas fa-times-circle"></i> Passt nicht
                            </button>
                        </div>
                    </div>

                    <!-- RSVP Summary Badges & Names -->
                    <div class="bg-stone-50 p-3 rounded-xl border border-stone-100 space-y-2 text-xs">
                        <div class="flex items-center justify-between text-stone-600 font-semibold text-[11px]">
                            <span class="text-emerald-700 font-bold"><i class="fas fa-user-check mr-1"></i>Zusagen (${yesCount}):</span>
                            <span>${yesNames.join(', ') || 'Noch keine'}</span>
                        </div>
                        ${maybeCount > 0 ? `
                        <div class="flex items-center justify-between text-stone-600 font-semibold text-[11px]">
                            <span class="text-amber-700 font-bold"><i class="fas fa-user-clock mr-1"></i>Unsicher (${maybeCount}):</span>
                            <span>${maybeNames.join(', ')}</span>
                        </div>` : ''}
                        ${noCount > 0 ? `
                        <div class="flex items-center justify-between text-stone-600 font-semibold text-[11px]">
                            <span class="text-red-600 font-bold"><i class="fas fa-user-xmark mr-1"></i>Absagen (${noCount}):</span>
                            <span>${noNames.join(', ')}</span>
                        </div>` : ''}
                    </div>
                </div>
            `;
        }).join('');
    }

    let newTerminBtnHeader = "";
    if (isLeiter)
    {
        newTerminBtnHeader = `
            <button onclick="app.logic.showNewTerminModal()" class="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 py-2 rounded-xl text-xs transition shadow-xs flex items-center gap-1.5 touch-target">
                <i class="fas fa-plus"></i> Neuer Termin
            </button>
        `;
    }

    return `
        <div class="space-y-5 max-w-4xl mx-auto pb-12">
            <div class="border-b border-stone-200 pb-3 flex justify-between items-end">
                <div>
                    <h1 class="text-2xl sm:text-3xl font-bold text-stone-800 tracking-tight">Gruppen-Kalender</h1>
                    <p class="text-xs sm:text-sm text-stone-500 mt-0.5">Termine, Privatrunden & Turniere planen</p>
                </div>
                ${newTerminBtnHeader}
            </div>

            <div class="space-y-4">
                ${termineHtml}
            </div>
        </div>
    `;
};

// ==========================================
// KALENDER LOGIK (RSVP & ADMIN-ACTIONS)
// ==========================================

// Speichert das RSVP des aktuellen Nutzers direkt in Firestore
app.logic.saveRsvp = async function(terminId, status)
{
    const currentUser = app.state.currentUser;
    if (!currentUser)
    {
        app.logic.showToast("Bitte zuerst einloggen!", "error");
        return;
    }

    try
    {
        const fieldPath = `rsvps.${currentUser.id}`;
        const updateObj = {};
        updateObj[fieldPath] = status;

        await app.db.collection('kalender_termine').doc(terminId).update(updateObj);
        
        // Lokalen State aktualisieren & Neu rendern
        const term = (app.state.kalenderTermine || []).find(t => t.id === terminId);
        if (term)
        {
            if (!term.rsvps) term.rsvps = {};
            term.rsvps[currentUser.id] = status;
        }

        app.logic.showToast("Rückmeldung gespeichert!", "success");
        app.router.navigate('kalender');
    }
    catch (err)
    {
        console.error("RSVP Fehler:", err);
        app.logic.showToast("Fehler beim Speichern der Rückmeldung.", "error");
    }
};

// Modal zum Erstellen eines neuen Termins (Spielleiter/Admins)
app.logic.showNewTerminModal = function()
{
    const oldModal = document.getElementById('new-termin-modal');
    if (oldModal) oldModal.remove();

    const todayStr = new Date().toISOString().split('T')[0];

    const modalHtml = `
        <div id="new-termin-modal" class="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 animate-fade-in">
            <div class="bg-white rounded-2xl shadow-2xl w-full max-w-md p-5 space-y-4">
                <div class="flex justify-between items-center border-b border-stone-100 pb-2">
                    <h3 class="font-bold text-stone-800 text-base">Neuen Termin anlegen</h3>
                    <button onclick="document.getElementById('new-termin-modal').remove()" class="text-stone-400 hover:text-stone-600"><i class="fas fa-times"></i></button>
                </div>

                <div class="space-y-3">
                    <div>
                        <label class="block text-[10px] font-bold text-stone-400 uppercase mb-1">Titel / Anlass</label>
                        <input id="term-title" type="text" placeholder="z. B. Oktober Abschlussturnier" class="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-xs font-semibold outline-none focus:border-emerald-600" />
                    </div>

                    <div class="grid grid-cols-2 gap-2">
                        <div>
                            <label class="block text-[10px] font-bold text-stone-400 uppercase mb-1">Datum</label>
                            <input id="term-date" type="date" value="${todayStr}" class="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-xs font-semibold outline-none focus:border-emerald-600" />
                        </div>
                        <div>
                            <label class="block text-[10px] font-bold text-stone-400 uppercase mb-1">Uhrzeit</label>
                            <input id="term-time" type="time" value="11:00" class="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-xs font-semibold outline-none focus:border-emerald-600" />
                        </div>
                    </div>

                    <div>
                        <label class="block text-[10px] font-bold text-stone-400 uppercase mb-1">Ort / Platz</label>
                        <input id="term-location" type="text" value="Bremer Schweiz" class="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-xs font-semibold outline-none focus:border-emerald-600" />
                    </div>

                    <div>
                        <label class="block text-[10px] font-bold text-stone-400 uppercase mb-1">Beschreibung (Optional)</label>
                        <textarea id="term-desc" rows="2" placeholder="Details zur Runde..." class="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-xs font-semibold outline-none focus:border-emerald-600"></textarea>
                    </div>
                </div>

                <button onclick="app.logic.createNewTerminSubmit()" class="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 rounded-xl transition text-xs shadow-xs">
                    Termin veröffentlichen
                </button>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
};

// Speichert den neuen Termin in Firestore
app.logic.createNewTerminSubmit = async function()
{
    const titel = document.getElementById('term-title').value.trim();
    const datum = document.getElementById('term-date').value;
    const uhrzeit = document.getElementById('term-time').value;
    const ort = document.getElementById('term-location').value.trim();
    const beschreibung = document.getElementById('term-desc').value.trim();

    if (!titel || !datum)
    {
        app.logic.showToast("Bitte Titel und Datum ausfüllen!", "info");
        return;
    }

    const docId = `TERM-${Date.now()}`;
    const newTermin = {
        id: docId,
        titel: titel,
        datum: datum,
        uhrzeit: uhrzeit,
        ort: ort,
        beschreibung: beschreibung,
        erstelltVon: app.state.currentUser ? app.state.currentUser.id : "101",
        rsvps: {}
    };

    try
    {
        await app.db.collection('kalender_termine').doc(docId).set(newTermin);
        if (!app.state.kalenderTermine) app.state.kalenderTermine = [];
        app.state.kalenderTermine.push(newTermin);

        document.getElementById('new-termin-modal').remove();
        app.logic.showToast("Termin im Kalender angelegt!", "success");
        app.router.navigate('kalender');
    }
    catch (e)
    {
        console.error("Fehler beim Erstellen des Termins:", e);
        app.logic.showToast("Fehler beim Speichern.", "error");
    }
};

// Termin löschen
app.logic.deleteTermin = async function(terminId)
{
    if (!confirm("Möchtest du diesen Termin wirklich löschen?")) return;

    try
    {
        await app.db.collection('kalender_termine').doc(terminId).delete();
        app.state.kalenderTermine = (app.state.kalenderTermine || []).filter(t => t.id !== terminId);
        app.logic.showToast("Termin gelöscht.", "success");
        app.router.navigate('kalender');
    }
    catch (e)
    {
        app.logic.showToast("Fehler beim Löschen.", "error");
    }
};