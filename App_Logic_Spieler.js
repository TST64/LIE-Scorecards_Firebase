// =========================================================================
// BMAssistent / LIE Scorecard - Players & Authentication
// App_Logic_Spieler.js
// BSD (Allman) Style
// =========================================================================

var app = app || {};
app.logic = app.logic || {};

// Read the authoritative non-secret status as well as the actual refreshed token.
app.logic.readPlayerSessionState = async function(authUser)
{
    if (!authUser) throw new Error('session');
    const result = await authUser.getIdTokenResult(true);
    if (!result.claims || result.claims.playerId !== authUser.uid) throw new Error('identity');
    const status = await app.logic.callFunction('getPlayerSessionState', {});
    if (!status || status.success !== true || status.playerId !== authUser.uid) throw new Error('status');
    return { ...status, mustChangePin: status.mustChangePin !== false || result.claims.mustChangePin !== false };
};
app.logic.submitPin = async function(event)
{
    if (event) { if (event.preventDefault) event.preventDefault(); if (event.stopPropagation) event.stopPropagation(); }
    const btn = document.getElementById('loginSubmitBtn') || (event && event.target);
    if (btn && btn.disabled) return false;
    const spielerId = document.getElementById('loginSpielerSelect')?.value;
    const pinInput = document.getElementById('loginPinInput');
    if (!spielerId || !pinInput || !pinInput.value.trim()) { app.logic.showToast('Bitte Namen auswählen und PIN eintippen!', 'info'); return false; }
    if (btn) btn.disabled = true;
    try
    {
        const response = await app.logic.apiRequest('verifyPlayerPin', { spielerId, pin: pinInput.value });
        if (!response || response.success !== true || !response.customToken) throw new Error('login');
        await firebase.auth().setPersistence(firebase.auth.Auth.Persistence.LOCAL);
        await firebase.auth().signInWithCustomToken(response.customToken);
        const status = await app.logic.readPlayerSessionState(firebase.auth().currentUser);
        if (status.playerId !== String(spielerId)) throw new Error('identity');
        if (status.mustChangePin) await app.logic.loadLoginPlayers();
        else await app.logic.apiRequest('getInitialAppData');
        const player = (app.state.spieler || []).find(s => String(s.id) === String(spielerId));
        if (!player) throw new Error('profile');
        app.state.currentUser = { ...player, role: status.role, mustChangePin: status.mustChangePin };
        localStorage.setItem('lie_scorecard_user_id', player.id);
        pinInput.value = '';
        if (app.logic.updateHeaderRoleIcon) app.logic.updateHeaderRoleIcon();
        if (!status.mustChangePin && app.logic.resumeScoreAutoSyncV2)app.logic.resumeScoreAutoSyncV2().catch(()=>{});
        app.router.navigate(status.mustChangePin ? 'pin_aendern' : 'dashboard');
    }
    catch (_)
    {
        if (firebase.auth().currentUser && firebase.auth().currentUser.uid === String(spielerId))
        {
            try { await firebase.auth().signOut(); } catch (_) { /* Stay on login; never claim success. */ }
        }
        if (app.state.currentUser && String(app.state.currentUser.id) === String(spielerId)) app.state.currentUser = null;
        app.logic.showToast('Anmeldung nicht bestätigt. Bitte erneut mit der gültigen PIN versuchen.', 'error');
    }
    finally { if (btn) { btn.disabled = false; btn.innerHTML = 'Login'; } }
    return false;
};

app.logic.changePin = async function()
{
    const p1 = document.getElementById('pin-new-1'), p2 = document.getElementById('pin-new-2');
    const button = document.getElementById('change-pin-btn');
    const user = app.state.currentUser;
    if (!p1 || !p2 || !user || app.state.pinChangeInProgress) return false;
    const playerId = String(user.id), value = p1.value.trim();
    if (!/^\d{4,6}$/.test(value))
    {
        app.logic.showToast('Die PIN muss aus 4 bis 6 Ziffern bestehen.', 'info'); return false;
    }
    if (value !== p2.value.trim())
    {
        app.logic.showToast('Die beiden PINs stimmen nicht überein.', 'info'); return false;
    }
    const sameOwner = () => app.state.currentUser && String(app.state.currentUser.id) === playerId
        && firebase.auth().currentUser && firebase.auth().currentUser.uid === playerId;
    app.state.pinChangeInProgress = true;
    if (button) button.disabled = true;
    try
    {
        if (!sameOwner()) throw new Error('session');
        const response = await app.logic.apiRequest('updatePlayerPin', { spielerId: playerId, newPin: value });
        if (!response || response.success !== true || response.mustChangePin !== false || !response.customToken || !sameOwner()) throw new Error('incomplete');
        // Reauthenticate without the previous custom-token overrides, then verify
        // the actually refreshed session rather than trusting a success boolean.
        await firebase.auth().signInWithCustomToken(response.customToken);
        const session = firebase.auth().currentUser;
        const status = await app.logic.readPlayerSessionState(session);
        if (!sameOwner() || status.playerId !== playerId || status.mustChangePin !== false) throw new Error('claims');
        app.state.currentUser.mustChangePin = false;
        app.state.currentUser.role = status.role;
        if(app.logic.resumeScoreAutoSyncV2)app.logic.resumeScoreAutoSyncV2().catch(()=>{});
        p1.value = ''; p2.value = '';
        app.logic.showToast('PIN dauerhaft gespeichert!', 'success');
        app.router.navigate('dashboard');
        return true;
    }
    catch (_)
    {
        // The new PIN may already be active. No rollback, no raw provider error,
        // no success claim. Retry the SAME new PIN or sign in with that PIN.
        app.logic.showToast('PIN-Status nicht bestätigt. Mit derselben neuen PIN erneut versuchen oder neu anmelden.', 'error');
        return false;
    }
    finally
    {
        app.state.pinChangeInProgress = false;
        if (button) button.disabled = false;
    }
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
                if(app.logic.stopScoreAutoSyncV2)app.logic.stopScoreAutoSyncV2();
                // Keep durable buffers; stop timers and remove only in-memory ownership.
                Object.values(app.state.scoreAutoSyncTimers || {}).forEach(clearTimeout);
                clearInterval(app.state.scorePeriodicSyncId);
                app.state.scoreSyncListenersReady = false;
                app.state.scoreBufferOwner = null;
                app.state.pendingScoreKeys = {};
                app.state.liveScores = {};
                app.state.scoreSyncRestored = false;
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
