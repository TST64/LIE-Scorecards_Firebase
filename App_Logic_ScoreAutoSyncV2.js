// One durable V2 sender. No activity merely from loading this module.
var app = app || {};
app.logic = app.logic || {};
app.createScoreAutoSyncV2 = function(options)
{
    const records = new Map();
    const key = c => JSON.stringify([c.ownerUid,c.playerId,c.spieltagId,c.flightId,c.mode]);
    function activate(input)
    {
        if (!input || input.mode !== 'ownFlight' || input.ownerUid !== input.playerId) throw new Error('Invalid automatic score context.');
        const c = Object.freeze({ownerUid:input.ownerUid,playerId:input.playerId,spieltagId:input.spieltagId,flightId:input.flightId,mode:'ownFlight'});
        let r = records.get(key(c));
        if (!r) { r = {c,timer:null,running:null,dirty:false,backoff:1500,hadAck:false}; records.set(key(c),r); }
        schedule(r,250);
        return c;
    }
    function schedule(r,ms)
    {
        if (records.get(key(r.c)) !== r) return;
        if (r.timer !== null) options.clearTimer(r.timer);
        r.timer = options.setTimer(() => { r.timer=null; flush(r.c); },ms);
    }
    function publish(r,status,data,error)
    {
        if (records.get(key(r.c)) !== r) return;
        const ids = new Set((data?.pendingOperations || []).map(op=>op.changeId));
        const issues = (data?.operationIssues || []).filter(issue=>ids.has(issue.changeId));
        options.onState(r.c,{status,pending:ids.size,issues,error:!!error});
    }
    async function owns(c)
    {
        const id = await options.getIdentity();
        return id && id.ownerUid === c.ownerUid && id.playerId === c.playerId && id.mustChangePin !== true;
    }
    async function run(r)
    {
        let data;
        try
        {
            // Bounded drain; further work gets another turn, never an unbounded loop.
            for (let turn=0;turn<12;turn++)
            {
                if (records.get(key(r.c)) !== r || !await owns(r.c)) return;
                data = await options.store.inspect(r.c);
                if (!options.isOnline()) { publish(r,'offline',data); schedule(r,15000); return; }
                if (!data.pendingOperations.length)
                {
                    const evidence = r.hadAck || (data.operationReceipts || []).some(x=>x.status==='acknowledged')
                        || (data.serverCache || []).some(x=>Object.keys(x.values || {}).length);
                    publish(r,evidence?'confirmed':'ready',data);schedule(r,15000);return;
                }
                const ids = new Set(data.pendingOperations.map(op=>op.changeId));
                const unresolved = (data.requestSnapshots || []).find(req=>req.protocol==='score-v2'
                    && ['prepared','failed'].includes(req.status) && req.changeIds.some(id=>ids.has(id)));
                const issues = (data.operationIssues || []).filter(issue=>ids.has(issue.changeId));
                if (!unresolved && issues.length === ids.size)
                { publish(r,'conflict',data);schedule(r,15000);return; }
                publish(r,'sending',data);
                if (!await owns(r.c) || records.get(key(r.c)) !== r) return;
                const response = unresolved ? await options.adapter.retry(r.c,unresolved.requestId) : await options.adapter.sync(r.c);
                r.hadAck = r.hadAck || (response.results || []).some(x=>x.status==='acknowledged');
                r.backoff=1500;
                const after = await options.store.inspect(r.c);
                if (after.pendingOperations.length && JSON.stringify(after.pendingOperations)===JSON.stringify(data.pendingOperations) && !r.dirty)
                { publish(r,'conflict',after);schedule(r,15000);return; }
                r.dirty=false;
            }
            schedule(r,250);
        }
        catch (_)
        {
            // Unknown results remain in the durable original request. Retry that
            // exact request/IDs through server receipts, never rebase/discard.
            publish(r,'error',data,true);schedule(r,r.backoff);r.backoff=Math.min(30000,r.backoff*2);
        }
    }
    function flush(c)
    {
        const r = records.get(key(c));
        if (!r) return Promise.resolve();
        if (r.running) { r.dirty=true;return r.running; }
        if (r.timer!==null) {options.clearTimer(r.timer);r.timer=null;}
        r.running=run(r).finally(()=>{r.running=null;});return r.running;
    }
    function notify(c) { const r=records.get(key(c));if(r){r.dirty=true;schedule(r,250);} }
    function stop() { records.forEach(r=>{if(r.timer!==null)options.clearTimer(r.timer);});records.clear(); }
    return Object.freeze({activate,notify,flush,stop});
};

