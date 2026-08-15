// =========================================================================
// BMAssistent / LIE Scorecard - Global UI Controls & Feedback
// App_Logic_UI.js
// BSD (Allman) Style
// =========================================================================

app.logic = app.logic || {};

app.logic.updateHeaderRoleIcon = function()
{
    const badgeContainer = document.getElementById('header-role-badge');
    const logoutBtn = document.getElementById('header-logout-btn');

    if (!badgeContainer) return;

    if (!app.state.currentUser || !app.state.currentUser.role)
    {
        badgeContainer.innerHTML = "";
        if (logoutBtn) logoutBtn.classList.add('hidden');
        return;
    }

    if (logoutBtn) logoutBtn.classList.remove('hidden');

    const rolle = app.state.currentUser.role;
    let iconHtml = "";

    if (rolle === "Admin")
    {
        iconHtml = `<i class="fas fa-user-shield text-amber-400 text-sm" title="Rolle: Administrator"></i>`;
    }
    else if (rolle === "Spielleiter")
    {
        iconHtml = `<i class="fas fa-clipboard-list text-stone-200 text-sm" title="Rolle: Spielleiter"></i>`;
    }
    else
    {
        iconHtml = `<i class="fas fa-golf-ball text-stone-300 text-xs" title="Rolle: Spieler"></i>`;
    }

    badgeContainer.innerHTML = iconHtml;
};

app.logic.showToast = function(text, type)
{
    let container = document.getElementById('global-toast-container');
    
    if (!container)
    {
        container = document.createElement('div');
        container.id = 'global-toast-container';
        container.className = 'fixed bottom-20 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 w-full max-w-sm px-4 pointer-events-none';
        document.body.appendChild(container);
    }

    let bgClass = "bg-stone-900 text-white";
    let iconHtml = '<i class="fas fa-info-circle"></i>';

    if (type === 'success')
    {
        bgClass = "bg-emerald-600 text-white shadow-md shadow-emerald-600/20";
        iconHtml = '<i class="fas fa-check-circle"></i>';
    }
    else if (type === 'error')
    {
        bgClass = "bg-red-600 text-white shadow-md shadow-red-600/20";
        iconHtml = '<i class="fas fa-exclamation-circle"></i>';
    }
    else if (type === 'warning')
    {
        bgClass = "bg-amber-500 text-white shadow-md shadow-amber-500/20";
        iconHtml = '<i class="fas fa-triangle-exclamation"></i>';
    }

    const toast = document.createElement('div');
    toast.className = `${bgClass} px-4 py-3 rounded-xl text-xs font-semibold flex items-center space-x-2.5 shadow-lg transition-all duration-300 opacity-0 translate-y-2 pointer-events-auto`;
    toast.innerHTML = `<span>${iconHtml}</span><span class="flex-1">${text}</span>`;
    
    container.appendChild(toast);

    setTimeout(function() {
        toast.classList.remove('opacity-0', 'translate-y-2');
    }, 10);

    setTimeout(function() {
        toast.classList.add('opacity-0', '-translate-y-2');
        setTimeout(function() {
            toast.remove();
        }, 300);
    }, 3200);
};

