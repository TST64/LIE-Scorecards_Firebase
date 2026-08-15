// =========================================================================
// BMAssistent / LIE Scorecard - Spieltag & Flight Management
// App_Logic_Spieltage.js
// BSD (Allman) Style
// =========================================================================

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

    const spieltagId = "ST-" + Date.now();
    const spieltagObj = {
        id: spieltagId,
        date: dateInput.value,
        kursId: kursSelect.value,
        status: "Aktiv",
        teilnehmerCsv: gewaehlteIds.join(','),
        bruttoSieger: "",
        nettoSieger: ""
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

    app.logic.apiRequest('createNewSpieltag', { spieltagObj: spieltagObj, flightsPayload: flightsPayload })
        .then(function(response)
        {
            if (response && response.success)
            {
                app.state.spieltage.push(spieltagObj);
                flightsPayload.forEach(function(f) { app.state.flights.push(f); });
                
                app.logic.showToast("Spieltag und manuelle Flights angelegt!", "success");
                app.router.navigate('spieltage');
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
    const checkedBoxes = document.querySelectorAll('input[name="teilnehmer"]:checked');
    const gewaehlteIds = Array.from(checkedBoxes).map(function(cb) { return cb.value; });

    if (!kursSelect || !dateInput || !app.state.tempZufallsFlights) return;

    const spieltagId = "ST-" + Date.now();
    const spieltagObj = {
        id: spieltagId,
        date: dateInput.value,
        kursId: kursSelect.value,
        status: "Aktiv",
        teilnehmerCsv: gewaehlteIds.join(','),
        bruttoSieger: "",
        nettoSieger: ""
    };

    const flightsPayload = app.state.tempZufallsFlights.map(function(flightIds, index)
    {
        return {
            id: `FL-${spieltagId}-${index + 1}`,
            spieltagId: spieltagId,
            spielerIdsCsv: flightIds.join(',')
        };
    });

    app.logic.apiRequest('createNewSpieltag', { spieltagObj: spieltagObj, flightsPayload: flightsPayload })
        .then(function(response)
        {
            if (response && response.success)
            {
                app.state.spieltage.push(spieltagObj);
                flightsPayload.forEach(function(f) { app.state.flights.push(f); });
                
                app.logic.showToast("Spieltag und Flights generiert!", "success");
                app.router.navigate('spieltage');
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
    const kurs = app.state.kurse.find(function(k) { return String(k.id).trim() === String(spieltag.kursId).trim(); });
    const kursBahnen = app.state.bahnen.filter(function(b) { return String(b.kursId).trim() === String(spieltag.kursId).trim(); });

    let maxBahnen = (kurs && kurs.bahnAnzahl) ? parseInt(kurs.bahnAnzahl) : (kursBahnen.length || 9);
    const stablefordSoll = (maxBahnen <= 9) ? 18 : 36;

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

        const bahnenSchleife = kursBahnen.length > 0 ? kursBahnen : Array.from({length: maxBahnen}, function(_, i) { return { nr: i + 1, par: 4, si: 10 }; });

        bahnenSchleife.forEach(function(bahn)
        {
            const hNr = parseInt(bahn.nr);
            const liveKey = `${spieltagId}_${spielerId}_${hNr}`;
            let strokes = app.state.liveScores[liveKey];

            if (strokes === undefined)
            {
                const dbMatch = dbScores.find(function(sc) { return sc.hole !== undefined && parseInt(sc.hole) === hNr; });
                if (dbMatch) strokes = parseInt(dbMatch.strokes);
            }

            if (strokes !== undefined && strokes > 0)
            {
                playedHoles++;
                let holeVorgabe = app.logic.calculateHoleVorgabe(spieler, spieltag.kursId, bahn.si);
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

    const confirmationMsg = `Möchtest du die Runde jetzt schließen? Sieger: Brutto: ${bruttoSieger}, Netto: ${nettoSieger}. HCP-Updates:${infoText || " Keine (alle im Puffer)"}. Danach sind keine Korrekturen mehr möglich.`;

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