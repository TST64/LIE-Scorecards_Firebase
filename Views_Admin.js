/**
 * Views_Admin.js
 * Admin-Sonderfunktionen & System-Tools
 * BSD (Allman) Style
 */

app.views = app.views || {};

app.views.admin = function()
{
    const spielerOptions = (app.state.spieler || []).map(function(s)
    {
        return `<option value="${s.id}">${s.name} (@${s.nickname})</option>`;
    }).join('');

    // Startet das automatische Rendern der Vault-Freigabekachel nach dem View-Aufbau
    setTimeout(function()
    {
        app.logic.renderVaultToggleCard();
    }, 50);

    return `
        <div class="space-y-5 pb-12">
            <!-- Header -->
            <div class="flex items-center space-x-2">
                <button onclick="app.router.navigate('dashboard')" class="text-stone-500 touch-target"><i class="fas fa-arrow-left"></i></button>
                <div>
                    <h2 class="text-lg font-bold text-stone-800">System- & Adminverwaltung</h2>
                    <p class="text-xs text-stone-400 -mt-1">Zentrale Steuerung & Gefahrenzone</p>
                </div>
            </div>

            <div class="bg-white border border-stone-200 rounded-2xl p-4 shadow-2xs space-y-5">
                
                <!-- 1. DATENBANK & SIEGEREHRUNG -->
                <div class="space-y-3">
                    <h4 class="text-xs font-bold text-stone-500 uppercase tracking-wider flex items-center gap-1.5">
                        <i class="fas fa-trophy text-emerald-600"></i> Siegerehrung & Freigabe
                    </h4>
                    
                    <!-- Schalter für die Siegerehrung / Stats-Freigabe auf der Homepage -->
                    <div id="vault-toggle-container">
                        <div class="p-3 bg-stone-50 border border-stone-200 rounded-xl flex items-center justify-between animate-pulse">
                            <span class="text-xs text-stone-400 font-semibold"><i class="fas fa-spinner fa-spin mr-1"></i> Lade Freigabestatus...</span>
                        </div>
                    </div>
                </div>

                <hr class="border-stone-100">

                <!-- 2. MITGLIEDER-MANAGEMENT (ADMIN-ACTIONS) -->
                <div class="space-y-2">
                    <h4 class="text-xs font-bold text-stone-500 uppercase tracking-wider flex items-center gap-1.5">
                        <i class="fas fa-user-gear text-amber-600"></i> Spieler-Sonderfunktionen
                    </h4>
                    <div class="flex flex-col space-y-2">
                        <select id="admin-delete-spieler-select" class="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2.5 text-xs outline-none font-medium">
                            <option value="" disabled selected>Spieler zum Löschen auswählen...</option>
                            ${spielerOptions}
                        </select>
                        <button onclick="app.logic.adminDeletePlayerFromSelect()" class="w-full bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 font-bold py-2.5 rounded-xl transition text-xs flex items-center justify-center gap-1.5 touch-target">
                            <i class="fas fa-user-slash"></i>
                            <span>Ausgewählten Spieler löschen</span>
                        </button>
                    </div>
                </div>

                <!-- 3. GEFAHRENZONE (RESET) -->
                <div class="p-4 bg-red-50/70 border border-red-200 rounded-2xl space-y-3">
                    <h4 class="text-xs font-bold text-red-700 uppercase tracking-wider flex items-center gap-1.5">
                        <i class="fas fa-radiation"></i> Testbetrieb Gefahrenzone
                    </h4>
                    <p class="text-[11px] text-red-600 leading-relaxed">
                        Achtung: Dies löscht alle gespielten Runden, Flights und abgegebenen Scorekarten unwiderruflich!
                    </p>
                    <button onclick="app.logic.triggerMasterReset()" id="master-reset-db-btn" class="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded-xl transition text-xs shadow-xs flex items-center justify-center gap-2 touch-target">
                        <i class="fas fa-bomb"></i>
                        <span>Spieldaten komplett löschen</span>
                    </button>
                </div>

            </div>
        </div>
    `;
};

// Hilfsfunktion für die Spielerauswahl im Admin-Menü
app.logic.adminDeletePlayerFromSelect = function()
{
    const select = document.getElementById('admin-delete-spieler-select');
    if (!select || !select.value)
    {
        app.logic.showToast("Bitte wähle zuerst einen Spieler aus!", "info");
        return;
    }
    app.logic.deletePlayer(select.value);
};

