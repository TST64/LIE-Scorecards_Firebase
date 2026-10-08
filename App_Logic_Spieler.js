// =========================================================================
// BMAssistent / LIE Scorecard - Players & Authentication
// App_Logic_Spieler.js
// BSD (Allman) Style
// =========================================================================

var app = app || {};
app.logic = app.logic || {};

app.logic.submitPin = async function(event) 
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
        .then(async function(response)
        {
            if (response && response.success)
            {
                // Die Cloud Function hat die PIN serverseitig geprüft und liefert
                // ausschließlich bei Erfolg ein kurzlebiges Firebase Custom Token.
                // Damit entsteht jetzt die echte, geschützte Firebase-Sitzung.
                if (!response.customToken)
                {
                    throw new Error('Anmeldetoken fehlt.');
                }

                // Die Firebase-Anmeldung soll Browser-Neustarts und Seiten-Reloads überleben.
                await firebase.auth().setPersistence(
                    firebase.auth.Auth.Persistence.LOCAL
                );

                await firebase.auth().signInWithCustomToken(response.customToken);
                await app.logic.apiRequest('getInitialAppData');

                const ausgewaehlterSpieler = (app.state && app.state.spieler)
                    ? app.state.spieler.find(function(s) { return String(s.id).trim() === String(spielerId).trim(); })
                    : null;

                if (!ausgewaehlterSpieler)
                {
                    app.logic.showToast("Spielerdaten konnten nicht geladen werden!", "error");
                    resetButton(btn);
                    return;
                }

                app.state = app.state || {};
                app.state.currentUser = ausgewaehlterSpieler;
                app.state.currentUser.mustChangePin = !!response.mustChangePin;
                localStorage.setItem('lie_scorecard_user_id', ausgewaehlterSpieler.id);

                if (app.logic.updateHeaderRoleIcon) app.logic.updateHeaderRoleIcon();

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
        .then(async function(response) {
            if (response && response.success) {
                if (firebase.auth().currentUser)
                {
                    await firebase.auth().currentUser.getIdToken(true);
                }
                app.state.currentUser.mustChangePin = false;
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

    const currentUser = app.state ? app.state.currentUser : null;
    const isAdmin = currentUser && currentUser.role === 'Admin';

    const spielerObj = {
        isNew: isNew,
        id: idInput.value.trim(),
        nickname: nicknameInput.value.trim(),
        name: nameInput.value.trim(),
        email: emailInput.value.trim()
    };

    // Nur ein Admin darf administrative Spielerdaten übertragen.
    if (isAdmin)
    {
        spielerObj.teeColor = teeSelect ? teeSelect.value : 'Gelb';
        spielerObj.hcpOfficial = parseFloat(hcpOffInput ? hcpOffInput.value : 54.0);
        spielerObj.hcpLIE = parseInt(hcpLieInput ? hcpLieInput.value : 54);
        spielerObj.role = roleSelect ? roleSelect.value : 'Spieler';
    }

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

                if (
                    isAdmin &&
                    app.state.currentUser &&
                    String(app.state.currentUser.id).trim() === String(spielerObj.id).trim()
                )
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
                        if (app.state && app.state.spieler)
                        {
                            // KORREKTUR: Filtert NUR den gelöschten Spieler heraus
                            app.state.spieler = app.state.spieler.filter(function(s) { 
                                return String(s.id).trim() !== String(spielerId).trim(); 
                            });
                        }
                        app.logic.showToast("Spieler erfolgreich gelöscht.", "success");
                        if (app.router && typeof app.router.navigate === 'function') app.router.navigate('spieler');
                    }
                    else
                    {
                        app.logic.showToast("Fehler beim Löschen: " + (response ? response.error : "Unbekannt"), "error");
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
        async function()
        {
            try
            {
                // Firebase-Sitzung vollständig beenden.
                if (typeof firebase !== 'undefined' && firebase.auth)
                {
                    await firebase.auth().signOut();
                }

                // Geschützte Benutzerdaten aus dem lokalen App-Zustand entfernen.
                if (app.state)
                {
                    app.state.currentUser = null;
                    app.state.spieler = [];
                }

                localStorage.removeItem('lie_scorecard_user_id');

                if (app.logic.updateHeaderRoleIcon)
                {
                    app.logic.updateHeaderRoleIcon();
                }

                // Nach dem Logout nur die minimale öffentliche Spielerliste
                // für die Namensauswahl neu laden.
                await app.logic.loadLoginPlayers();

                app.router.navigate('login');
                app.logic.showToast("Erfolgreich abgemeldet.", "success");
            }
            catch (err)
            {
                console.error("[Logout] Fehler:", err);

                // Auch bei einem Fehler keine alten Benutzerdaten anzeigen.
                if (app.state)
                {
                    app.state.currentUser = null;
                    app.state.spieler = [];
                }

                localStorage.removeItem('lie_scorecard_user_id');

                app.router.navigate('login');
                app.logic.showToast(
                    "Abmeldung nicht vollständig abgeschlossen. Bitte Seite neu laden.",
                    "error"
                );
            }
        }
    );
};

/**
 * Resets all players' LIE handicaps to 26.0 and sets new season start date.
 */
app.logic.startNeueSaison = function()
{
    // Try reading date from all possible DOM input fields or global config state
    const dateInput = document.getElementById('saison-startdatum') || 
                      document.getElementById('edit-saison-start') || 
                      document.getElementById('admin-saison-start') ||
                      document.querySelector('input[type="date"]');

    var startDate = null;

    if (dateInput && dateInput.value)
    {
        startDate = dateInput.value;
    }
    else if (app.state && app.state.config && app.state.config.saisonStartDatum)
    {
        startDate = app.state.config.saisonStartDatum;
    }
    else
    {
        startDate = new Date().toISOString().split('T')[0];
    }

    app.logic.showConfirm(
        "Neue Saison starten?",
        "Bist du sicher? Alle LIE Handicaps der Spieler werden auf 26.0 zurückgesetzt und das Saison-Startdatum wird auf " + startDate + " gesetzt.",
        "warning",
        async function()
        {
            try
            {
                // 1. Reset all local player state LIE handicaps to 26
                if (app.state && Array.isArray(app.state.spieler))
                {
                    for (var i = 0; i < app.state.spieler.length; i++)
                    {
                        var player = app.state.spieler[i];
                        player.hcpLIE = 26;

                        // Persist updated player to backend
                        await app.logic.apiRequest('savePlayerServer', player);
                    }
                }

                // 2. Persist new season start date
                await app.logic.apiRequest('startNeueSaisonServer', { startDate: startDate });

                // Update local config state
                if (app.state && app.state.config)
                {
                    app.state.config.saisonStartDatum = startDate;
                }

                app.logic.showToast("Neue Saison gestartet! Alle HCPs stehen auf 26.0.", "success");

                if (typeof app.logic.refreshGlobalAppData === 'function')
                {
                    await app.logic.refreshGlobalAppData();
                }

                if (app.router && typeof app.router.navigate === 'function')
                {
                    app.router.navigate('admin');
                }
            }
            catch (err)
            {
                console.error("Error executing season reset:", err);
                app.logic.showToast("Saison-Reset teilweise fehlgeschlagen.", "error");
            }
        }
    );
};

/**
 * Saves only the season start date.
 */
app.logic.saveSaisonStartDate = function()
{
    const dateInput = document.getElementById('saison-startdatum') || 
                      document.getElementById('edit-saison-start') || 
                      document.getElementById('admin-saison-start') ||
                      document.querySelector('input[type="date"]');

    if (!dateInput || !dateInput.value) return;

    const chosenDate = dateInput.value;

    if (app.state && app.state.config)
    {
        app.state.config.saisonStartDatum = chosenDate;
    }

    app.logic.apiRequest('saveSaisonStartDateServer', { startDate: chosenDate })
        .then(function(response)
        {
            if (response && response.success)
            {
                app.logic.showToast("Saison-Startdatum erfolgreich gespeichert!", "success");
            }
            else
            {
                app.logic.showToast("Datum gespeichert: " + chosenDate, "info");
            }
        });
};

app.logic.loadOwnPrivateProfile = async function()
{
    if (!app.state || !app.state.currentUser || !app.db)
    {
        return null;
    }

    const playerId = String(app.state.currentUser.id).trim();

    const doc = await app.db
        .collection('spieler')
        .doc(playerId)
        .get();

    if (!doc.exists)
    {
        return null;
    }

    return doc.data();
};