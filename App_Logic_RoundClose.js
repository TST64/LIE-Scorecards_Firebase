var app=app||{};app.logic=app.logic||{};app.views=app.views||{};

// Fail closed on this account's durable queues. Other devices must be reviewed
// explicitly by each flight before its authenticated manual release.
app.logic.assertRoundCloseLocalReady=async function(roundId){
    const owner=String(app.state.currentUser?.id);
    if(navigator.onLine===false||firebase.auth().currentUser?.uid!==owner)throw new Error('Online-Anmeldung erforderlich.');
    await app.scoreEntryV2Controller?.settleActions?.();
    if(Object.keys(app.state.pendingScoreKeys||{}).length)throw new Error('Alte lokale Eingaben vorhanden; keine Abschlussfreigabe.');
    const data=await app.scoreSyncStore.inspectOwnerRound(owner,roundId);
    if(data.pendingOperations.length||data.operationIssues.length||data.requestSnapshots.some(r=>!['acknowledged','completed'].includes(r.status)))throw new Error('Ausstehende Eingaben, Konflikte oder unklarer Request-Ausgang. Erst synchronisieren/abgleichen.');
    if(firebase.auth().currentUser?.uid!==owner||String(app.state.currentUser?.id)!==owner||navigator.onLine===false)throw new Error('Anmeldung/Verbindung geändert.');
    return true;
};
app.logic.loadRoundClose=async function(id){
    const owner=String(app.state.currentUser?.id),view=await app.logic.callFunction('roundClosureV1',{action:'inspect',spieltagId:id});
    if(owner!==String(app.state.currentUser?.id))throw new Error('Konto geändert.');
    app.state.roundCloseInputLocks=app.state.roundCloseInputLocks||{};
    app.state.roundCloseInputLocks[id]=view.status==='Beendet'||view.closure?.phase==='collecting';
    app.state.roundCloseView=view;return view;
};
app.logic.openRoundClose=async function(id){
    try{await app.logic.loadRoundClose(id);app.router.navigate('round_close');}
    catch(_){app.logic.showToast('Abschlussstand nicht verlässlich ladbar. Keine Freigabe.','error');}
};
app.logic.roundCloseAction=async function(action,id,flightId){
    if(app.state.roundCloseLocalBusy)return false;
    const v=app.state.roundCloseView;if(!v||v.spieltagId!==id)return false;
    app.state.roundCloseLocalBusy=true;
    try{
        if(['begin','release','commit'].includes(action))await app.logic.assertRoundCloseLocalReady(id);
        const request={action,spieltagId:id,closeId:v.closure?.phase==='collecting'||v.closure?.phase==='published'?v.closure.id:crypto.randomUUID(),expectedRevision:v.scoreRevision,expectedDigest:v.scoreDigest};
        if(action==='release'){
            if(document.getElementById('close-review-'+flightId)?.checked!==true)throw new Error('Alle Geräte dieses Flights prüfen und Freigabe ausdrücklich bestätigen.');
            request.flightId=flightId;request.reviewedFlightWriters=true;
        }
        const result=await app.logic.callFunction('roundClosureV1',request);
        await app.logic.loadRoundClose(id);
        if(action==='commit'){
            try{await app.logic.refreshGlobalAppData();}catch(_){app.logic.showToast('Abschluss serverbestätigt; globale Anzeige erneut laden.','error');}
            app.logic.showToast('Abschluss serverbestätigt. HCPs einmalig veröffentlicht.','success');
        }
        app.router.navigate('round_close');return result;
    }catch(error){app.logic.showToast(app.logic.roundCloseUserMessage ? app.logic.roundCloseUserMessage(error) : 'Kein Abschluss bestätigt. Bitte den aktuellen Serverstand erneut laden. Lokale Eingaben bleiben erhalten.','error');return false;}
    finally{app.state.roundCloseLocalBusy=false;}
};
app.views.round_close=function(){
    const v=app.state.roundCloseView;if(!v)return '<p>Abschlussstand zuerst online laden.</p>';
    const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const id=esc(v.spieltagId),collecting=v.closure?.phase==='collecting',published=v.status==='Beendet';
    const button=(action,text,flightId)=>'<button class="border rounded p-3 m-2" id="close-'+action+(flightId?'-'+esc(flightId):'')+'" onclick="app.logic.roundCloseAction(\''+action+'\',\''+id+'\''+(flightId?',\''+esc(flightId)+'\'':'')+')">'+text+'</button>';
    return '<section><h1>Rundenschluss – '+id+'</h1><p role="status">'+(published?'Serverbestätigt veröffentlicht':collecting?'Abschlussfenster aktiv: neue Scores serverseitig gesperrt':'Runde offen')+' · Score-Revision '+v.scoreRevision+'</p>'
        +'<p>Vor Fensterbeginn alle Schreiber synchronisieren lassen. Je Flight auf allen verwendeten Geräten: online, ausstehend 0, keine Konflikte und keine unklaren Requests. Der Server kann fremde Offline-Eingaben nicht erkennen. Nur nach persönlichem Abgleich freigeben. Bei offenen Eingaben Fenster abbrechen, abgleichen und neu beginnen; niemals lokale Daten löschen.</p>'
        +'<p>Brutto/Putts: nicht gewertet. DNF nicht freigegeben: alle Teilnehmer müssen vollständig sein.</p>'+(published?'<p>Serverbestätigte Netto-Sieger (geteilter Rang): '+esc(v.published?.nettoWinners.join(', '))+'</p>':'')
        +(v.published?.historyCorrection?'<p>Historisch korrigierte Abschlussrevision '+esc(v.published.revision)+' · Lauf '+esc(v.published.historyCorrection.runId)+'. Die angezeigten ursprünglichen Flightfreigaben belegen den ursprünglichen Abschluss; diese Korrektur wurde gesondert über den Admin-Vertrag veröffentlicht.</p>':'')
        +'<table><tr><th>Spieler</th><th>Bahnen</th><th>Netto</th><th>HCP Start → Ende</th></tr>'+v.results.map(r=>'<tr><td>'+esc(r.playerId)+'</td><td>'+r.playedHoles+'/'+r.requiredHoles+' '+(r.complete?'vollständig':r.valid?'unvollständig':'ungültig')+'</td><td>'+r.totalNetto+'</td><td>'+r.startHcp+' → '+(r.complete?r.endHcp:'keine Fortschreibung')+'</td></tr>').join('')+'</table>'
        +v.flights.map(f=>'<div>Flight '+esc(f.id)+': '+esc(f.members.join(', '))+' – '+(v.closure?.approvals?.[f.id]?'Freigabe durch '+esc(v.closure.approvals[f.id].actorUid):'nicht freigegeben')+(collecting?'<label><input type="checkbox" id="close-review-'+esc(f.id)+'">Alle Schreiber/Geräte dieses Flights persönlich abgeglichen; geprüfter Serverstand freigegeben</label>'+button('release','Diesen Flight freigeben',f.id):'')+'</div>').join('')
        +(!published?(collecting?button('commit','Mit allen Flightfreigaben abschließen')+button('cancel','Fenster abbrechen – Scores wieder öffnen'):button('begin','Serverstand prüfen und Abschlussfenster öffnen')):'<p>Netto-Gleichstand: geteilter Rang. Abschluss-ID '+esc(v.closure?.id)+'. Historische Korrekturen bleiben gesperrt.</p>')
        +'<button class="border rounded p-3" onclick="app.logic.openRoundClose(\''+id+'\')">Serverstand neu laden</button>'+(published&&app.state.currentUser?.role==='Admin'?'<button class="border rounded p-3" onclick="app.logic.openHistoryCorrectionV1(\''+id+'\')">Gesonderte historische Korrektur prüfen</button>':'')+'</section>';
};
