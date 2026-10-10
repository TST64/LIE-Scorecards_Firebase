// =========================================================================
// BMAssistent / LIE Scorecard - Spieltag & Flight Management (mit 9/18 Loch Logik)
// App_Logic_Spieltage.js
// BSD (Allman) Style
// =========================================================================

var app = app || {};
app.logic = app.logic || {};

app.logic.toggleFlightMode = function()
{
    const manualRadio = document.querySelector('input[name="flight-mode"]:checked');
    const autoSect = document.getElementById('auto-flight-section');
    const manSect = document.getElementById('manual-flight-section');
    const previewCont = document.getElementById('flight-preview-container');

    if (!manualRadio || !autoSect || !manSect || !previewCont) return;

    if (manualRadio.value === 'manual')
    {
        autoSect.classList.add('hidden');
        manSect.classList.remove('hidden');
        previewCont.classList.add('hidden');
        app.logic.buildManualFlightsBuilder();
    }
    else
    {
        autoSect.classList.remove('hidden');
        manSect.classList.add('hidden');
        previewCont.classList.add('hidden');
    }
};

app.logic.buildManualFlightsBuilder = function()
{
    if (!app.state.tempManualFlights || Object.keys(app.state.tempManualFlights).length === 0)
    {
        app.state.tempManualFlights = { 1: [] };
        app.state.activeManualFlightSeq = 1;
    }
    app.logic.renderAllManualFlights();
    app.logic.renderAvailablePlayerChips();
};

app.logic.addEmptyManualFlight = function()
{
    const keys = Object.keys(app.state.tempManualFlights).map(Number);
    const nextSeq = keys.length > 0 ? Math.max(...keys) + 1 : 1;
    
    app.state.tempManualFlights[nextSeq] = [];
    app.state.activeManualFlightSeq = nextSeq;
    
    app.logic.renderAllManualFlights();
    app.logic.renderAvailablePlayerChips();
};

app.logic.renderAllManualFlights = function()
{
    const builderCont = document.getElementById('manual-flights-builder');
    if (!builderCont) return;

    let builderHtml = "";
    Object.keys(app.state.tempManualFlights).forEach(function(fKey)
    {
        const flightNr = parseInt(fKey);
        const spielerIds = app.state.tempManualFlights[flightNr] || [];
        const anzahlSpieler = spielerIds.length;
        
        let spielerListeHtml = `<p class="text-stone-400 text-xs italic text-center py-2">Noch leer. Spieler unten anklicken...</p>`;

        if (anzahlSpieler > 0)
        {
            spielerListeHtml = spielerIds.map(function(sId)
            {
                const spieler = app.state.spieler.find(function(s) { return String(s.id).trim() === String(sId).trim(); });
                return `
                    <div class="flex justify-between items-center bg-stone-100 p-2 rounded-xl border border-stone-200 text-stone-800 font-medium text-xs">
                        <span>${spieler ? spieler.name + ' (' + spieler.nickname + ')' : sId}</span>
                        <button onclick="app.logic.removeSpielerFromManualFlight(${flightNr}, '${sId}'); event.stopPropagation();" class="text-red-600 px-2 touch-target"><i class="fas fa-trash-alt"></i></button>
                    </div>
                `;
            }).join('');
        }

        const isActive = (flightNr === app.state.activeManualFlightSeq);
        const activeStyle = isActive ? 'border-emerald-500 bg-emerald-50/10' : 'border-stone-200 bg-white';

        builderHtml += `
            <div onclick="app.state.activeManualFlightSeq = ${flightNr}; app.logic.renderAllManualFlights();" class="p-4 border ${activeStyle} rounded-2xl space-y-2 cursor-pointer transition">
                <h5 class="text-xs font-bold text-stone-600 uppercase tracking-wider">Flight ${flightNr} (${anzahlSpieler} Spieler)</h5>
                <div class="space-y-1">${spielerListeHtml}</div>
            </div>
        `;
    });

    builderCont.innerHTML = builderHtml;
};

app.logic.renderAvailablePlayerChips = function()
{
    const chipsCont = document.getElementById('available-players-chips');
    if (!chipsCont) return;

    const checkedBoxes = document.querySelectorAll('input[name="teilnehmer"]:checked');
    const gewaehlteIds = Array.from(checkedBoxes).map(function(cb) { return cb.value; });

    let bereitsInFlight = [];
    Object.keys(app.state.tempManualFlights || {}).forEach(function(fKey)
    {
        bereitsInFlight = bereitsInFlight.concat(app.state.tempManualFlights[fKey]);
    });

    const freieIds = gewaehlteIds.filter(function(id) { return !bereitsInFlight.includes(id); });

    if (freieIds.length === 0)
    {
        chipsCont.innerHTML = `<p class="text-stone-400 text-xs italic mx-auto">Alle Spieler zugeordnet.</p>`;
        return;
    }

    chipsCont.innerHTML = freieIds.map(function(sId)
    {
        const spieler = app.state.spieler.find(function(s) { return String(s.id).trim() === String(sId).trim(); });
        const name = spieler ? spieler.nickname : sId;
        return `
            <button type="button" onclick="app.logic.addSpielerToManualFlight('${sId}')" class="bg-white border border-stone-200 hover:bg-stone-50 px-3 py-1.5 rounded-xl text-xs font-semibold text-stone-700 flex items-center gap-1 shadow-3xs touch-target">
                <i class="fas fa-user-plus text-stone-400 text-[10px]"></i> ${name}
            </button>
        `;
    }).join('');
};