app.logic.showConfirm = function(title, message, mode, onConfirm)
{
    const modal = document.getElementById('global-confirm-modal');
    const box = document.getElementById('confirm-modal-box');
    const titleEl = document.getElementById('confirm-modal-title');
    const msgEl = document.getElementById('confirm-modal-message');
    const iconContainer = document.getElementById('confirm-modal-icon-container');
    const iconEl = document.getElementById('confirm-modal-icon');
    const btnCancel = document.getElementById('confirm-modal-cancel');
    const btnSubmit = document.getElementById('confirm-modal-submit');

    if (!modal) return;

    titleEl.innerText = title;
    msgEl.innerText = message;

    if (mode === 'danger')
    {
        iconContainer.className = "w-10 h-10 rounded-full flex items-center justify-center text-lg flex-shrink-0 bg-red-100 text-red-600";
        iconEl.className = "fas fa-radiation text-sm";
        btnSubmit.className = "bg-red-600 hover:bg-red-700 text-white font-bold py-2.5 rounded-xl text-xs transition shadow-xs";
    }
    else
    {
        iconContainer.className = "w-10 h-10 rounded-full flex items-center justify-center text-lg flex-shrink-0 bg-emerald-100 text-emerald-700";
        iconEl.className = "fas fa-question-circle text-sm";
        btnSubmit.className = "bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 rounded-xl text-xs transition shadow-xs";
    }

    modal.classList.remove('hidden');
    setTimeout(function() {
        box.classList.remove('opacity-0', 'scale-95');
    }, 10);

    const closeModal = function() {
        box.classList.add('opacity-0', 'scale-95');
        setTimeout(function() {
            modal.classList.add('hidden');
        }, 200);
    };

    btnCancel.onclick = function() {
        closeModal();
    };

    btnSubmit.onclick = function() {
        closeModal();
        if (typeof onConfirm === 'function') onConfirm();
    };
};

app.logic.triggerMasterReset = function()
{
    app.logic.showConfirm(
        "!!! GEFAHRENZONE !!!", 
        "Möchtest du wirklich alle gespielten Runden, Flights und abgegebenen Scorekarten unwiderruflich löschen? Das System wird in den Urzustand versetzt.", 
        "danger", 
        function() 
        {
            const btn = document.getElementById('master-reset-db-btn');
            if (btn)
            {
                btn.disabled = true;
                btn.innerHTML = `<i class="fas fa-bomb fa-spin mr-1"></i> Sprengung läuft...`;
            }

            app.logic.apiRequest('clearTestDataBase')
                .then(function(response)
                {
                    if (response && response.success)
                    {
                        app.logic.showToast("BUMM! Datenbank erfolgreich gereinigt!", "success");
                        
                        app.state.spieltage = [];
                        app.state.scoreCards = [];
                        app.state.flights = [];
                        app.state.liveScores = {};
                        
                        app.router.navigate('dashboard');
                    }
                    else
                    {
                        app.logic.showToast("Fehler beim Master-Reset: " + response.error, "error");
                        if (btn)
                        {
                            btn.disabled = false;
                            btn.innerHTML = `<i class="fas fa-bomb mr-1"></i> Testdaten-Sprengung ausführen`;
                        }
                    }
                });
        }
    );
};

// Öffnet das Pixel Golf Run Mini-Game
app.logic.openPixelGolfGame = function()
{
    const currentUser = app.state.currentUser;
    const spielerName = currentUser ? (currentUser.nickname || currentUser.name) : "Golfer";

    // Hier die neue GitHub Pages URL eintragen:
    const gameBaseUrl = "https://tst64.github.io/LIE_Scorecards_PixelGolf/";
    const fullGameUrl = `${gameBaseUrl}?player=${encodeURIComponent(spielerName)}`;

    // Prüfen, ob es sich um ein Smartphone/Mobilgerät handelt (Bildschirmbreite < 640px)
    const isMobile = window.innerWidth < 640;

    if (isMobile)
    {
        // Auf Handys direkt im neuen Tab öffnen für perfektes Landschafts-Scaling
        window.open(fullGameUrl, '_blank');
    }
    else
    {
        // Auf Tablets/Desktop im Overlay laden
        const iframe = document.getElementById('pixel-golf-iframe');
        modal = document.getElementById('pixel-golf-modal');

        if (iframe && modal)
        {
            iframe.src = fullGameUrl;
            modal.classList.remove('hidden');
        }
    }
};

// Schließt das Mini-Game Overlay
app.logic.closePixelGolfGame = function()
{
    const iframe = document.getElementById('pixel-golf-iframe');
    const modal = document.getElementById('pixel-golf-modal');

    if (iframe && modal)
    {
        iframe.src = "about:blank"; // Stoppt Audio und Game-Loop im Hintergrund
        modal.classList.add('hidden');
    }
};

