'use strict';
const {historyState}=require('./history-lock');
// One consistent publication snapshot. A sequence of independent collection
// reads could otherwise straddle the atomic history commit in the browser.
function createPublishedSeasonRead(db){return async function(auth){
    if(!auth||auth.uid!==auth.token?.playerId||auth.token.mustChangePin!==false)throw new Error('Invalid publication read identity');
    return db.runTransaction(async tx=>{
        const actor=await tx.get(db.collection('spieler').doc(auth.uid));
        if(!actor.exists||actor.data().istGeloescht||actor.data().mustChangePin||actor.data().pinChangePending||actor.data().role!==auth.token.role||!['Admin','Spielleiter','Spieler'].includes(actor.data().role))throw new Error('Invalid publication reader');
        const control=await historyState(tx,db),snapshots=await Promise.all(['spieltage','scorecards','spieler_public','flights'].map(c=>tx.get(db.collection(c))));
        const rows=s=>s.docs.map(d=>({...d.data(),id:d.id}));
        const playerKeys=['id','name','nickname','teeColor','hcpOfficial','hcpLIE','role','hcpClosure','historyPublication','istGeloescht'];
        const result={publication:control,spieltage:rows(snapshots[0]),scorecards:rows(snapshots[1]),spieler:rows(snapshots[2]).map(p=>Object.fromEntries(playerKeys.filter(k=>Object.hasOwn(p,k)).map(k=>[k,p[k]]))),flights:rows(snapshots[3])};
        if(Buffer.byteLength(JSON.stringify(result))>3*1024*1024)throw new Error('Publication read bound exceeded');return result;
    });
};}
module.exports={createPublishedSeasonRead};
