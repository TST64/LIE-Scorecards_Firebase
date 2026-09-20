// View: Spieler anlegen oder editieren
app.views.spieler_edit = function(spielerId)
{
    const currentUser = app.state.currentUser;
    const isAdmin = currentUser && currentUser.role === 'Admin';
    
    const s = spielerId ? app.state.spieler.find(function(p) { return String(p.id).trim() === String(spielerId).trim(); }) : null;
    const isNew = s === null;

    // Sicherheits-Check Guard: Wenn Nicht-Admin versucht ein fremdes Profil zu öffnen -> Abbrechen!
    if (!isAdmin && s && String(s.id).trim() !== String(currentUser.id).trim())
    {
        setTimeout(function() {
            app.logic.showToast("Zugriff verweigert! Du kannst nur dein eigenes Profil bearbeiten.", "error");
            app.router.navigate('spieler');
        }, 10);
        return '<p class="text-stone-400 p-4">Zugriff verweigert...</p>';
    }

    const title = isNew ? "Neuen Spieler anlegen" : (isAdmin ? "Spielerprofil bearbeiten" : "Mein Profil bearbeiten");
    const disabledAttrForUsers = isAdmin ? '' : 'disabled class="bg-stone-100 border border-stone-200 text-stone-400 text-xs rounded-xl px-3 py-2 outline-none font-bold cursor-not-allowed"';
    const inputStyleForUsers = isAdmin ? 'class="bg-stone-50 border border-stone-200 text-xs rounded-xl px-3 py-2 focus:border-emerald-600 outline-none font-bold"' : disabledAttrForUsers;

    return `
        <div class="space-y-4">
            <div class="flex items-center space-x-2">
                <button onclick="app.router.navigate('spieler')" class="text-stone-500 touch-target"><i class="fas fa-arrow-left"></i></button>
                <h2 class="text-lg font-bold text-stone-800">${title}</h2>
            </div>

            <div class="bg-white border border-stone-200 rounded-2xl p-4 shadow-2xs space-y-4">
                
                <div class="grid grid-cols-3 gap-2">
                    <!-- ID-Feld nur für Admins anzeigen -->
                    ${isAdmin ? `
                        <div class="flex flex-col space-y-1 col-span-1">
                            <label class="text-[10px] font-bold text-stone-500 uppercase">ID *</label>
                            <input type="text" id="edit-sp-id" value="${!isNew ? s.id : ''}" ${!isNew ? 'disabled class="bg-stone-100 border border-stone-200 text-stone-400 text-xs rounded-xl px-3 py-2 outline-none font-bold"' : 'class="bg-stone-50 border border-stone-200 text-xs rounded-xl px-3 py-2 focus:border-emerald-600 outline-none font-bold" placeholder="z.B. 106"'} />
                        </div>
                    ` : `
                        <!-- Verstecktes ID-Feld für die Logik beim Speichern -->
                        <input type="hidden" id="edit-sp-id" value="${s.id}" />
                    `}
                    
                    <div class="flex flex-col space-y-1 ${isAdmin ? 'col-span-2' : 'col-span-3'}">
                        <label class="text-[10px] font-bold text-stone-500 uppercase">Kürzel / Nickname *</label>
                        <input type="text" id="edit-sp-nickname" value="${!isNew ? s.nickname : ''}" class="bg-stone-50 border border-stone-200 text-xs rounded-xl px-3 py-2 focus:border-emerald-600 outline-none font-semibold" placeholder="z.B. Tiger" />
                    </div>
                </div>

                <div class="flex flex-col space-y-1">
                    <label class="text-[10px] font-bold text-stone-500 uppercase">Vollständiger Name *</label>
                    <input type="text" id="edit-sp-name" value="${!isNew ? s.name : ''}" class="bg-stone-50 border border-stone-200 text-xs rounded-xl px-3 py-2 focus:border-emerald-600 outline-none" placeholder="Vorname Nachname" />
                </div>

                <div class="flex flex-col space-y-1">
                    <label class="text-[10px] font-bold text-stone-500 uppercase">E-Mail-Adresse *</label>
                    <input type="email" id="edit-sp-email" value="${!isNew ? s.email : ''}" class="bg-stone-50 border border-stone-200 text-xs rounded-xl px-3 py-2 focus:border-emerald-600 outline-none font-mono" placeholder="spieler@example.com" />
                </div>

                <!-- Nur Admins dürfen Handicaps verändern -->
                <div class="grid grid-cols-2 gap-3">
                    <div class="flex flex-col space-y-1">
                        <label class="text-[10px] font-bold text-stone-500 uppercase">DGV-Handicap ${!isAdmin ? '🔒' : ''}</label>
                        <input type="number" step="0.1" id="edit-sp-hcpoff" value="${!isNew ? s.hcpOfficial : '54.0'}" ${inputStyleForUsers} />
                    </div>
                    <div class="flex flex-col space-y-1">
                        <label class="text-[10px] font-bold text-stone-500 uppercase">LIE-Handicap ${!isAdmin ? '🔒' : ''}</label>
                        <input type="number" id="edit-sp-hcplie" value="${!isNew ? s.hcpLIE : '54'}" ${inputStyleForUsers} />
                    </div>
                </div>

                <!-- Nur Admins dürfen Tee & Rolle verändern -->
                <div class="grid grid-cols-2 gap-3">
                    <div class="flex flex-col space-y-1">
                        <label class="text-[10px] font-bold text-stone-500 uppercase">Abschlag (Tee) ${!isAdmin ? '🔒' : ''}</label>
                        <select id="edit-sp-tee" ${isAdmin ? 'class="bg-stone-50 border border-stone-200 text-xs rounded-xl px-3 py-2 focus:border-emerald-600 outline-none"' : 'disabled class="bg-stone-100 border border-stone-200 text-stone-400 text-xs rounded-xl px-3 py-2 outline-none cursor-not-allowed"'}>
                            <option value="Gelb" ${!isNew && s.teeColor === 'Gelb' ? 'selected' : ''}>Gelb (Herren)</option>
                            <option value="Rot" ${!isNew && s.teeColor === 'Rot' ? 'selected' : ''}>Rot (Damen)</option>
                            <option value="Blau" ${!isNew && s.teeColor === 'Blau' ? 'selected' : ''}>Blau</option>
                            <option value="Weiß" ${!isNew && s.teeColor === 'Weiß' ? 'selected' : ''}>Weiß</option>
                        </select>
                    </div>
                    <div class="flex flex-col space-y-1">
                        <label class="text-[10px] font-bold text-stone-500 uppercase">Rolle / Rechte ${!isAdmin ? '🔒' : ''}</label>
                        <select id="edit-sp-role" ${isAdmin ? 'class="bg-stone-50 border border-stone-200 text-xs rounded-xl px-3 py-2 focus:border-emerald-600 outline-none"' : 'disabled class="bg-stone-100 border border-stone-200 text-stone-400 text-xs rounded-xl px-3 py-2 outline-none cursor-not-allowed"'}>
                            <option value="Spieler" ${!isNew && s.role === 'Spieler' ? 'selected' : ''}>Spieler</option>
                            <option value="Spielleiter" ${!isNew && s.role === 'Spielleiter' ? 'selected' : ''}>Spielleiter</option>
                            <option value="Admin" ${!isNew && s.role === 'Admin' ? 'selected' : ''}>Admin</option>
                        </select>
                    </div>
                </div>

                <button onclick="app.logic.savePlayer(${isNew})" id="save-player-btn" class="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-xl transition text-sm shadow-xs mt-2">
                    <i class="fas fa-save mr-1"></i> Profil speichern
                </button>

            </div>
        </div>
    `;
};