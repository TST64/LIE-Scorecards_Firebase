// =========================================================================
// BMAssistent / LIE Scorecard - Bereinigte Admin Ansicht
// Views_Admin.js
// BSD (Allman) Style
// =========================================================================

app.views = app.views || {};

app.views.admin = function()
{
    const user = app.state.currentUser;
    if (!user || user.role !== 'Admin')
    {
        return '<div class="bg-red-50 border border-red-200 text-red-800 p-6 rounded-2xl text-center space-y-3">' +
                '<i class="fas fa-lock text-3xl text-red-600"></i>' +
                '<h3 class="font-bold text-sm">Zugriff verweigert</h3>' +
                '<p class="text-xs text-red-600">Diese Ansicht ist ausschließlich dem System-Administrator vorbehalten.</p>' +
               '</div>';
    }

    const spielerListe = app.state.spieler || [];
    const saisonStart = app.state.saisonStartDatum || '2026-10-01';

    let spielerOptionsHtml = '';
    spielerListe.forEach(function(s)
    {
        const sName = s.nickname || s.name;
        spielerOptionsHtml += '<option value="' + s.id + '">' + sName + ' (' + s.role + ')</option>';
    });

    return '<div class="space-y-5 max-w-2xl mx-auto pb-12 animate-fade-in">' +
            '<!-- Header -->' +
            '<div class="border-b border-zinc-200 pb-3 flex justify-between items-center">' +
                '<div>' +
                    '<h2 class="text-lg font-black text-zinc-900 tracking-tight">Admin-Zentrale</h2>' +
                    '<p class="text-xs text-zinc-400 font-medium -mt-0.5">Systemeinstellungen & Saison-Verwaltung</p>' +
                '</div>' +
                '<button onclick="app.router.navigate(\'dashboard\')" class="text-zinc-500 touch-target">' +
                    '<i class="fas fa-times text-lg"></i>' +
                '</button>' +
            '</div>' +

            '<!-- SAISON-MANAGEMENT -->' +
            '<div class="bg-gradient-to-br from-emerald-900 to-zinc-900 text-white border border-emerald-800/80 rounded-2xl p-5 space-y-3 shadow-md">' +
                '<div class="flex items-center gap-2.5 border-b border-white/10 pb-2.5">' +
                    '<div class="w-8 h-8 rounded-xl bg-amber-400/20 text-amber-300 flex items-center justify-center text-sm">' +
                        '<i class="fas fa-flag-checkered"></i>' +
                    '</div>' +
                    '<div>' +
                        '<h3 class="font-extrabold text-sm text-white">Saison-Verwaltung</h3>' +
                        '<p class="text-[10px] text-emerald-200/80">Aktive Saison gestartet am: ' + saisonStart + '</p>' +
                    '</div>' +
                '</div>' +

                '<p class="text-xs text-zinc-300 leading-relaxed pt-1">' +
                    'Beim Starten der <b>neuen Saison</b> werden die LIE Handicaps <u>aller Spieler auf 26.0 zurückgesetzt</u>. Alle Live-Dashboard KPIs beginnen ab diesem Tag neu bei 0. Alle Runden bleiben in der Historie erhalten.' +
                '</p>' +

                '<div class="pt-2">' +
                    '<button onclick="app.logic.startNeueSaison()" class="w-full bg-amber-500 hover:bg-amber-600 text-zinc-950 font-black py-3 rounded-xl text-xs transition shadow-md flex items-center justify-center gap-2 touch-target">' +
                        '<i class="fas fa-rotate text-sm"></i>' +
                        '<span>NEUE SAISON STARTEN (RESET HCP auf 26.0)</span>' +
                    '</button>' +
                '</div>' +
            '</div>' +

            '<!-- GRUPPE & MITGLIEDER -->' +
            '<div class="bg-white border border-zinc-200 rounded-2xl p-4 space-y-3 shadow-xs">' +
                '<div class="flex items-center justify-between border-b border-zinc-100 pb-2">' +
                    '<div class="flex items-center gap-2">' +
                        '<i class="fas fa-users-cog text-emerald-700 text-sm"></i>' +
                        '<h3 class="font-bold text-xs text-zinc-800 uppercase tracking-wider">Mitgliederverwaltung</h3>' +
                    '</div>' +
                    '<span class="text-[10px] text-zinc-400 font-bold">' + spielerListe.length + ' Spieler</span>' +
                '</div>' +

                '<p class="text-xs text-zinc-500">' +
                    'Handicaps anpassen, Rollen vergeben oder PINs der Mitglieder zurücksetzen.' +
                '</p>' +

                '<button onclick="app.router.navigate(\'admin_gruppe\')" class="w-full bg-zinc-100 hover:bg-zinc-200 text-zinc-800 font-bold py-2.5 rounded-xl text-xs transition flex items-center justify-center gap-2 touch-target">' +
                    '<i class="fas fa-user-edit"></i>' +
                    '<span>Spielerliste bearbeiten</span>' +
                '</button>' +
            '</div>' +

            '<!-- SPIELER-LÖSCHEN SONDERFUNKTION -->' +
            '<div class="bg-white border border-zinc-200 rounded-2xl p-4 space-y-3 shadow-xs">' +
                '<div class="flex items-center gap-2 border-b border-zinc-100 pb-2">' +
                    '<i class="fas fa-user-minus text-amber-600 text-sm"></i>' +
                    '<h3 class="font-bold text-xs text-zinc-800 uppercase tracking-wider">Spieler löschen</h3>' +
                '</div>' +

                '<div class="space-y-2">' +
                    '<select id="admin-delete-spieler-select" class="w-full bg-zinc-50 border border-zinc-200 rounded-xl p-2.5 text-xs font-semibold text-zinc-800 focus:outline-none focus:border-emerald-600">' +
                        '<option value="">Spieler zum Löschen auswählen...</option>' +
                        spielerOptionsHtml +
                    '</select>' +

                    '<button onclick="app.logic.adminDeleteSpieler()" class="w-full bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 font-bold py-2.5 rounded-xl text-xs transition flex items-center justify-center gap-2 touch-target">' +
                        '<i class="fas fa-trash-alt"></i>' +
                        '<span>Ausgewählten Spieler löschen</span>' +
                    '</button>' +
                '</div>' +
            '</div>' +
        '</div>';
};

