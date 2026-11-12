// Familiar matrix/list/flight presentation; leaderboardLegacyReference is design
// reference only. No local scores, historical fallbacks or legacy publications.
app.views = app.views || {};
(function()
{
    const esc = x => String(x ?? '').replace(/[&<>"']/g,c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const arg = x => esc(JSON.stringify(x));
    app.views.leaderboard = function(input)
    {
        const requested = typeof input === 'object' ? input?.id || input?.spieltagId : input;
        const round = requested ? (app.state.spieltage || []).find(r => r.id === requested)
            : (app.state.spieltage || []).find(r => r.status === 'Aktiv' && !r.istGeloescht)
                || (app.state.spieltage || []).filter(r => !r.istGeloescht).slice().sort((a,b) => String(b.date).localeCompare(String(a.date)))[0];
        const id = String(requested || round?.id || ''); app.state.leaderboardRoundId = id;
        const state = app.state.liveLeaderboard, current = state?.id === id && state.owner === String(app.state.currentUser?.id);
        const model = current ? state.model : null;
        const mode = ['matrix','list','flights'].includes(app.state.leaderboardViewMode) ? app.state.leaderboardViewMode : 'matrix';
        const toolbar = '<nav class="lie-live-tabs" aria-label="Scoreboard-Ansicht">' + [['matrix','table','Matrix'],['list','list','Liste'],['flights','users','Flights']].map(([key,icon,label]) =>
            '<button id="live-mode-'+key+'" class="lie-button '+(mode===key?'is-active':'')+'" aria-pressed="'+(mode===key)+'" onclick="app.logic.setLeaderboardMode(\''+key+'\')"><i class="fas fa-'+icon+'" aria-hidden="true"></i> '+label+'</button>').join('')+'</nav>';
        const header = '<header class="lie-live-heading"><div><p class="lie-eyebrow">LIE Scorecards</p><h1>Live-Scoreboard</h1></div>'
            + '<button id="live-refresh" class="lie-button" onclick="app.logic.refreshLeaderboardLive()" aria-label="Live-Stand jetzt aktualisieren"><i class="fas fa-sync-alt" aria-hidden="true"></i> Aktualisieren</button></header>';
        if (!model) return '<section class="lie-live-board">'+header+toolbar+'<p class="lie-live-notice" role="status">'+(!id?'Noch kein Spieltag vorhanden.':state?.status==='stale'?'Der Live-Stand ist noch nicht verlässlich verfügbar. Verbindung prüfen; wir versuchen es automatisch erneut.':'Serverbestätigten Live-Stand laden …')+'</p></section>';
        const {rows, holes, published} = model;
        let rank = 0, last = null;
        const ranks = Object.fromEntries(rows.map((r,i) => {if (last !== r.result.totalNetto) {rank=i+1;last=r.result.totalNetto;}return [r.id,rank];}));
        const name = r => '<strong>'+esc(r.name)+'</strong>';
        const progress = r => r.result.playedHoles+'/'+r.result.requiredHoles;
        const scoreAttributes = r => ' data-live-player="'+esc(r.id)+'" data-netto="'+r.result.totalNetto+'" data-played="'+r.result.playedHoles+'"';
        const listRow = r => '<article class="lie-live-player"'+scoreAttributes(r)+'><span class="lie-live-rank">'+(r.result.playedHoles?ranks[r.id]:'·')+'</span><div>'+name(r)+'<p>'+progress(r)+' Löcher bestätigt</p></div><div class="lie-live-points"><strong>'+r.result.totalNetto+'</strong><span>Netto-Punkte</span></div></article>';
        const matrix = '<div class="lie-live-table-wrap" tabindex="0" aria-label="Score-Matrix, horizontal scrollbar"><table class="lie-live-matrix"><caption>Bestätigte Rohschläge je Loch · letzte Spalte: Live-Netto</caption><thead><tr><th scope="col">Spieler</th>'
            + holes.map(h => '<th scope="col">'+h.nr+'</th>').join('')+'<th scope="col">Netto</th><th scope="col">Löcher</th></tr><tr class="lie-live-par"><th scope="row">Par</th>'+holes.map(h => '<td>'+h.par+'</td>').join('')+'<td></td><td></td></tr></thead><tbody>'
            + rows.map(r => '<tr'+scoreAttributes(r)+'><th scope="row">'+name(r)+'</th>'+holes.map(h =>
            {
                const card = r.scores[h.nr], played = card?.maxscore === true || Number.isSafeInteger(card?.strokes);
                const points = played ? LieHcpRules.points(card.strokes,h.par,model.round.holeAllowances[r.id][h.nr],card.maxscore === true) : null;
                const value = card?.maxscore === true ? 'Strich' : card?.strokes ?? '·';
                return '<td data-live-hole="'+h.nr+'" class="'+(card?.strokes===h.par&&!card.maxscore?'lie-live-par-score':'')+'" title="'+esc(played?points+' Netto-Punkte'+(card.maxscore&&card.strokes!==undefined?' · Rohschläge '+card.strokes:''):'Noch kein bestätigter Score')+'">'+esc(value)+'</td>';
            }).join('')+'<td class="lie-live-total">'+r.result.totalNetto+'</td><td>'+progress(r)+'</td></tr>').join('')+'</tbody></table></div>';
        const flights = '<div class="lie-live-flights">'+model.flights.map((f,i) => '<section class="lie-live-flight"><h2><i class="fas fa-users" aria-hidden="true"></i> Flight '+(i+1)+'</h2>'+f.members.map(id => rows.find(r => r.id===id)).filter(Boolean).map(listRow).join('')+'</section>').join('')+'</div>';
        const stale = state.status === 'stale';
        const status = stale ? 'Verbindung oder Datenstand wird geprüft. Angezeigt wird der letzte bestätigte Stand; neue Scores folgen nach erfolgreichem Abgleich.'
            : 'Automatisch aktuell · nur serverbestätigte Scores · '+new Date(state.updatedAt || Date.now()).toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
        const official = published ? '<section class="lie-live-official"><h2>Offiziell veröffentlicht</h2><p>Netto-Sieger: '+published.nettoWinners.map(id => esc(rows.find(r=>r.id===id)?.name || id)).join(', ')+'</p><div class="lie-live-table-wrap"><table><caption>Bestätigte HCP-Fortschreibung · Abschlussrevision '+esc(published.revision)+'</caption><thead><tr><th>Spieler</th><th>Netto</th><th>HCP Start</th><th>HCP Ende</th></tr></thead><tbody>'+published.results.map(r=>'<tr><th>'+esc(rows.find(x=>x.id===r.playerId)?.name||r.playerId)+'</th><td>'+r.totalNetto+'</td><td>'+r.startHcp.toFixed(1)+'</td><td>'+r.endHcp.toFixed(1)+'</td></tr>').join('')+'</tbody></table></div></section>'
            : '<p class="lie-live-notice"><strong>Live-Netto · vorläufiger Zwischenstand.</strong> Unterschiedlich viele gespielte Löcher sind möglich. Noch keine offiziellen Sieger und keine veröffentlichten neuen HCPs.</p>';
        const privileged = ['Admin','Spielleiter'].includes(app.state.currentUser?.role);
        return '<section class="lie-live-board" data-live-mode="'+mode+'">'+header+'<p class="lie-live-context">'+esc(model.round.date)+' · '+esc((app.state.kurse||[]).find(k=>k.id===model.round.kursId)?.name||model.round.kursId)+' · '+esc(model.round.rundenTyp)+' · '+rows.length+' Spieler</p>'+toolbar
            +'<p id="live-read-status" class="lie-live-status '+(stale?'is-stale':'')+'" role="status">'+esc(status)+'</p>'+official
            +(published?'<h2>Scorecards und Netto-Ergebnis</h2>':'<h2>Live-Netto</h2>')+(mode==='matrix'?matrix:mode==='flights'?flights:'<div class="lie-live-list">'+rows.map(listRow).join('')+'</div>')
            +'<p class="lie-live-footnote">Lokale, noch nicht bestätigte Eingaben bleiben in der Score-Eingabe. Brutto- und Putts-Veröffentlichung bleiben gesperrt.</p>'
            +(privileged?'<button id="live-open-close" class="lie-button lie-button-primary" onclick="app.logic.openRoundClose('+arg(id)+')">'+(published?'Offiziellen Abschluss ansehen':'Rundenschluss prüfen')+'</button>':'')+'</section>';
    };
})();