app.logic.addSpielerToManualFlight = function(spielerId)
{
    const aktSeq = app.state.activeManualFlightSeq;
    if (!app.state.tempManualFlights[aktSeq]) 
    {
        app.state.tempManualFlights[aktSeq] = [];
    }

    if (app.state.tempManualFlights[aktSeq].length >= 4)
    {
        app.logic.showToast("Ein Flight darf maximal 4 Spieler enthalten.", "info");
        return;
    }

    app.state.tempManualFlights[aktSeq].push(spielerId);
    app.logic.renderAllManualFlights();
    app.logic.renderAvailablePlayerChips();
};

app.logic.removeSpielerFromManualFlight = function(flightNr, spielerId)
{
    if (!app.state.tempManualFlights[flightNr]) return;
    app.state.tempManualFlights[flightNr] = app.state.tempManualFlights[flightNr].filter(function(id) { return id !== spielerId; });
    app.logic.renderAllManualFlights();
    app.logic.renderAvailablePlayerChips();
};

app.logic.saveManualFlights = function()
{
    const kursSelect = document.getElementById('new-spieltag-kurs');
    const dateInput = document.getElementById('new-spieltag-date');
    const rundenTypSelect = document.getElementById('new-spieltag-rundentyp');
    const checkedBoxes = document.querySelectorAll('input[name="teilnehmer"]:checked');
    const gewaehlteIds = Array.from(checkedBoxes).map(function(cb) { return cb.value; });

    if (!kursSelect || !dateInput || gewaehlteIds.length === 0) 
    {
        app.logic.showToast("Bitte fülle alle Felder aus!", "info");
        return;
    }

    if (!app.state.tempManualFlights || Object.keys(app.state.tempManualFlights).length === 0)
    {
        app.logic.showToast("Bitte ordne die Spieler zuerst den Flights zu!", "info");
        return;
    }

    let verbauteIds = [];
    Object.keys(app.state.tempManualFlights).forEach(function(fKey)
    {
        verbauteIds = verbauteIds.concat(app.state.tempManualFlights[fKey]);
    });

    if (verbauteIds.length !== gewaehlteIds.length)
    {
        app.logic.showToast("Es wurden noch nicht alle Turnierteilnehmer zugewiesen!", "info");
        return;
    }

    const rundenTyp = rundenTypSelect ? rundenTypSelect.value : '18';
    const bahnAnzahl = rundenTyp.startsWith('9') ? 9 : 18;

    const spieltagId = "ST-" + Date.now();
    const spieltagObj = {
        id: spieltagId,
        date: dateInput.value,
        kursId: kursSelect.value,
        rundenTyp: rundenTyp,
        bahnAnzahl: bahnAnzahl,
        status: "Aktiv",
        teilnehmerCsv: gewaehlteIds.join(','),
        bruttoSieger: "",
        nettoSieger: "",
        kalenderId: app.state.tempKalenderId || null
    };

    const flightsPayload = [];
    Object.keys(app.state.tempManualFlights).forEach(function(fKey)
    {
        const flightSpielerIds = app.state.tempManualFlights[fKey];
        if (flightSpielerIds.length > 0)
        {
            flightsPayload.push({
                id: `FL-${spieltagId}-${fKey}`,
                spieltagId: spieltagId,
                spielerIdsCsv: flightSpielerIds.join(',')
            });
        }
    });

    const createdFromKalender = !!app.state.tempKalenderId;

    app.logic.apiRequest('createNewSpieltag', { spieltagObj: spieltagObj, flightsPayload: flightsPayload })
        .then(function(response)
        {
            if (response && response.success)
            {
                app.state.spieltage.push(spieltagObj);
                flightsPayload.forEach(function(f) { app.state.flights.push(f); });
                app.state.tempKalenderId = null;
                
                app.logic.showToast("Spieltag und manuelle Flights angelegt!", "success");

                if (createdFromKalender)
                {
                    app.logic.showConfirm(
                        "Spieltag direkt öffnen?", 
                        "Möchtest du diesen Spieltag direkt öffnen, um Scores einzugeben?", 
                        "standard", 
                        function() 
                        {
                            app.router.navigate('score_eingabe', { id: spieltagId, hole: 1, flightSeq: 1 });
                        },
                        function() 
                        {
                            app.router.navigate('spieltage');
                        }
                    );
                }
                else
                {
                    app.router.navigate('spieltage');
                }
            }
            else
            {
                app.logic.showToast("Fehler beim Speichern: " + response.error, "error");
            }
        });
};

