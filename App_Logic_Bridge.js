// =========================================================================
// BMAssistent / LIE Scorecard - Firebase Bridge & Firestore CRUD Operations
// App_Logic_Bridge.js
// BSD (Allman) Style
// =========================================================================

var app = app || {};
app.logic = app.logic || {};

// Global data refresh from Cloud Firestore
app.logic.refreshGlobalAppData = async function()
{
    app.state = app.state || {};

    const icon = document.getElementById('global-refresh-icon');
    const btn = document.getElementById('global-refresh-btn');

    if (btn && icon)
    {
        btn.disabled = true;
        icon.classList.add('fa-spin');
    }

    try
    {
        if (!app.db)
        {
            throw new Error('Firestore database instance (app.db) is not initialized.');
        }

        const [
            spielerSnap, 
            spieltageSnap, 
            scorecardsSnap, 
            scoresSnap, 
            flightsSnap, 
            kurseSnap, 
            plaetzeSnap, 
            bahnenSnap,
            handicapsSnap
        ] = await Promise.all([
            app.db.collection('spieler').get().catch(function() { return { forEach: function() {} }; }),
            app.db.collection('spieltage').get().catch(function() { return { forEach: function() {} }; }),
            app.db.collection('scorecards').get().catch(function() { return { forEach: function() {} }; }),
            app.db.collection('scores').get().catch(function() { return { forEach: function() {} }; }),
            app.db.collection('flights').get().catch(function() { return { forEach: function() {} }; }),
            app.db.collection('kurse').get().catch(function() { return { forEach: function() {} }; }),
            app.db.collection('golfplaetze').get().catch(function() { return { forEach: function() {} }; }),
            app.db.collection('bahnen').get().catch(function() { return { forEach: function() {} }; }),
            app.db.collection('handicaps').get().catch(function() { return { forEach: function() {} }; })
        ]);

        const spielerData = [];
        spielerSnap.forEach(function(doc) { spielerData.push(Object.assign({ id: doc.id }, doc.data())); });
        app.state.spieler = spielerData;

        const spieltageData = [];
        spieltageSnap.forEach(function(doc) { spieltageData.push(Object.assign({ id: doc.id }, doc.data())); });
        app.state.spieltage = spieltageData;

        const scoresMap = {};
        scorecardsSnap.forEach(function(doc) { 
            const data = Object.assign({ id: doc.id }, doc.data());
            if (data.id) scoresMap[data.id] = data;
        });
        scoresSnap.forEach(function(doc) { 
            const data = Object.assign({ id: doc.id }, doc.data());
            if (data.id) scoresMap[data.id] = data;
        });
        app.state.scoreCards = Object.values(scoresMap);

        const flightsData = [];
        flightsSnap.forEach(function(doc) { flightsData.push(Object.assign({ id: doc.id }, doc.data())); });
        app.state.flights = flightsData;

        const kurseData = [];
        kurseSnap.forEach(function(doc) { kurseData.push(Object.assign({ id: doc.id }, doc.data())); });
        app.state.kurse = kurseData;

        const plaetzeData = [];
        plaetzeSnap.forEach(function(doc) { plaetzeData.push(Object.assign({ id: doc.id }, doc.data())); });
        app.state.golfplaetze = plaetzeData;

        const bahnenData = [];
        bahnenSnap.forEach(function(doc) { bahnenData.push(Object.assign({ id: doc.id }, doc.data())); });
        app.state.bahnen = bahnenData;

        const handicapsData = [];
        handicapsSnap.forEach(function(doc) { handicapsData.push(Object.assign({ id: doc.id }, doc.data())); });
        app.state.handicaps = handicapsData;

        if (app.state.currentUser)
        {
            const freshUserMatch = app.state.spieler.find(function(s) 
            { 
                return String(s.id).trim() === String(app.state.currentUser.id).trim(); 
            });
            if (freshUserMatch)
            {
                app.state.currentUser = freshUserMatch;
            }
        }

        if (app.router && typeof app.router.updateNavigationUI === 'function')
        {
            app.router.updateNavigationUI(app.state.currentView);
        }
        if (app.logic && typeof app.logic.updateHeaderRoleIcon === 'function')
        {
            app.logic.updateHeaderRoleIcon();
        }
        if (app.router && typeof app.router.renderCurrentView === 'function' && app.state.currentView)
        {
            app.router.renderCurrentView();
        }
    }
    catch (err)
    {
        console.error('[Bridge] Error loading Firestore data:', err);
        app.logic.showToast("Daten konnten nicht geladen werden.", "error");
    }
    finally
    {
        setTimeout(function()
        {
            if (btn && icon)
            {
                btn.disabled = false;
                icon.classList.remove('fa-spin');
            }
        }, 300);
    }
};

