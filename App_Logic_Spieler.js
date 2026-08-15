// =========================================================================
// BMAssistent / LIE Scorecard - Players & Authentication
// App_Logic_Spieler.js
// BSD (Allman) Style
// =========================================================================

app.logic = app.logic || {};

app.logic.submitPin = function(event) 
{
    if (event) 
    {
        if (typeof event.preventDefault === 'function') event.preventDefault();
        if (typeof event.stopPropagation === 'function') event.stopPropagation();
    }

    const btn = document.getElementById('loginSubmitBtn') || (event && event.target);
    if (btn && btn.disabled) return false;

    const spielerId = document.getElementById('loginSpielerSelect')?.value;
    const pin = document.getElementById('loginPinInput')?.value;

    if (!spielerId || !pin || pin.trim() === "") 
    {
        if (typeof app.logic.showToast === 'function') app.logic.showToast("Bitte Namen auswählen und PIN eintippen!");
        return false;
    }

    if (btn && typeof btn.setAttribute === 'function') 
    {
        btn.disabled = true;
        btn.dataset.oldText = btn.innerText || btn.value;
        btn.innerText = "Prüfe...";
    }

    app.logic.apiRequest('verifyPlayerPin', { spielerId: spielerId, pin: pin.trim() })
    .then(function(response) 
    {
        if (response && response.success) 
        {
            app.state = app.state || {};
            app.state.currentUser = app.state.spieler.find(function(s) {
                return String(s.id) === String(spielerId);
            });

            if (response.mustChange) 
            {
                localStorage.removeItem('lie_scorecard_user_id');
                app.router.navigate('pin_aendern');
            } 
            else 
            {
                if (app.state.currentUser)
                {
                    localStorage.setItem('lie_scorecard_user_id', app.state.currentUser.id);
                }
                app.router.navigate('dashboard');
            }
        } 
        else 
        {
            const errMsg = (response && response.error) ? response.error : "Falsche PIN!";
            if (typeof app.logic.showToast === 'function') app.logic.showToast(errMsg, "error");
            
            if (btn) btn.disabled = false;
            if (btn && btn.dataset.oldText) btn.innerText = btn.dataset.oldText;
        }
    })
    .catch(function(err) 
    {
        if (typeof app.logic.showToast === 'function') app.logic.showToast("Fehler bei der PIN-Verifizierung: " + err.message, "error");
        if (btn) btn.disabled = false;
        if (btn && btn.dataset.oldText) btn.innerText = btn.dataset.oldText;
    });

    return false;
};

app.logic.changePin = function()
{
    const p1 = document.getElementById('pin-new-1');
    const p2 = document.getElementById('pin-new-2');
    if (!p1 || !p2 || !app.state.currentUser) return;

    const val1 = p1.value.trim();
    const val2 = p2.value.trim();

    if (val1.length < 4 || isNaN(val1))
    {
        app.logic.showToast("Die PIN muss mindestens 4 Zahlen lang sein!", "info");
        return;
    }

    if (val1 !== val2)
    {
        app.logic.showToast("Die beiden PINs stimmen nicht überein!", "info");
        return;
    }

    const btn = document.getElementById('change-pin-btn');
    if (btn)
    {
        btn.disabled = true;
        btn.innerHTML = `<i class="fas fa-circle-notch fa-spin mr-1"></i> Speichere PIN...`;
    }

    app.logic.apiRequest('changePlayerPinServer', { spielerId: app.state.currentUser.id, newPin: val1 })
        .then(function(response)
        {
            if (response && response.success)
            {
                app.logic.showToast("PIN geändert! Bitte melde dich mit deiner neuen PIN an.", "success");
                app.state.currentUser = null;
                localStorage.removeItem('lie_scorecard_user_id');
                app.router.navigate('login');
            }
            else
            {
                app.logic.showToast("Fehler bei PIN-Änderung: " + response.error, "error");
                if (btn)
                {
                    btn.disabled = false;
                    btn.innerHTML = `<i class="fas fa-key mr-1"></i> PIN dauerhaft speichern`;
                }
            }
        });
};