app.logic.previewFlights = function()
{
    const checkedBoxes = document.querySelectorAll('input[name="teilnehmer"]:checked');
    const gewaehlteIds = Array.from(checkedBoxes).map(function(cb) { return cb.value; });
    const sizeRadio = document.querySelector('input[name="flight-size"]:checked');
    const previewCont = document.getElementById('flight-preview-container');

    if (gewaehlteIds.length === 0 || !sizeRadio || !previewCont)
    {
        app.logic.showToast("Bitte wähle mindestens einen Spieler aus!", "info");
        return;
    }

    const totalPlayers = gewaehlteIds.length;
    const selectedOption = sizeRadio.value;

    const standardRules = {
        1: [1], 2: [2], 3: [3], 4: [4], 5: [2, 3],
        6: [3, 3], 7: [3, 4], 8: [4, 4], 9: [3, 3, 3], 10: [3, 3, 4],
        11: [3, 4, 4], 12: [4, 4, 4], 13: [3, 3, 3, 4], 14: [3, 3, 4, 4], 15: [3, 4, 4, 4],
        16: [4, 4, 4, 4], 17: [3, 3, 3, 4, 4], 18: [3, 3, 4, 4, 4], 19: [3, 4, 4, 4, 4], 20: [4, 4, 4, 4, 4]
    };

    let flightSizesPattern = [];

    if (selectedOption === 'standard')
    {
        if (standardRules[totalPlayers])
        {
            flightSizesPattern = standardRules[totalPlayers];
        }
        else
        {
            let remaining = totalPlayers;
            while (remaining > 0)
            {
                if (remaining % 4 === 0 || remaining >= 8)
                {
                    flightSizesPattern.push(4);
                    remaining -= 4;
                }
                else if (remaining % 3 === 0)
                {
                    flightSizesPattern.push(3);
                    remaining -= 3;
                }
                else
                {
                    flightSizesPattern.push(4);
                    remaining -= 4;
                }
            }
        }
    }
    else
    {
        const targetSize = parseInt(selectedOption);
        let remaining = totalPlayers;
        while (remaining > 0)
        {
            const currentSize = Math.min(remaining, targetSize);
            flightSizesPattern.push(currentSize);
            remaining -= currentSize;
        }
    }

    const gemischteIds = [...gewaehlteIds];
    for (let i = gemischteIds.length - 1; i > 0; i--)
    {
        const j = Math.floor(Math.random() * (i + 1));
        [gemischteIds[i], gemischteIds[j]] = [gemischteIds[j], gemischteIds[i]];
    }

    const generierteFlights = [];
    flightSizesPattern.forEach(function(size)
    {
        generierteFlights.push(gemischteIds.splice(0, size));
    });

    app.state.tempZufallsFlights = generierteFlights;

    let previewHtml = `<h4 class="text-xs font-bold text-stone-500 uppercase tracking-wider mt-2"><i class="fas fa-eye"></i> Auslosungs-Vorschau (${totalPlayers} Spieler)</h4>`;
    generierteFlights.forEach(function(flightIds, index)
    {
        const namenList = flightIds.map(function(id)
        {
            const spieler = app.state.spieler.find(function(s) { return String(s.id).trim() === String(id).trim(); });
            return spieler ? spieler.nickname : id;
        }).join(', ');

        previewHtml += `
            <div class="p-3 bg-stone-50 border border-stone-200 rounded-xl text-xs text-stone-800 font-semibold flex justify-between items-center">
                <div><span class="text-emerald-700 font-bold">Flight ${index + 1}:</span> ${namenList}</div>
                <span class="text-[10px] bg-stone-200 text-stone-600 px-2 py-0.5 rounded-md font-bold">${flightIds.length}er</span>
            </div>
        `;
    });

    previewHtml += `
        <button onclick="app.logic.saveZufallsFlights()" class="w-full bg-stone-900 hover:bg-stone-800 text-white font-bold py-3 rounded-xl transition text-sm shadow-xs mt-1">
            <i class="fas fa-check-circle mr-1"></i> Auslosung bestätigen & Runde starten
        </button>
    `;

    previewCont.innerHTML = previewHtml;
    previewCont.classList.remove('hidden');
};

