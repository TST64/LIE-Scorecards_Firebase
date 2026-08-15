
// View: Gruppe & Handicap-Verwaltung
app.views.spieler_liste = function()
{
    const currentUser = app.state.currentUser;
    const isAdmin = currentUser && currentUser.role === 'Admin';
    const isLeiter = currentUser && (currentUser.role === 'Admin' || currentUser.role === 'Spielleiter');

    let spielerListHtml = "";
    
    if (app.state.spieler && app.state.spieler.length > 0)
    {
        spielerListHtml = app.state.spieler.map(function(s) 
        {
            const istMeinProfil = currentUser && String(currentUser.id).trim() === String(s.id).trim();
            const darfEditieren = isAdmin || istMeinProfil;

            // Stift-Icon rendern, wenn Admin ODER eigenes Profil
            const editActionHtml = darfEditieren ? `
                <button onclick="app.router.navigate('spieler_edit', { id: '${s.id}' })" class="text-stone-400 hover:text-emerald-700 p-2 touch-target transition" title="Profil bearbeiten">
                    <i class="fas fa-user-edit text-base"></i>
                </button>
            ` : `
                <div class="text-right">
                    <div class="text-sm font-bold text-emerald-700">HCP: ${s.hcpLIE}</div>
                    <div class="text-[10px] text-stone-400">DGV: ${s.hcpOfficial}</div>
                </div>
            `;

            return `
                <div class="flex items-center justify-between p-3 bg-white border border-stone-200 rounded-xl shadow-2xs">
                    <div class="flex items-center space-x-3">
                        <div class="w-10 h-10 rounded-full bg-emerald-100 text-emerald-800 font-bold flex items-center justify-center uppercase">
                            ${String(s.nickname || s.name).substring(0, 2)}
                        </div>
                        <div>
                            <h4 class="font-semibold text-stone-800">${s.name} ${istMeinProfil ? '<span class="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.5 rounded ml-1">Du</span>' : ''}</h4>
                            <p class="text-[10px] text-stone-400 font-medium -mt-0.5">@${s.nickname} &bull; ${s.role}</p>
                        </div>
                    </div>
                    <div class="flex items-center space-x-2">
                        ${darfEditieren ? `<div class="text-right text-xs pr-1"><span class="font-bold text-emerald-700">L:${s.hcpLIE}</span><br><span class="text-stone-400 text-[10px]">D:${s.hcpOfficial}</span></div>` : ''}
                        ${editActionHtml}
                    </div>
                </div>
            `;
        }).join('');
    }
    else
    {
        spielerListHtml = `<p class="text-stone-500 text-sm italic p-2">Keine Spieler geladen.</p>`;
    }

    return `
        <div class="space-y-4">
            <div>
                <h2 class="text-lg font-bold text-stone-800">Die LIE-Gruppe</h2>
                ${isLeiter ? '<p class="text-[11px] text-emerald-700 font-semibold mt-0.5"><i class="fas fa-user-shield"></i> Tippe auf das Stift-Icon, um Profildaten anzupassen.</p>' : ''}
            </div>
            <div class="space-y-2">
                ${spielerListHtml}
            </div>
        </div>
    `;
};

app.logic.triggerVaultSync = function()
{
    const btn = document.getElementById('admin-vault-sync-btn');
    if (btn)
    {
        btn.disabled = true;
        btn.innerHTML = `<i class="fas fa-circle-notch fa-spin mr-1"></i> Synchronisiere Vault...`;
    }

    app.logic.apiRequest('syncToVault')
        .then(function(response)
        {
            if (response && response.success)
            {
                const anzahl = response.count !== undefined ? response.count : 0;
                app.logic.showToast(`Vault-Sync erfolgreich! (${anzahl} neue/aktualisierte Datensätze)`, "success");
            }
            else
            {
                app.logic.showToast("Fehler beim Vault-Sync: " + (response ? response.error : "Unbekannt"), "error");
            }

            if (btn)
            {
                btn.disabled = false;
                btn.innerHTML = `<i class="fas fa-database mr-1"></i> Daten im Vault sichern`;
            }
        })
        .catch(function(err)
        {
            app.logic.showToast("Netzwerkfehler beim Vault-Sync", "error");
            if (btn)
            {
                btn.disabled = false;
                btn.innerHTML = `<i class="fas fa-database mr-1"></i> Daten im Vault sichern`;
            }
        });
};
