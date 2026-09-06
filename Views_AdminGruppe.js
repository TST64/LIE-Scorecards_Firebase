// =========================================================================
// BMAssistent / LIE Scorecard - Gruppe & Spieler-Übersicht View
// Views_AdminGruppe.js
// BSD (Allman) Style
// =========================================================================

app.views = app.views || {};

app.views.spieler = function()
{
    const currentUser = app.state.currentUser || {};
    const isAdmin = currentUser.role === 'Admin';
    const isLeiter = isAdmin || currentUser.role === 'Spielleiter';

    let spielerListeHtml = "";
    if (app.state.spieler && app.state.spieler.length > 0)
    {
        const sortierteSpieler = [...app.state.spieler].sort(function(a, b) 
        {
            return (a.name || "").localeCompare(b.name || "");
        });

        spielerListeHtml = sortierteSpieler.map(function(s)
        {
            const istEigenerUser = String(s.id).trim() === String(currentUser.id).trim();
            const hcpOff = s.hcpOfficial !== undefined ? s.hcpOfficial : 54.0;
            const hcpLie = s.hcpLIE !== undefined ? s.hcpLIE : 54;
            const tee = s.teeColor || 'Gelb';
            const rolle = s.role || 'Spieler';

            let adminActionsHtml = "";
            if (isAdmin)
            {
                adminActionsHtml = `
                    <div class="flex items-center space-x-1">
                        <button onclick="app.router.navigate('spieler_edit', { id: '${s.id}' })" class="text-zinc-400 hover:text-emerald-600 p-2.5 rounded-xl transition touch-target" title="Bearbeiten">
                            <i class="fas fa-pen-to-square text-xs"></i>
                        </button>
                        <button onclick="app.logic.deletePlayer('${s.id}')" class="text-zinc-400 hover:text-red-600 p-2.5 rounded-xl transition touch-target" title="Löschen">
                            <i class="fas fa-trash-alt text-xs"></i>
                        </button>
                    </div>
                `;
            }

            return `
                <div class="bg-white/80 backdrop-blur-md border ${istEigenerUser ? 'border-emerald-500/80 shadow-sm shadow-emerald-500/10' : 'border-zinc-200/80'} rounded-2xl p-4 flex justify-between items-center transition">
                    <div class="space-y-1">
                        <div class="flex items-center space-x-2">
                            <h4 class="font-black text-zinc-900 text-sm tracking-tight">${s.name}</h4>
                            <span class="text-[10px] bg-zinc-100 text-zinc-600 px-2 py-0.5 rounded-lg font-extrabold">${s.nickname}</span>
                            ${istEigenerUser ? '<span class="text-[10px] bg-emerald-500/10 text-emerald-800 border border-emerald-500/20 px-2 py-0.5 rounded-lg font-extrabold">Du</span>' : ''}
                        </div>
                        <div class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500 font-medium">
                            <span>HCP LIE: <strong class="text-zinc-800 font-black">${hcpLie}</strong></span>
                            <span>HCP Off.: <strong class="text-zinc-800 font-black">${hcpOff}</strong></span>
                            <span>Tee: <strong class="text-zinc-800 font-black">${tee}</strong></span>
                            <span>Rolle: <strong class="text-zinc-800 font-black">${rolle}</strong></span>
                        </div>
                    </div>
                    ${adminActionsHtml}
                </div>
            `;
        }).join('');
    }
    else
    {
        spielerListeHtml = `
            <div class="text-center py-10 bg-white/60 backdrop-blur-md border border-zinc-200/80 rounded-2xl">
                <p class="text-zinc-400 text-xs italic font-medium">Keine Spieler in der Datenbank gefunden.</p>
            </div>
        `;
    }

    let adminHeaderAddBtn = "";
    if (isAdmin)
    {
        adminHeaderAddBtn = `
            <button onclick="app.router.navigate('spieler_edit', { id: 'new' })" class="bg-emerald-600 hover:bg-emerald-500 text-white font-black px-4 py-2.5 rounded-2xl text-xs transition shadow-md shadow-emerald-600/20 flex items-center gap-1.5 touch-target">
                <i class="fas fa-user-plus"></i> Neuer Spieler
            </button>
        `;
    }

    return `
        <div class="space-y-5 animate-fade-in pb-12">
            <div class="flex justify-between items-center">
                <div>
                    <h2 class="text-xl font-black text-zinc-900 tracking-tight">Gruppe & Spieler</h2>
                    <p class="text-xs text-zinc-400 font-medium -mt-0.5">Übersicht aller Club-Mitglieder und Handicaps</p>
                </div>
                ${adminHeaderAddBtn}
            </div>

            <div class="space-y-3">
                ${spielerListeHtml}
            </div>
        </div>
    `;
};