app.logic.saveZufallsFlights = function()
{
    const kursSelect = document.getElementById('new-spieltag-kurs');
    const dateInput = document.getElementById('new-spieltag-date');
    const rundenTypSelect = document.getElementById('new-spieltag-rundentyp');
    const checkedBoxes = document.querySelectorAll('input[name="teilnehmer"]:checked');
    const gewaehlteIds = Array.from(checkedBoxes).map(function(cb) { return cb.value; });

    if (!kursSelect || !dateInput || !app.state.tempZufallsFlights) return;

    const rundenTyp = rundenTypSelect ? rundenTypSelect.value : '18';
    const bahnAnzahl = rundenTyp.startsWith('9') ? 9 : 18;

    const spieltagId = "ST-" + Date.now();
    const spieltagObj = {
        id: spieltagId,
        date: dateInput.value,
        kursId: kursSelect.value,
        rundenTyp: rundenTyp,
        bahnAnzahl: bahnAnzahl,
        status: "Aktiv",
        teilnehmerCsv: gewaehlteIds.join(','),
        bruttoSieger: "",
        nettoSieger: "",
        kalenderId: app.state.tempKalenderId || null
    };

    const flightsPayload = app.state.tempZufallsFlights.map(function(flightIds, index)
    {
        return {
            id: `FL-${spieltagId}-${index + 1}`,
            spieltagId: spieltagId,
            spielerIdsCsv: flightIds.join(',')
        };
    });

    const createdFromKalender = !!app.state.tempKalenderId;

    app.logic.apiRequest('createNewSpieltag', { spieltagObj: spieltagObj, flightsPayload: flightsPayload })
        .then(function(response)
        {
            if (response && response.success)
            {
                app.state.spieltage.push(spieltagObj);
                flightsPayload.forEach(function(f) { app.state.flights.push(f); });
                app.state.tempKalenderId = null;
                
                app.logic.showToast("Spieltag und Flights generiert!", "success");

                if (createdFromKalender)
                {
                    app.logic.showConfirm(
                        "Spieltag direkt öffnen?", 
                        "Möchtest du diesen Spieltag direkt öffnen, um Scores einzugeben?", 
                        "standard", 
                        function() 
                        {
                            app.router.navigate('score_eingabe', { id: spieltagId, hole: 1, flightSeq: 1 });
                        },
                        function() 
                        {
                            app.router.navigate('spieltage');
                        }
                    );
                }
                else
                {
                    app.router.navigate('spieltage');
                }
            }
            else
            {
                app.logic.showToast("Fehler aufgetreten: " + response.error, "error");
            }
        });
};

app.logic.cancelActiveSpieltag = function(spieltagId)
{
    app.logic.showConfirm(
        "Spieltag abbrechen?", 
        "Die Runde wird aus der Übersicht ausgeblendet, bleibt aber in der Datenbank dokumentiert.", 
        "danger", 
        function() 
        {
            const btn = document.getElementById('cancel-round-btn');
            if (btn)
            {
                btn.disabled = true;
                btn.innerHTML = `<i class="fas fa-circle-notch fa-spin mr-1"></i> Verarbeite Abbruch...`;
            }

            app.logic.apiRequest('cancelSpieltagServer', { spieltagId: spieltagId })
                .then(function(response)
                {
                    if (response && response.success)
                    {
                        const spieltag = app.state.spieltage.find(function(st) { return st.id === spieltagId; });
                        if (spieltag) spieltag.status = "Abgebrochen";

                        app.logic.showToast("Der Spieltag wurde erfolgreich abgebrochen!", "success");
                        app.router.navigate('spieltage');
                    }
                    else
                    {
                        app.logic.showToast("Fehler beim Abbrechen: " + response.error, "error");
                        if (btn)
                        {
                            btn.disabled = false;
                            btn.innerHTML = `<i class="fas fa-times-circle mr-1"></i> Spieltag abbrechen`;
                        }
                    }
                });
        }
    );
};

