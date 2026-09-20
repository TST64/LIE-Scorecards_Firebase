// =========================================================================
// BMAssistent / LIE Scorecard - Players & Authentication
// App_Logic_Spieler.js
// BSD (Allman) Style
// =========================================================================

var app = app || {};
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
        if (typeof app.logic.showToast === 'function') app.logic.showToast("Bitte Namen auswählen und PIN eintippen!", "info");
        return false;
    }

    if (btn)
    {
        btn.disabled = true;
        btn.innerHTML = `<i class="fas fa-circle-notch fa-spin"></i> Prüfe Identität...`;
    }

    app.logic.apiRequest('verifyPlayerPin', { spielerId: spielerId, pin: pin })
        .then(function(response)
        {
            if (response && response.success)
            {
                const ausgewaehlterSpieler = (app.state && app.state.spieler) 
                    ? app.state.spieler.find(function(s) { return String(s.id).trim() === String(spielerId).trim(); }) 
                    : null;

                if (!ausgewaehlterSpieler)
                {
                    app.logic.showToast("Spielerdaten nicht geladen!", "error");
                    resetButton(btn);
                    return;
                }

                app.state = app.state || {};
                app.state.currentUser = ausgewaehlterSpieler;
                localStorage.setItem('lie_scorecard_user_id', ausgewaehlterSpieler.id);

                if (app.logic.updateHeaderRoleIcon) app.logic.updateHeaderRoleIcon();

                // Force user to change PIN if they logged in with a temporary PIN
                if (response.mustChangePin)
                {
                    app.logic.showToast("Bitte lege eine neue persönliche PIN fest.", "warning");
                    if (app.router && typeof app.router.navigate === 'function') app.router.navigate('pin_aendern');
                }
                else
                {
                    if (app.router && typeof app.router.navigate === 'function') app.router.navigate('dashboard');
                }
            }
            else
            {
                app.logic.showToast("PIN ist inkorrekt!", "error");
                resetButton(btn);
            }
        }).catch(function(error) {
            app.logic.showToast("Verbindungsfehler zur Datenbank.", "error");
            resetButton(btn);
        });

    function resetButton(button) {
        if (button) {
            button.disabled = false;
            button.innerHTML = `Login <i class="fas fa-sign-in-alt ml-1"></i>`; 
        }
    }

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

    app.logic.apiRequest('updatePlayerPin', { spielerId: app.state.currentUser.id, newPin: val1 })
        .then(function(response) {
            if (response && response.success) {
                app.logic.showToast("PIN dauerhaft gespeichert!", "success");
                app.router.navigate('dashboard');
            } else {
                app.logic.showToast("Fehler beim Speichern der PIN.", "error");
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

                app.logic.refreshGlobalAppData().then(function()
                {
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
        "Möchtest du diesen Spieler wirklich unwiderruflich aus der Datenbank löschen?", 
        "danger", 
        function() 
        {
            app.logic.apiRequest('deletePlayerServer', { spielerId: spielerId })
                .then(function(response)
                {
                    if (response && response.success)
                    {
                        app.state.spieler = app.state.spieler.filter(function(s) { return String(s.id).trim() === String(spielerId).trim(); });
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

app.logic.logout = function()
{
    app.logic.showConfirm(
        "Abmelden?", 
        "Möchtest du dich wirklich aus der LIE Scorecard abmelden?", 
        "standard", 
        function() 
        {
            if (typeof firebase !== 'undefined' && firebase.auth) {
                firebase.auth().signOut().catch(e => console.warn("Firebase signout error:", e));
            }

            if (app.state)
            {
                app.state.currentUser = null;
            }
            localStorage.removeItem('lie_scorecard_user_id');
            if (app.logic.updateHeaderRoleIcon)
            {
                app.logic.updateHeaderRoleIcon();
            }
            app.router.navigate('login');
            app.logic.showToast("Erfolgreich abgemeldet.", "success");
        }
    );
};