// Abstraction layer for API requests
app.logic.apiRequest = async function(action, payload = {})
{
    console.log(`[Bridge Firestore Request] Action: ${action}`, payload);

    try
    {
        if (action === 'getInitialAppData')
        {
            await app.logic.refreshGlobalAppData();
            return {
                success: true,
                spieler: app.state.spieler,
                golfplaetze: app.state.golfplaetze,
                kurse: app.state.kurse,
                bahnen: app.state.bahnen,
                handicaps: app.state.handicaps,
                spieltage: app.state.spieltage,
                scoreCards: app.state.scoreCards,
                flights: app.state.flights
            };
        }
        else if (action === 'saveLiveScores')
        {
            const scoresArray = payload.payload || payload;
            if (Array.isArray(scoresArray))
            {
                const batch = app.db.batch();
                scoresArray.forEach(function(sc)
                {
                    const docRef = app.db.collection('scorecards').doc(String(sc.id));
                    batch.set(docRef, sc, { merge: true });
                });
                await batch.commit();
            }
            return { success: true };
        }
        else if (action === 'createNewSpieltag')
        {
            const stObj = payload.spieltagObj;
            const flights = payload.flightsPayload || [];

            await app.db.collection('spieltage').doc(String(stObj.id)).set(stObj);

            const batch = app.db.batch();
            flights.forEach(function(f)
            {
                const fRef = app.db.collection('flights').doc(String(f.id));
                batch.set(fRef, f);
            });
            await batch.commit();

            return { success: true };
        }
        else if (action === 'closeSpieltagServer')
        {
            const { spieltagId, bruttoSieger, nettoSieger, handicapUpdates } = payload;
            
            await app.db.collection('spieltage').doc(String(spieltagId)).update({
                status: 'Beendet',
                bruttoSieger: bruttoSieger || '',
                nettoSieger: nettoSieger || ''
            });

            if (handicapUpdates && handicapUpdates.length > 0)
            {
                const batch = app.db.batch();
                handicapUpdates.forEach(function(upd)
                {
                    const spRef = app.db.collection('spieler').doc(String(upd.spielerId));
                    batch.update(spRef, { hcpLIE: parseInt(upd.newHcpLie) });
                });
                await batch.commit();
            }

            return { success: true };
        }
        else if (action === 'cancelSpieltagServer')
        {
            await app.db.collection('spieltage').doc(String(payload.spieltagId)).update({
                status: 'Abgebrochen'
            });
            return { success: true };
        }
        else if (action === 'softDeleteSpieltagServer')
        {
            await app.db.collection('spieltage').doc(String(payload.spieltagId)).update({
                istGeloescht: true
            });
            return { success: true };
        }
        else if (action === 'savePlayerServer')
        {
            const sp = payload;
            await app.db.collection('spieler').doc(String(sp.id)).set(sp, { merge: true });
            return { success: true };
        }
        else if (action === 'deletePlayerServer')
        {
            await app.db.collection('spieler').doc(String(payload.spielerId)).delete();
            return { success: true };
        }
        else if (action === 'getVaultLockStatus')
        {
            const doc = await app.db.collection('settings').doc('vault').get();
            const data = doc.exists ? doc.data() : {};
            return { success: true, isUnlocked: !!data.isUnlocked };
        }
        else if (action === 'toggleVaultLock')
        {
            await app.db.collection('settings').doc('vault').set({ isUnlocked: !!payload.status }, { merge: true });
            return { success: true, isUnlocked: !!payload.status };
        }
        else if (action === 'updateFirestoreDoc')
        {
            const { collectionName, docId, data } = payload;
            await app.db.collection(collectionName).doc(String(docId)).set(data, { merge: true });
            return { success: true };
        }
        else if (action === 'deleteFirestoreDoc')
        {
            const { collectionName, docId } = payload;
            await app.db.collection(collectionName).doc(String(docId)).delete();
            return { success: true };
        }
        else if (action === 'verifyPlayerPin')
        {
            const spDoc = await app.db.collection('spieler').doc(String(payload.spielerId)).get();
            if (!spDoc.exists) 
            {
                return { success: false, error: 'Spieler nicht gefunden' };
            }
            const spData = spDoc.data();
            
            const dbPin = spData.pin || '0000';
            
            if (String(dbPin).trim() === String(payload.pin).trim()) 
            {
                return { success: true, mustChangePin: !!spData.mustChangePin };
            } 
            else 
            {
                return { success: false, error: 'PIN inkorrekt' };
            }
        }
        else if (action === 'updatePlayerPin')
        {
            await app.db.collection('spieler').doc(String(payload.spielerId)).set({ pin: payload.newPin, mustChangePin: false }, { merge: true });
            return { success: true };
        }
        else if (action === 'requestTempPin')
        {
            const spDoc = await app.db.collection('spieler').doc(String(payload.spielerId)).get();
            if (!spDoc.exists) 
            {
                return { success: false, error: 'Spieler nicht gefunden' };
            }
            const spData = spDoc.data();
            
            const tempPin = Math.floor(1000 + Math.random() * 9000).toString();
            
            await app.db.collection('spieler').doc(String(payload.spielerId)).set({ pin: tempPin, mustChangePin: true }, { merge: true });
            
            if (typeof CONFIG !== 'undefined' && CONFIG.gasUrl)
            {
                try
                {
                    const requestBody = JSON.stringify({ action: 'sendTempPinEmail', spielerId: payload.spielerId, tempPin: tempPin });
                    await fetch(`${CONFIG.gasUrl}?data=${encodeURIComponent(requestBody)}`, { method: 'GET', mode: 'no-cors' });
                }
                catch (mailErr)
                {
                    console.warn("[Bridge] GAS email dispatch warning:", mailErr);
                }
            }
            
            return { success: true, tempPin: tempPin, email: spData.email };
        }
        else
        {
            console.warn(`[Bridge] Unhandled action "${action}", returning success.`);
            return { success: true };
        }
    }
    catch (err)
    {
        console.error(`[Bridge Error] for action "${action}":`, err);
        return { success: false, error: err.message };
    }
};