// Hilfsfunktion: Spieler über Admin-Bereich löschen
app.logic.adminDeleteSpieler = function()
{
    const select = document.getElementById('admin-delete-spieler-select');
    if (!select || !select.value)
    {
        if (typeof app.logic.showToast === 'function')
        {
            app.logic.showToast("Bitte wähle zuerst einen Spieler aus.", "warning");
        }
        return;
    }

    const spielerId = select.value;
    const spieler = app.state.spieler.find(function(s) { return String(s.id) === String(spielerId); });
    const name = spieler ? (spieler.nickname || spieler.name) : "den Spieler";

    app.logic.showConfirm(
        "Spieler löschen",
        "Möchtest du " + name + " wirklich aus der Gruppe entfernen?",
        async function()
        {
            try
            {
                await app.db.collection('spieler').doc(spielerId).update({ istGeloescht: true });
                
                if (app.state.spieler)
                {
                    app.state.spieler = app.state.spieler.filter(function(s) { return String(s.id) !== String(spielerId); });
                }

                if (typeof app.logic.showToast === 'function')
                {
                    app.logic.showToast(name + " wurde entfernt.", "success");
                }

                app.router.navigate('admin');
            }
            catch (err)
            {
                console.error("[Admin Löschen] Fehler:", err);
                if (typeof app.logic.showToast === 'function')
                {
                    app.logic.showToast("Fehler beim Löschen des Spielers.", "error");
                }
            }
        }
    );
};