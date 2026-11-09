var app=app||{};app.logic=app.logic||{};app.views=app.views||{};
app.logic.openHistoryCorrectionV1=async function(roundId){
    if(app.state.currentUser?.role!=='Admin'){app.logic.showToast('Historische Korrektur ist ausschließlich Administratoren vorbehalten.','error');return;}
    try{await app.logic.refreshGlobalAppData();app.state.historyCorrectionView={roundId:roundId||app.state.spieltage.filter(r=>r.status==='Beendet').sort((a,b)=>a.date.localeCompare(b.date))[0]?.id};app.router.navigate('history_correction');}
    catch(_){app.logic.showToast('Veröffentlichten Stand zuerst online sicher laden.','error');}
};
app.logic.historyCorrectionPreviewV1=async function(){
    const state=app.state.historyCorrectionView;if(!state||state.busy)return false;state.busy=true;
    try{
        const roundId=document.getElementById('history-round').value,player=document.getElementById('history-player').value,hole=Number(document.getElementById('history-hole').value),value=Number(document.getElementById('history-value').value),documentId='SC-'+roundId+'-'+player+'-'+hole;
        if(!Number.isSafeInteger(value)||value<1)throw new Error('Gültige neue Schläge ausdrücklich eingeben.');
        const card=app.state.scoreCards.find(c=>c.id===documentId);if(!card?._sync?.generation||!Number.isSafeInteger(card._sync.fields.strokes?.revision))throw new Error('Versionierte Karte fehlt. Keine Legacy-Migration.');
        const change={documentId,field:'strokes',operation:'set',value,baseDocumentGeneration:card._sync.generation,baseFieldRevision:card._sync.fields.strokes.revision,changeId:crypto.randomUUID()};
        state.preview=await app.logic.callFunction('historyCorrectionV1',{action:'preview',change});state.change=change;state.error=null;state.status=null;
        app.router.navigate('history_correction');return state.preview;
    }catch(error){state.error='Vorschau nicht bestätigt: '+error.message;app.router.navigate('history_correction');return false;}
    finally{state.busy=false;}
};
app.logic.historyCorrectionActionV1=async function(action){
    const state=app.state.historyCorrectionView;if(!state||state.busy)return false;state.busy=true;
    try{
        let runId=state.status?.runId||document.getElementById('history-run')?.value;
        const request={action,runId};
        if(action==='prepare'){
            if(!state.preview||document.getElementById('history-review')?.checked!==true)throw new Error('Vorschau aller Folgerunden ausdrücklich bestätigen.');
            for(const round of state.preview.changes)await app.logic.assertRoundCloseLocalReady(round.id);
            runId=crypto.randomUUID();request.runId=runId;request.change=state.change;request.expectedBasis=state.preview.basisHash;
            localStorage.setItem('lie_history_run__'+app.state.currentUser.id,runId);state.pendingRun=runId;
        }
        if(action==='publish'){
            if(document.getElementById('history-publish-review')?.checked!==true)throw new Error('Komplette Veröffentlichung ausdrücklich bestätigen.');
            for(const round of state.status.summary||[])await app.logic.assertRoundCloseLocalReady(round.id);
        }
        if(!runId)throw new Error('Lauf-ID für sichere Wiederaufnahme erforderlich.');
        const result=await app.logic.callFunction('historyCorrectionV1',request);
        state.status=action==='publish'?await app.logic.callFunction('historyCorrectionV1',{action:'status',runId}):result;state.error=null;
        await app.logic.refreshGlobalAppData();app.router.navigate('history_correction');return result;
    }catch(error){state.error='Ausgang unklar – Veröffentlichung nicht bestätigt: '+error.message+' Laufstatus mit derselben ID prüfen. Bei geänderter Quelle Reparatur erforderlich; keine direkte Rückschreibung.';app.router.navigate('history_correction');return false;}
    finally{state.busy=false;}
};
app.views.history_correction=function(){
    if(app.state.currentUser?.role!=='Admin')return '<p>Historische Korrektur: nur Administratoren.</p>';
    const state=app.state.historyCorrectionView||{},esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const rounds=app.state.spieltage.filter(r=>r.status==='Beendet'),round=rounds.find(r=>r.id===state.roundId)||rounds[0],status=state.status;
    let saved='';try{saved=localStorage.getItem('lie_history_run__'+app.state.currentUser.id)||'';}catch(_){}
    const summary=state.preview?.changes||status?.summary||[];
    const phaseText={staging:'In Bearbeitung – nur privat vorbereitet',ready:'Prüfung abgeschlossen – noch nicht veröffentlicht',published:'Veröffentlicht',cancelled:'Abgebrochen'};
    return '<section><h1>Historische Korrektur – gesonderte Prüfung</h1><p>Aktuell veröffentlichte Saisonrevision '+(app.state.historyPublication?.revision||0)+'. '+(app.state.historyPublication?.activeRun?'Korrektur in Bearbeitung: angezeigt bleibt der bisherige konsistente Stand.':'Kein laufendes Korrekturfenster.')+'</p><p>Nur vollständige versionierte Abschlüsse. Alle Folgerunden werden geprüft. Während eines Korrekturlaufs bleiben neue Runden, Abschlüsse und Scoreänderungen vorübergehend gesperrt. Brutto/Putts bleiben nicht gewertet. Kein Legacy-Import; alte Admin-Schreibwege bleiben gesperrt.</p>'
        +(state.error?'<p role="alert">'+esc(state.error)+'</p>':'')
        +'<label>Abgeschlossene Runde <select id="history-round" onchange="app.state.historyCorrectionView.roundId=this.value;app.state.historyCorrectionView.preview=null;app.router.navigate(\'history_correction\')">'+rounds.map(r=>'<option value="'+esc(r.id)+'" '+(r.id===round?.id?'selected':'')+'>'+esc(r.date+' '+r.id)+'</option>').join('')+'</select></label>'
        +'<label>Spieler <select id="history-player">'+String(round?.teilnehmerCsv||'').split(',').map(p=>'<option>'+esc(p)+'</option>').join('')+'</select></label><label>Bahn <select id="history-hole">'+(round?.hcpHoleData||[]).map(h=>'<option>'+h.nr+'</option>').join('')+'</select></label><label>Neue Schläge <input id="history-value" type="number" min="1"></label><button id="history-preview" onclick="app.logic.historyCorrectionPreviewV1()">Nur Vorschau prüfen</button>'
        +summary.map(r=>'<div><h2>'+esc(r.id)+'</h2><table><tr><th>Spieler</th><th>Start alt → neu</th><th>Ende alt → neu</th></tr>'+Object.keys(r.hcpStart).map(p=>'<tr><td>'+esc(p)+'</td><td>'+esc(r.before?.hcpStart[p])+' → '+r.hcpStart[p]+'</td><td>'+esc(r.before?.hcpEnd[p])+' → '+r.hcpEnd[p]+'</td></tr>').join('')+'</table></div>').join('')
        +(state.preview?'<p>'+state.preview.writeCount+' vollständig geplante Projektionen; noch nichts an Scores/HCPs geändert.</p><label><input type="checkbox" id="history-review">Korrektur und gesamte Folgekette geprüft</label><button id="history-prepare" onclick="app.logic.historyCorrectionActionV1(\'prepare\')">Privaten Korrekturlauf anlegen</button>':'')
        +'<label>Lauf-ID für Wiederaufnahme <input id="history-run" value="'+esc(status?.runId||state.pendingRun||saved)+'"></label><button id="history-status" onclick="app.logic.historyCorrectionActionV1(\'status\')">Server-Laufstatus prüfen</button>'
        +(status?'<p role="status">Zuletzt bestätigter Laufstatus: '+esc(phaseText[status.phase]||status.phase)+' · '+status.staged+'/'+status.writeCount+' privat vorbereitet. Lauf '+esc(status.runId)+'</p>':'')
        +(status?.phase==='staging'?'<button id="history-stage" onclick="app.logic.historyCorrectionActionV1(\'stage\')">Nächsten privaten Teil speichern</button>':'')
        +(status?.phase==='ready'?'<label><input type="checkbox" id="history-publish-review">Vollständigen geprüften Stand atomar veröffentlichen</label><button id="history-publish" onclick="app.logic.historyCorrectionActionV1(\'publish\')">Komplett veröffentlichen</button>':'')
        +(status&&['staging','ready'].includes(status.phase)?'<button id="history-cancel" onclick="app.logic.historyCorrectionActionV1(\'cancel\')">Unveröffentlichten Lauf abbrechen</button>':'')
        +(status?.phase==='published'?'<p>Dieser Lauf ist serverbestätigt veröffentlicht. Aktuelle Saisonrevision oben beachten; erneute Veröffentlichung ändert keine HCPs.</p>':'')+'</section>';
};