app.logic.closeActiveSpieltag = function(spieltagId, bruttoSieger, nettoSieger)
{
    const spieltag = app.state.spieltage.find(function(st) { return String(st.id).trim() === String(spieltagId).trim(); });
    if (!spieltag)
    {
        app.logic.showToast("Spieltag nicht gefunden!", "error");
        return;
    }

    const teilnehmerString = String(spieltag.teilnehmerCsv || "");
    const teilnehmerIds = teilnehmerString ? teilnehmerString.split(',').map(function(id) { return String(id).trim(); }) : [];
    const kursBahnen = app.state.bahnen.filter(function(b) { return String(b.kursId).trim() === String(spieltag.kursId).trim(); });

    // Auswertung für 9 Loch vs 18 Loch
    const is9Loch = (spieltag.bahnAnzahl === 9 || String(spieltag.rundenTyp || '').startsWith('9'));
    const maxBahnen = is9Loch ? 9 : (spieltag.bahnAnzahl || 18);
    const stablefordSoll = is9Loch ? 18 : 36;

    // Bahnen filtern falls Front-9 / Back-9
    let zuWertendeBahnen = kursBahnen;
    if (spieltag.rundenTyp === '9-Front')
    {
        zuWertendeBahnen = kursBahnen.filter(b => parseInt(b.nr) <= 9);
    }
    else if (spieltag.rundenTyp === '9-Back')
    {
        zuWertendeBahnen = kursBahnen.filter(b => parseInt(b.nr) >= 10);
    }

    const handicapUpdates = [];
    let infoText = "";

    teilnehmerIds.forEach(function(spielerId)
    {
        const spieler = app.state.spieler.find(function(s) { return String(s.id).trim() === spielerId; });
        if (!spieler) return;

        const dbScores = app.state.scoreCards.filter(function(sc) 
        {
            return String(sc.spieltagId).trim() === String(spieltagId).trim() && String(sc.spielerId).trim() === spielerId;
        });

        let totalNettoStableford = 0;
        let playedHoles = 0;

        zuWertendeBahnen.forEach(function(bahn)
        {
            const hNr = parseInt(bahn.nr);

            // Beim offiziellen Rundenabschluss sind die zuvor frisch aus
            // Firestore geladenen Scorecards die maßgebliche Datenquelle.
            const dbMatch = dbScores.find(function(sc)
            {
                return sc.hole !== undefined &&
                    parseInt(sc.hole) === hNr;
            });

            let strokes = dbMatch
                ? parseInt(dbMatch.strokes)
                : undefined;

            if (strokes !== undefined && strokes > 0)
            {
                playedHoles++;
                let holeVorgabe = app.logic.calculateHoleVorgabe(
                    spieler,
                    spieltag,
                    hNr
                );
                const nettoPkt = app.logic.calculateNettoStableford(strokes, bahn.par, holeVorgabe);
                totalNettoStableford += nettoPkt;
            }
        });

        if (playedHoles >= maxBahnen)
        {
            const altesHcp = parseInt(spieler.hcpLIE) || 54;
            let neuesHcp = altesHcp;

            if (totalNettoStableford > stablefordSoll)
            {
                const punkteUeberSoll = totalNettoStableford - stablefordSoll;
                const verbesserung = punkteUeberSoll * 0.5;
                neuesHcp = Math.max(0, Math.round(altesHcp - verbesserung));
            }
            else if (totalNettoStableford < stablefordSoll)
            {
                const punkteUnterSoll = stablefordSoll - totalNettoStableford;
                const verschlechterung = punkteUnterSoll * 0.1;
                neuesHcp = Math.min(54, Math.round(altesHcp + verschlechterung));
            }

            if (parseInt(neuesHcp) !== parseInt(altesHcp))
            {
                handicapUpdates.push({
                    spielerId: String(spielerId).trim(),
                    newHcpLie: parseInt(neuesHcp)
                });
                infoText += ` | ${spieler.nickname}: ${altesHcp}➔${neuesHcp}`;
            }
        }
    });

    const confirmationMsg = `Möchtest du die Runde (${maxBahnen} Loch) jetzt schließen? Sieger: Brutto: ${bruttoSieger}, Netto: ${nettoSieger}. HCP-Updates:${infoText || " Keine (alle im Puffer)"}.`;

    app.logic.showConfirm(
        "Spieltag beenden?", 
        confirmationMsg, 
        "standard", 
        function() 
        {
            const btn = document.getElementById('close-round-btn');
            if (btn)
            {
                btn.disabled = true;
                btn.innerHTML = `<i class="fas fa-circle-notch fa-spin mr-1"></i> Berechne & Schließe...`;
            }

            app.logic.apiRequest('closeSpieltagServer', { spieltagId: spieltagId, bruttoSieger: bruttoSieger, nettoSieger: nettoSieger, handicapUpdates: handicapUpdates })
                .then(function(response)
                {
                    if (response && response.success)
                    {
                        const spieltagObj = app.state.spieltage.find(function(st) { return String(st.id).trim() === String(spieltagId).trim(); });
                        if (spieltagObj)
                        {
                            spieltagObj.status = "Beendet";
                            spieltagObj.bruttoSieger = bruttoSieger;
                            spieltagObj.nettoSieger = nettoSieger;
                        }

                        handicapUpdates.forEach(function(upd)
                        {
                            const sp = app.state.spieler.find(function(s) { return String(s.id).trim() === String(upd.spielerId).trim(); });
                            if (sp) sp.hcpLIE = upd.newHcpLie;
                        });

                        app.logic.showToast("Der Spieltag wurde offiziell beendet!", "success");
                        app.router.navigate('spieltage');
                    }
                    else
                    {
                        app.logic.showToast("Fehler beim Beenden der Runde: " + response.error, "error");
                        if (btn)
                        {
                            btn.disabled = false;
                            btn.innerHTML = `<i class="fas fa-flag-checkered mr-1"></i> Spieltag offiziell beenden`;
                        }
                    }
                });
        }
    );
};