app.logic.startLivePolling = function(spieltagId, holeNr, flightSeq)
{
    app.logic.stopLivePolling();

    const triggerValue = function()
    {
        const statusDot = document.getElementById('connection-status');
        if (statusDot)
        {
            statusDot.className = "w-3 h-3 rounded-full bg-amber-400";
        }

        app.db.collection('scorecards').get()
            .then(function(snapshot)
            {
                if (statusDot)
                {
                    statusDot.className = "w-3 h-3 rounded-full bg-emerald-400";
                }

                const freshScores = [];
                snapshot.forEach(function(doc)
                {
                    const d = doc.data();
                    if (String(d.spieltagId).trim() === String(spieltagId).trim())
                    {
                        freshScores.push(Object.assign({ id: doc.id }, d));
                    }
                });

                const otherRoundScores = app.state.scoreCards.filter(function(sc)
                {
                    return String(sc.spieltagId).trim() !== String(spieltagId).trim();
                });
                app.state.scoreCards = otherRoundScores.concat(freshScores);

                const container = document.getElementById('app-container');
                if (container)
                {
                    if (app.state.currentView === 'leaderboard')
                    {
                        const activeTab = document.querySelector('[onclick*="brutto"]')?.classList.contains('bg-white') ? 'brutto' : 'netto';
                        container.innerHTML = app.views.leaderboard(spieltagId, activeTab);
                    }
                    else if (app.state.currentView === 'score_eingabe' && holeNr)
                    {
                        const ungesicherteAenderungen = Object.keys(app.state.liveScores).filter(function(k)
                        {
                            return k.startsWith(spieltagId + "_");
                        }).length;

                        if (ungesicherteAenderungen === 0)
                        {
                            container.innerHTML = app.views.score_eingabe(spieltagId, holeNr, flightSeq);
                        }
                    }
                }
            })
            .catch(function(err)
            {
                if (statusDot)
                {
                    statusDot.className = "w-3 h-3 rounded-full bg-red-400";
                }
                console.warn("Polling update failed:", err);
            });
    };

    const msInterval = (app.state.currentPollingRate || 60) * 1000;
    app.state.pollingIntervalId = setInterval(triggerValue, msInterval);
};

app.logic.stopLivePolling = function()
{
    if (app.state.pollingIntervalId)
    {
        clearInterval(app.state.pollingIntervalId);
        app.state.pollingIntervalId = null;
    }
};