// Rendert die Kachel für den Vault-Status
app.logic.renderVaultToggleCard = function()
{
    app.logic.apiRequest('getVaultLockStatus')
        .then(function(res)
        {
            const container = document.getElementById('vault-toggle-container');
            if (!container) return;

            const isUnlocked = res && res.isUnlocked;
            
            container.innerHTML = `
                <div class="p-3 ${isUnlocked ? 'bg-emerald-50 border-emerald-200' : 'bg-stone-50 border-stone-200'} border rounded-xl flex items-center justify-between transition-all">
                    <div>
                        <h5 class="text-xs font-bold text-stone-800">Stats-Freigabe für Homepage</h5>
                        <p class="text-[10px] text-stone-500 font-medium">${isUnlocked ? '🟢 Freigeschaltet (Siegerehrung aktiv)' : '🔴 Gesperrt (Spickschutz aktiv)'}</p>
                    </div>
                    <button onclick="app.logic.toggleVaultAccess(${!isUnlocked})" class="px-3 py-1.5 ${isUnlocked ? 'bg-red-600 hover:bg-red-700' : 'bg-emerald-600 hover:bg-emerald-700'} text-white text-xs font-bold rounded-lg shadow-3xs transition touch-target">
                        ${isUnlocked ? '<i class="fas fa-lock mr-1"></i> Sperren' : '<i class="fas fa-lock-open mr-1"></i> Freischalten'}
                    </button>
                </div>
            `;
        });
};

// Schaltet den Vault-Zugriff um
app.logic.toggleVaultAccess = function(targetStatus)
{
    if (!app.state.currentUser) return;

    app.logic.apiRequest('toggleVaultLock', { spielerId: app.state.currentUser.id, status: targetStatus })
        .then(function(res)
        {
            if (res && res.success)
            {
                app.logic.showToast(targetStatus ? "Vault für Siegerehrung FREIGESCHALTET!" : "Vault wieder GESPERRT!", "success");
                app.logic.renderVaultToggleCard();
            }
            else
            {
                app.logic.showToast("Fehler: " + (res ? res.error : "Unbekannt"), "error");
            }
        });
};

// Hilfsfunktion zur Generierung einer Inline-Edit-Tabelle
app.logic.renderCollectionEditor = function(collectionName)
{
    const container = document.getElementById('admin-editor-table-container');
    if (!container || !app.state[collectionName]) return;

    const items = app.state[collectionName];
    if (items.length === 0)
    {
        container.innerHTML = `<p class="text-xs text-stone-400 italic">Keine Einträge in ${collectionName} vorhanden.</p>`;
        return;
    }

    const keys = Object.keys(items[0]).filter(k => k !== 'id');

    let tableHtml = `
        <div class="overflow-x-auto border border-stone-200 rounded-xl shadow-2xs">
            <table class="w-full text-left text-xs bg-white">
                <thead class="bg-stone-100 text-stone-600 font-bold border-b border-stone-200">
                    <tr>
                        <th class="p-2">ID</th>
                        ${keys.map(k => `<th class="p-2">${k}</th>`).join('')}
                        <th class="p-2 text-right">Aktion</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-stone-100">
    `;

    items.forEach(item => {
        tableHtml += `<tr id="row-${item.id}">`;
        tableHtml += `<td class="p-2 font-mono font-bold text-stone-400">${item.id}</td>`;
        keys.forEach(k => {
            tableHtml += `
                <td class="p-1">
                    <input type="text" data-col="${collectionName}" data-id="${item.id}" data-key="${k}" 
                           value="${item[k] !== undefined ? item[k] : ''}" 
                           class="w-full px-2 py-1 bg-stone-50 border border-stone-200 rounded-md text-xs font-semibold focus:bg-white focus:border-emerald-600 outline-none" />
                </td>
            `;
        });
        tableHtml += `
            <td class="p-2 text-right whitespace-nowrap">
                <button onclick="app.logic.saveInlineRow('${collectionName}', '${item.id}')" class="px-2 sm:px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold shadow-3xs transition">
                    <i class="fas fa-save"></i>
                </button>
            </td>
        `;
        tableHtml += `</tr>`;
    });

    tableHtml += `</tbody></table></div>`;
    container.innerHTML = tableHtml;
};

// Speichert geänderte Zeilenwerte nach Firestore
app.logic.saveInlineRow = async function(collectionName, docId)
{
    const inputs = document.querySelectorAll(`input[data-col="${collectionName}"][data-id="${docId}"]`);
    const updatedData = {};

    inputs.forEach(input => {
        const key = input.getAttribute('data-key');
        let val = input.value.trim();
        if (!isNaN(val) && val !== '') val = Number(val);
        if (val === 'true') val = true;
        if (val === 'false') val = false;
        updatedData[key] = val;
    });

    const res = await app.logic.apiRequest('updateFirestoreDoc', {
        collectionName: collectionName,
        docId: docId,
        data: updatedData
    });

    if (res && res.success)
    {
        app.logic.showToast(`Eintrag ${docId} in ${collectionName} gespeichert!`, 'success');
        await app.logic.refreshGlobalAppData();
    }
    else
    {
        app.logic.showToast('Fehler beim Speichern: ' + (res ? res.error : 'Unbekannt'), 'error');
    }
};