app.logic.softDeleteSpieltag = function(spieltagId)
{
    app.logic.showConfirm(
        "Spieltag löschen?", 
        "Möchtest du diesen Spieltag wirklich löschen? Er wird für alle Teilnehmer ausgeblendet.", 
        "danger", 
        function() 
        {
            app.logic.apiRequest('softDeleteSpieltagServer', { spieltagId: spieltagId })
                .then(function(response)
                {
                    if (response && response.success)
                    {
                        const st = app.state.spieltage.find(function(s) { return String(s.id).trim() === String(spieltagId).trim(); });
                        if (st) st.istGeloescht = true;

                        app.logic.showToast("Spieltag erfolgreich gelöscht.", "success");
                        app.router.navigate('spieltage');
                    }
                    else
                    {
                        app.logic.showToast("Fehler beim Löschen: " + (response ? response.error : "Unbekannt"), "error");
                    }
                });
        }
    );
};

// Ermittelt die aktuellen Sieger und startet den Beenden-Dialog
app.logic.finishRoundWithWinners = async function(spieltagId)
{
    const st = app.state.spieltage.find(function(s)
    {
        return String(s.id).trim() === String(spieltagId).trim();
    });

    if (!st) return;

    try
    {
        // Scorecards unmittelbar vor dem Rundenabschluss frisch aus
        // Firestore laden. Dadurch hängen Sieger- und HCP-Berechnung
        // nicht von einem möglicherweise veralteten Browserzustand ab.
        const snapshot = await app.db.collection('scorecards')
            .where('spieltagId', '==', String(spieltagId))
            .get();

        const freshScores = [];

        snapshot.forEach(function(doc)
        {
            freshScores.push(Object.assign(
                { id: doc.id },
                doc.data()
            ));
        });

        // Nur die Scores dieses Spieltags ersetzen.
        // Scorecards anderer Spieltage im lokalen State bleiben erhalten.
        const otherRoundScores = (app.state.scoreCards || []).filter(function(sc)
        {
            return String(sc.spieltagId).trim() !== String(spieltagId).trim();
        });

        app.state.scoreCards = otherRoundScores.concat(freshScores);

        console.log(
            `[Spieltag] ${freshScores.length} Scorecards für ${spieltagId} vor Abschluss frisch geladen.`
        );
    }
    catch (err)
    {
        console.error(
            "[Spieltag] Scorecards konnten vor dem Abschluss nicht geladen werden:",
            err
        );

        app.logic.showToast(
            "Spieltag kann nicht beendet werden: Scores konnten nicht aktuell geladen werden.",
            "error"
        );

        return;
    }

    const is9Loch = (
        st.bahnAnzahl === 9 ||
        String(st.rundenTyp || '').startsWith('9')
    );

    const teilnehmerIds = (st.teilnehmerCsv || "")
        .split(',')
        .map(function(id)
        {
            return String(id).trim();
        })
        .filter(Boolean);

    let kursBahnen = app.state.bahnen.filter(function(b)
    {
        return String(b.kursId).trim() === String(st.kursId).trim();
    });

    if (st.rundenTyp === '9-Front')
    {
        kursBahnen = kursBahnen.filter(function(b)
        {
            return parseInt(b.nr) <= 9;
        });
    }
    else if (st.rundenTyp === '9-Back')
    {
        kursBahnen = kursBahnen.filter(function(b)
        {
            return parseInt(b.nr) >= 10;
        });
    }

    let ergebnisse = teilnehmerIds.map(function(spielerId)
    {
        const spieler = app.state.spieler.find(function(s)
        {
            return String(s.id).trim() === spielerId;
        });

        if (!spieler) return null;

        const dbScores = app.state.scoreCards.filter(function(sc)
        {
            return String(sc.spieltagId).trim() === String(spieltagId).trim()
                && String(sc.spielerId).trim() === spielerId;
        });

        let totalStrokes = 0;
        let totalNetto = 0;
        let playedHoles = 0;

        kursBahnen.forEach(function(bahn)
        {
            const hNr = parseInt(bahn.nr);

            const match = dbScores.find(function(sc)
            {
                return sc.hole !== undefined &&
                       parseInt(sc.hole) === hNr;
            });

            if (match && parseInt(match.strokes) > 0)
            {
                const str = parseInt(match.strokes);

                playedHoles++;
                totalStrokes += str;

                const holeVorgabe = app.logic.calculateHoleVorgabe(
                    spieler,
                    st,
                    hNr
                );

                totalNetto += app.logic.calculateNettoStableford(
                    str,
                    bahn.par,
                    holeVorgabe
                );
            }
        });

        return {
            name: spieler.nickname || spieler.name,
            strokes: totalStrokes,
            netto: totalNetto,
            holes: playedHoles
        };
    }).filter(Boolean);

    const mitScores = ergebnisse.filter(function(r)
    {
        return r.holes > 0;
    });

    // Sieger ermitteln
    const bruttoSieger = mitScores.length > 0
        ? [...mitScores].sort(function(a, b)
          {
              return a.strokes - b.strokes;
          })[0].name
        : "Keiner";

    const nettoSieger = mitScores.length > 0
        ? [...mitScores].sort(function(a, b)
          {
              return b.netto - a.netto;
          })[0].name
        : "Keiner";

    // Ab hier verwendet auch die HCP-Berechnung die frisch geladenen Scores.
    app.logic.closeActiveSpieltag(
        spieltagId,
        bruttoSieger,
        nettoSieger
    );
};


