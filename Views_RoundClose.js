// Presentation of the existing server closure contract; no new write protocol.
app.views.round_close = function()
{
    const v = app.state.roundCloseView;
    if (!v) return '<section class="lie-close"><h1>Rundenschluss</h1><p>Bitte zuerst den aktuellen Spieltag öffnen und den Abschlussstand laden.</p></section>';
    const esc = app.logic.scoreScreenEscape;
    const arg = x => esc(JSON.stringify(x));
    const name = id => (app.state.spieler || []).find(p => p.id === id)?.nickname || (app.state.spieler || []).find(p => p.id === id)?.name || id;
    const collecting = v.closure?.phase === 'collecting', published = v.status === 'Beendet';
    const privileged = ['Admin','Spielleiter'].includes(app.state.currentUser?.role);
    const allReleased = v.flights.every(f => !!v.closure?.approvals?.[f.id]);
    const button = (action, label, flightId, disabled) => '<button class="lie-button '+(action==='cancel'?'lie-button-warning':'lie-button-primary')+'" id="close-'+action+(flightId?'-'+esc(flightId):'')+'" '+(disabled?'disabled ':'')+'onclick="app.logic.roundCloseAction('+arg(action)+','+arg(v.spieltagId)+(flightId?','+arg(flightId):'')+')">'+label+'</button>';
    const rows = v.results.map(r => '<tr data-close-player="'+esc(r.playerId)+'" data-netto="'+r.totalNetto+'" data-played="'+r.playedHoles+'"><th scope="row">'+esc(name(r.playerId))+'</th><td>'+r.playedHoles+'/'+r.requiredHoles+'<span class="lie-close-progress '+(r.complete?'is-complete':'')+'">'+(r.complete?'Vollständig':r.valid?'Noch offen':'Prüfung erforderlich')+'</span></td><td class="lie-live-total">'+r.totalNetto+'</td><td>'+r.startHcp.toFixed(1)+'</td><td>'+(r.complete?r.endHcp.toFixed(1):'—')+'</td></tr>').join('');
    const flights = v.flights.map((f,i) =>
    {
        const approval = v.closure?.approvals?.[f.id];
        const canRelease = privileged || f.members.includes(app.state.currentUser?.id);
        return '<section class="lie-close-flight"><div class="lie-close-flight-heading"><h3>Flight '+(i+1)+'</h3><span class="lie-close-badge '+(approval?'is-complete':'')+'">'+(approval?'Freigegeben':'Abgleich offen')+'</span></div><p>'+f.members.map(id => esc(name(id))).join(' · ')+'</p>'
            +(approval?'<p>Freigabe durch '+esc(name(approval.actorUid))+'</p>':'')
            +(collecting&&canRelease&&!approval?'<label class="lie-close-review"><input type="checkbox" id="close-review-'+esc(f.id)+'"><span>Alle Schreiber und Geräte dieses Flights persönlich geprüft: online, nichts ausstehend, keine Konflikte. Dieser Serverstand darf zählen.</span></label>'+button('release','Flight '+(i+1)+' freigeben',f.id):'')+'</section>';
    }).join('');
    return '<section class="lie-close"><header class="lie-live-heading"><div><p class="lie-eyebrow">LIE Scorecards</p><h1>Rundenschluss</h1></div><button class="lie-button" onclick="app.router.navigate(\'leaderboard\',{id:'+arg(v.spieltagId)+'})">Live-Scoreboard</button></header>'
        +'<div class="lie-close-stage" role="status"><i class="fas fa-'+(published?'check-circle':collecting?'lock':'flag-checkered')+'" aria-hidden="true"></i><div><strong>'+(published?'Offiziell abgeschlossen':collecting?'Abschlussfenster geöffnet':'Bereit zum gemeinsamen Abgleich')+'</strong><p>'+(published?'Netto-Ergebnisse und HCPs sind serverbestätigt veröffentlicht.':collecting?'Neue Scores sind gesperrt. Jetzt jeden Flight persönlich abgleichen und freigeben.':'Noch keine Veröffentlichung. Alle Scores zuerst synchronisieren lassen.')+'</p></div></div>'
        +(published?'<section class="lie-live-official"><h2>Netto-Sieger</h2><p>'+v.published.nettoWinners.map(id=>esc(name(id))).join(', ')+'</p><p>Bei Gleichstand gilt ein geteilter Rang.</p></section>':'<ol class="lie-close-steps"><li>Alle Schreiber online: keine ausstehenden Eingaben oder Konflikte.</li><li>Abschlussfenster öffnen und jeden Flight gemeinsam freigeben.</li><li>Erst danach Ergebnisse und HCPs offiziell bestätigen.</li></ol><p class="lie-live-notice">Der Server kennt keine fremden Offline-Eingaben. Bei offenen Daten das Fenster abbrechen, synchronisieren und erneut prüfen. Lokale Eingaben niemals löschen.</p>')
        +'<h2>'+(published?'Bestätigtes Ergebnis':'Netto-Ergebnis zur Prüfung')+'</h2><div class="lie-live-table-wrap"><table class="lie-close-table"><caption>'+(published?'Offizielle HCP-Fortschreibung':'HCP-Endwerte sind ausschließlich Vorschau; unvollständige Runden haben keinen Endwert.')+'</caption><thead><tr><th>Spieler</th><th>Löcher</th><th>Netto</th><th>HCP Start</th><th>'+(published?'HCP Ende':'HCP Vorschau')+'</th></tr></thead><tbody>'+rows+'</tbody></table></div>'
        +(!v.complete&&!published?'<p class="lie-live-notice" role="status">Es fehlen noch bestätigte Scores. Der Abschluss bleibt gesperrt, bis alle Teilnehmer vollständig sind.</p>':'')
        +'<h2>Flight-Abgleich</h2><div class="lie-close-flights">'+flights+'</div><div class="lie-close-actions">'
        +(!published&&privileged?(collecting?button('commit','Ergebnisse und HCPs offiziell bestätigen',null,!allReleased||!v.complete)+button('cancel','Abbrechen · Score-Eingabe wieder öffnen'):button('begin','Abschlussfenster öffnen',null,!v.complete)):'')
        +'<button class="lie-button" id="close-refresh" onclick="app.logic.openRoundClose('+arg(v.spieltagId)+')">Aktuellen Serverstand laden</button></div>'
        +'<p class="lie-live-footnote">Brutto und Putts werden nicht als offizielle Ergebnisse veröffentlicht. Unvollständige Runden bleiben vom Abschluss ausgeschlossen.</p>'
        +(v.published?.historyCorrection?'<p class="lie-live-notice">Historisch korrigierte Abschlussrevision '+esc(v.published.revision)+'. Die Flightfreigaben dokumentieren den ursprünglichen Abschluss.</p>':'')
        +(published&&app.state.currentUser?.role==='Admin'?'<details><summary>Gesonderte historische Prüfung</summary><button class="lie-button" onclick="app.logic.openHistoryCorrectionV1('+arg(v.spieltagId)+')">Historische Korrektur prüfen</button></details>':'')
        +'<details class="lie-close-receipt"><summary>Bestätigungsbelege</summary><p>Spieltag '+esc(v.spieltagId)+' · Score-Revision '+v.scoreRevision+' · Abschluss-ID '+esc(v.closure?.id||'noch nicht vergeben')+'</p></details></section>';
};

app.logic.roundCloseUserMessage = function(error)
{
    const reason = String(error?.message || '');
    if (/online|Verbindung|Anmeldung|Konto/i.test(reason)) return 'Bitte Verbindung und Anmeldung prüfen. Noch kein Abschluss bestätigt.';
    if (/ausstehend|Konflikt|Request|lokale Eingaben|storage/i.test(reason)) return 'Es sind noch Eingaben oder Konflikte offen. Bitte zuerst synchronisieren und abgleichen. Alle lokalen Eingaben bleiben erhalten.';
    if (/Alle Geräte|Freigabe ausdrücklich/i.test(reason)) return 'Bitte erst alle Geräte dieses Flights persönlich prüfen und das Bestätigungsfeld aktivieren.';
    return 'Die Aktion wurde nicht bestätigt. Bitte den aktuellen Serverstand laden und die Flightfreigaben prüfen. Lokale Eingaben bleiben erhalten.';
};