app.logic.scoreAutoSyncStatusTextV2 = function(state)
{
    if (!state) return 'Status wird geprüft …';
    const text = {ready:'Bereit – keine neuen Eingaben',pending:'Lokal gespeichert',confirmed:'Serverbestätigt',sending:'Lokal gespeichert · sende …',
        offline:'Lokal gespeichert · offline',conflict:'Konflikt / abgewiesen – ausstehend, kein automatisches Überschreiben',
        error:'Sync-Fehler / Ausgang unklar – lokal erhalten, sicherer Wiederholungsversuch'};
    return (text[state.status] || 'Status unklar')+(state.pending?' · '+state.pending+' ausstehend':'');
};
app.logic.renderScoreSyncStateV2 = async function(c,status)
{
    const state=app.state.scoreEntryV2;
    if (!state || state.status!=='ready' || state.owner!==c.ownerUid || state.id!==c.spieltagId
        || state.response.flightId!==c.flightId || String(app.state.currentUser?.id)!==c.ownerUid) return;
    const renderVersion=state.syncRenderVersion=(state.syncRenderVersion || 0)+1,actionVersion=state.actionVersion;
    let entries;try { entries=await app.scoreEntryV2Controller.readAll(); } catch (_) { return; }
    if (state!==app.state.scoreEntryV2 || renderVersion!==state.syncRenderVersion || actionVersion!==state.actionVersion) return;
    const pending=Object.values(entries).reduce((n,e)=>n+(e.pendingOperations?.length || 0),0);
    const issues=Object.values(entries).some(e=>e.syncIssues?.length);
    state.entries=entries;
    state.syncStatus=(pending && ['ready','confirmed'].includes(status.status))?{...status,status:issues?'conflict':'pending',pending}:status;
    if (app.state.currentView!=='score_eingabe') return;
    const selection=app.state.scoreScreenSelection;
    const container=document.getElementById('app-container');
    if (container && selection?.id===c.spieltagId && selection.owner===c.ownerUid)
    {
        const focus=document.activeElement?.id,y=window.scrollY;
        container.innerHTML=app.views.score_eingabe(c.spieltagId,selection.hole);
        if(focus)document.getElementById(focus)?.focus({preventScroll:true});
        window.scrollTo({top:y,left:0,behavior:'instant'});
    }
};
app.logic.ensureScoreAutoSyncV2 = function()
{
    if(app.scoreAutoSyncV2)return app.scoreAutoSyncV2;
    app.scoreAutoSyncV2=app.createScoreAutoSyncV2({store:app.scoreSyncStore,adapter:app.createFirebaseScoreSyncV2Adapter(),
        getIdentity:async()=>{
            const user=firebase.auth().currentUser;
            if(!user || String(app.state.currentUser?.id)!==user.uid || app.state.currentUser.mustChangePin===true)return null;
            if(!navigator.onLine)return {ownerUid:user.uid,playerId:user.uid};
            const token=await user.getIdTokenResult();
            if(firebase.auth().currentUser!==user)return null;
            return {ownerUid:user.uid,playerId:token.claims.playerId,mustChangePin:token.claims.mustChangePin};
        },isOnline:()=>navigator.onLine!==false,setTimer:(f,ms)=>setTimeout(f,ms),clearTimer:id=>clearTimeout(id),
        onState:(c,s)=>{app.logic.renderScoreSyncStateV2(c,s).catch(()=>{});}});
    const owner=String(app.state.currentUser?.id);
    app.scoreAutoSyncUnsubscribeV2=firebase.auth().onAuthStateChanged(user=>{
        if(!user || user.uid!==owner)app.logic.stopScoreAutoSyncV2();
    });
    return app.scoreAutoSyncV2;
};
app.logic.stopScoreAutoSyncV2 = function()
{
    if(app.scoreAutoSyncV2)app.scoreAutoSyncV2.stop();
    app.scoreAutoSyncV2=null;
    if(app.scoreAutoSyncUnsubscribeV2)app.scoreAutoSyncUnsubscribeV2();
    app.scoreAutoSyncUnsubscribeV2=null;
    if(app.scoreEntryV2Controller)app.scoreEntryV2Controller.invalidate();
};
app.logic.resumeScoreAutoSyncV2 = async function(roundId)
{
    const owner=String(app.state.currentUser?.id);
    if(!firebase.auth().currentUser || firebase.auth().currentUser.uid!==owner || app.state.currentUser.mustChangePin===true)return;
    const contexts=app.createScoreEntryContextStore();
    let records;try{records=await contexts.list(owner);}finally{await contexts.close();}
    if(firebase.auth().currentUser?.uid!==owner || String(app.state.currentUser?.id)!==owner)return;
    const sender=app.logic.ensureScoreAutoSyncV2();
    for(const record of records)
    {
        if(record.ownerUid!==owner || record.response.ownerUid!==owner || (roundId && record.spieltagId!==roundId))continue;
        const c=sender.activate({ownerUid:owner,playerId:owner,spieltagId:record.spieltagId,flightId:record.response.flightId,mode:'ownFlight'});
        // Settle persisted unknown requests before an online generation refresh.
        await sender.flush(c);
    }
};
app.logic.activateScoreAutoSyncV2 = function(state)
{
    if(state!==app.state.scoreEntryV2 || String(app.state.currentUser?.id)!==state.owner)return;
    app.logic.ensureScoreAutoSyncV2().activate({ownerUid:state.owner,playerId:state.owner,spieltagId:state.id,flightId:state.response.flightId,mode:'ownFlight'});
};
app.logic.scoreScreenRefreshSyncV2 = async function()
{
    const state=app.state.scoreEntryV2;
    if(!state || state.owner!==String(app.state.currentUser?.id))return;
    try
    {
        const response=await app.scoreEntryV2Controller.refresh();
        if(state!==app.state.scoreEntryV2 || state.owner!==String(app.state.currentUser?.id))return;
        state.response=response;
        await app.logic.renderScoreSyncStateV2({ownerUid:state.owner,spieltagId:state.id,flightId:response.flightId},state.syncStatus || {status:'ready'});
    }
    catch(_){app.logic.showToast('Serverstand nicht sicher abgleichbar. Lokale Änderungen bleiben erhalten.','error');}
};
app.logic.scoreScreenDiscardSyncFieldV2 = async function(playerId,field)
{
    const state=app.state.scoreEntryV2,c=app.state.scoreScreenContext;
    if(!state || !c || state.owner!==String(app.state.currentUser?.id) || !['strokes','puts','lady','maxscore'].includes(field))return;
    const raw=await app.scoreEntryV2Controller.readEntry(String(playerId),c.hole);
    if(!raw.syncIssues.some(issue=>issue.field===field))return;
    const expected=raw.resolutionExpectations[field];
    app.logic.showConfirm('Lokale Änderung verwerfen?','Nur dieses Feld wird verworfen. Zuerst den aktuellen Serverstand zum Vergleich laden. Kein Überschreiben des Servers.','warning',async()=>{
        if(state!==app.state.scoreEntryV2 || c!==app.state.scoreScreenContext || state.owner!==String(app.state.currentUser?.id))return;
        try
        {
            await app.createFirebaseScoreSyncV2Adapter().resolveField({ownerUid:state.owner,playerId:state.owner,spieltagId:state.id,flightId:state.response.flightId,mode:'ownFlight',spielerId:String(playerId),hole:c.hole,documentId:'SC-'+state.id+'-'+playerId+'-'+c.hole},field,'discard',expected);
            await app.logic.scoreScreenRefreshSyncV2();
            if(app.scoreAutoSyncV2)app.scoreAutoSyncV2.notify({ownerUid:state.owner,playerId:state.owner,spieltagId:state.id,flightId:state.response.flightId,mode:'ownFlight'});
        }
        catch(_){app.logic.showToast('Abgleich geändert oder Request-Ausgang unklar. Nichts verworfen; Serverstand erneut prüfen.','error');}
    });
};
if(typeof window!=='undefined' && window.addEventListener)
{
    window.addEventListener('online',()=>{app.logic.resumeScoreAutoSyncV2().catch(()=>{});});
}