// =========================================================================
// NEU: Spieler-Reihenfolge innerhalb eines Flights (oder des Spieltags) anpassen
// =========================================================================
app.logic.movePlayerInFlight = async function(spieltagId, flightSeq, spielerId, direction, currentHoleNr)
{
    let updateCollection = "";
    let updateDocId = "";
    let newCsv = "";

    const flights = app.state.flights ? app.state.flights.filter(f => String(f.spieltagId) === String(spieltagId)) : [];
    let flight = flights.find(f => {
        const parts = f.id.split('-');
        return parseInt(parts[parts.length-1]) === parseInt(flightSeq);
    });

    if (flight) 
    {
        let ids = (flight.spielerIdsCsv || "").split(',').map(id => id.trim()).filter(Boolean);
        const idx = ids.indexOf(String(spielerId));
        if (idx === -1) return;
        
        const newIdx = idx + direction;
        if (newIdx < 0 || newIdx >= ids.length) return;
        
        // Plätze tauschen
        const temp = ids[idx];
        ids[idx] = ids[newIdx];
        ids[newIdx] = temp;
        
        newCsv = ids.join(',');
        flight.spielerIdsCsv = newCsv; // Lokalen State sofort aktualisieren
        
        updateCollection = 'flights';
        updateDocId = flight.id;
    } 
    else 
    {
        // Fallback: Wenn kein Flight-Objekt existiert, die globale Teilnehmerliste des Spieltags sortieren
        const st = app.state.spieltage.find(s => String(s.id) === String(spieltagId));
        if(!st) return;
        
        let ids = (st.teilnehmerCsv || "").split(',').map(id => id.trim()).filter(Boolean);
        const idx = ids.indexOf(String(spielerId));
        if (idx === -1) return;
        
        const newIdx = idx + direction;
        if (newIdx < 0 || newIdx >= ids.length) return;
        
        const temp = ids[idx];
        ids[idx] = ids[newIdx];
        ids[newIdx] = temp;
        
        newCsv = ids.join(',');
        st.teilnehmerCsv = newCsv;
        
        updateCollection = 'spieltage';
        updateDocId = st.id;
    }

    // UI sofort neu rendern (Optimistic UI)
    app.router.navigate('score_eingabe', { id: spieltagId, hole: currentHoleNr, flightSeq: flightSeq });

    // Änderung leise über die Bridge speichern
    await app.logic.apiRequest('updateFirestoreDoc', { 
        collectionName: updateCollection, 
        docId: updateDocId, 
        data: { 
            [updateCollection === 'flights' ? 'spielerIdsCsv' : 'teilnehmerCsv']: newCsv 
        } 
    });
};