app.logic.savePlayer = function(isNew)
{
    const idInput = document.getElementById('edit-sp-id');
    const nicknameInput = document.getElementById('edit-sp-nickname');
    const nameInput = document.getElementById('edit-sp-name');
    const emailInput = document.getElementById('edit-sp-email');
    const hcpOffInput = document.getElementById('edit-sp-hcpoff');
    const hcpLieInput = document.getElementById('edit-sp-hcplie');
    const teeSelect = document.getElementById('edit-sp-tee');
    const roleSelect = document.getElementById('edit-sp-role');

    if (!idInput || !nicknameInput || !nameInput || !emailInput) return;

    const spielerObj = {
        isNew: isNew,
        id: idInput.value.trim(),
        nickname: nicknameInput.value.trim(),
        name: nameInput.value.trim(),
        email: emailInput.value.trim(),
        teeColor: teeSelect ? teeSelect.value : 'Gelb',
        hcpOfficial: parseFloat(hcpOffInput ? hcpOffInput.value : 54.0),
        hcpLIE: parseInt(hcpLieInput ? hcpLieInput.value : 54),
        role: roleSelect ? roleSelect.value : 'Spieler'
    };

    if (!spielerObj.id || !spielerObj.nickname || !spielerObj.name || !spielerObj.email)
    {
        app.logic.showToast("Bitte fülle alle Pflichtfelder (*) aus!", "info");
        return;
    }

    const btn = document.getElementById('save-player-btn');
    if (btn)
    {
        btn.disabled = true;
        btn.innerHTML = `<i class="fas fa-circle-notch fa-spin mr-1"></i> Speichere Profil...`;
    }

    app.logic.apiRequest('savePlayerServer', spielerObj)
        .then(function(response)
        {
            if (response && response.success)
            {
                app.logic.showToast("Spielerprofil erfolgreich gespeichert!", "success");

                if (app.state.currentUser && String(app.state.currentUser.id).trim() === String(spielerObj.id).trim())
                {
                    app.state.currentUser.role = spielerObj.role;
                }

                app.logic.apiRequest('getInitialAppData')
                    .then(function(freshData)
                    {
                        if (freshData && freshData.success)
                        {
                            app.state.spieler = freshData.spieler || [];
                            app.state.spieltage = freshData.spieltage || [];
                        }
                        
                        app.router.updateNavigationUI('spieler');
                        app.logic.updateHeaderRoleIcon();
                        app.router.navigate('spieler');
                    });
            }
            else
            {
                app.logic.showToast("Fehler: " + (response ? response.error : "Unbekannt"), "error");
                if (btn)
                {
                    btn.disabled = false;
                    btn.innerHTML = `<i class="fas fa-save mr-1"></i> Profil speichern`;
                }
            }
        });
};

app.logic.deletePlayer = function(spielerId)
{
    app.logic.showConfirm(
        "Spieler löschen?", 
        "Möchtest du diesen Spieler wirklich unwiderruflich aus der Datenbank löschen? Alle PIN-Einträge werden ebenfalls entfernt.", 
        "danger", 
        function() 
        {
            app.logic.apiRequest('deletePlayerServer', { spielerId: spielerId })
                .then(function(response)
                {
                    if (response && response.success)
                    {
                        app.state.spieler = app.state.spieler.filter(function(s) { return String(s.id).trim() !== String(spielerId).trim(); });
                        app.logic.showToast("Spieler erfolgreich gelöscht.", "success");
                        app.router.navigate('spieler');
                    }
                    else
                    {
                        app.logic.showToast("Fehler beim Löschen: " + response.error, "error");
                    }
                });
        }
    );
};

app.logic.resetPlayerPin = function(spielerId)
{
    app.logic.showConfirm(
        "PIN zurücksetzen?", 
        "Möchtest du die PIN dieses Spielers wirklich auf den Standardwert '4722' zurücksetzen?", 
        "standard", 
        function() 
        {
            app.logic.apiRequest('setPlayerPin', { spielerId: spielerId, pin: "4722", mustChange: true })
                .then(function(response)
                {
                    if (response && response.success)
                    {
                        app.logic.showToast("Die PIN wurde erfolgreich auf 4722 zurückgesetzt.", "success");
                    }
                    else
                    {
                        app.logic.showToast("Fehler bei PIN-Reset: " + response.error, "error");
                    }
                });
        }
    );
};

app.logic.logout = function()
{
    app.logic.showConfirm(
        "Abmelden?", 
        "Möchtest du dich wirklich aus der LIE Scorecard abmelden?", 
        "standard", 
        function() 
        {
            app.state.currentUser = null;
            localStorage.removeItem('lie_scorecard_user_id');
            app.logic.updateHeaderRoleIcon();
            app.router.navigate('login');
            app.logic.showToast("Erfolgreich abgemeldet.", "success");
        }
    );
};