// =========================================================================
// NEU: Modal zum nachträglichen Bearbeiten von Platz & Rundentyp öffnen
// =========================================================================
app.logic.openEditSpieltagModal = function(spieltagId, currentHoleNr, flightSeq) 
{
    const spieltag = app.state.spieltage.find(st => String(st.id) === String(spieltagId));
    if(!spieltag) return;
    
    let kurseOptionsHtml = "";
    if (app.state.kurse) 
    {
        kurseOptionsHtml = app.state.kurse.map(k => {
            const platz = app.state.golfplaetze ? app.state.golfplaetze.find(p => String(p.id) === String(k.platzId)) : null;
            const isSelected = String(k.id) === String(spieltag.kursId) ? 'selected' : '';
            return `<option value="${k.id}" ${isSelected}>${platz ? platz.name : ''} - ${k.name}</option>`;
        }).join('');
    }

    const modalHtml = `
        <div id="edit-spieltag-modal" class="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in">
            <div class="bg-white rounded-2xl w-full max-w-sm p-5 shadow-2xl">
                <h3 class="font-bold text-stone-800 text-base mb-4 flex items-center"><i class="fas fa-cog text-stone-400 mr-2"></i> Spieltag bearbeiten</h3>
                
                <div class="space-y-4">
                    <div>
                        <label class="text-[10px] font-bold text-stone-500 uppercase mb-1 block">Datum</label>
                        <input type="date" id="edit-st-date" value="${spieltag.date || ''}" class="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-xs font-semibold focus:border-emerald-600 outline-none">
                    </div>
                    <div>
                        <label class="text-[10px] font-bold text-stone-500 uppercase mb-1 block">Golfplatz / Kurs</label>
                        <select id="edit-st-kurs" class="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-xs font-semibold focus:border-emerald-600 outline-none">
                            ${kurseOptionsHtml}
                        </select>
                    </div>
                    <div>
                        <label class="text-[10px] font-bold text-stone-500 uppercase mb-1 block">Rundentyp</label>
                        <select id="edit-st-typ" class="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-xs font-semibold focus:border-emerald-600 outline-none">
                            <option value="18" ${spieltag.rundenTyp === '18' ? 'selected' : ''}>18 Loch (Gesamter Platz)</option>
                            <option value="9-Front" ${spieltag.rundenTyp === '9-Front' ? 'selected' : ''}>9 Loch - Front Nine (Loch 1-9)</option>
                            <option value="9-Back" ${spieltag.rundenTyp === '9-Back' ? 'selected' : ''}>9 Loch - Back Nine (Loch 10-18)</option>
                        </select>
                    </div>
                </div>
                
                <div class="flex justify-end space-x-2 mt-6 pt-4 border-t border-stone-100">
                    <button onclick="document.getElementById('edit-spieltag-modal').remove()" class="px-4 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold rounded-xl text-xs transition">Abbrechen</button>
                    <button onclick="app.logic.saveEditSpieltag('${spieltagId}', ${currentHoleNr}, ${flightSeq})" class="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs transition shadow-xs">Speichern</button>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
};

// =========================================================================
// NEU: Geänderten Spieltag speichern
// =========================================================================
app.logic.saveEditSpieltag = async function(spieltagId, currentHoleNr, flightSeq) 
{
    const dateVal = document.getElementById('edit-st-date').value;
    const kursId = document.getElementById('edit-st-kurs').value;
    const rundenTyp = document.getElementById('edit-st-typ').value;
    const bahnAnzahl = rundenTyp.startsWith('9') ? 9 : 18;

    const spieltag = app.state.spieltage.find(st => String(st.id) === String(spieltagId));
    if(!spieltag) return;

    // Lokalen State der Runde aktualisieren
    spieltag.date = dateVal;
    spieltag.kursId = kursId;
    spieltag.rundenTyp = rundenTyp;
    spieltag.bahnAnzahl = bahnAnzahl;

    // Modal schließen und Toast ausgeben
    document.getElementById('edit-spieltag-modal').remove();
    app.logic.showToast("Runde erfolgreich angepasst", "success");

    // UI sofort mit den aktualisierten Parametern neu laden (Netto rechnet sich dadurch on the fly neu!)
    app.router.navigate('score_eingabe', { id: spieltagId, hole: currentHoleNr, flightSeq: flightSeq });

    // Daten im Hintergrund asynchron an die Cloud senden
    await app.logic.apiRequest('updateFirestoreDoc', {
        collectionName: 'spieltage',
        docId: spieltagId,
        data: { date: dateVal, kursId: kursId, rundenTyp: rundenTyp, bahnAnzahl: bahnAnzahl }
    });
};

// =========================================================================
// NEU: Logik für die Tabellarische Schnellerfassung
// =========================================================================
app.logic.updateRapidScoreState = function(spieltagId, spielerId, holeNr, type, value)
{
    // Die Live-Score Keys müssen exakt mit denen der Views_ScoreEingabe.js übereinstimmen
    const key = type === 'strokes' 
        ? `${spieltagId}_${spielerId}_${holeNr}` 
        : `${spieltagId}_${spielerId}_${holeNr}_puts`;

    // Wert bereinigen (leere Felder erlauben)
    const strVal = String(value).trim();
    
    if (strVal === "")
    {
        // Wenn das Feld geleert wird, löschen wir den Key aus dem State
        delete app.state.liveScores[key];
    }
    else
    {
        const intVal = parseInt(strVal);
        if (!isNaN(intVal))
        {
            app.state.liveScores[key] = intVal;
        }
    }
    
    // WICHTIG: Wir rufen hier ganz bewusst NICHT den Router oder eine Render-Funktion auf!
    // Dadurch wird das DOM nicht zerstört, das Input-Feld behält den Fokus und 
    // das zeilenweise TAB-Springen funktioniert blitzschnell und reibungslos.
};


