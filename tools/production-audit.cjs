'use strict';
// Authorized read-only production metadata/count audit. Never writes cloud data,
// exports user documents, prints credentials or follows arbitrary URLs.
const fs=require('node:fs'),path=require('node:path');
const PROJECT='liescorecard-70c5e';
async function main(){
    const auth=require('../node_modules/firebase-tools/lib/auth'),account=auth.getGlobalDefaultAccount();
    if(!account?.tokens?.refresh_token)throw new Error('No existing Firebase login.');
    const token=await auth.getAccessToken(account.tokens.refresh_token,['https://www.googleapis.com/auth/cloud-platform']);
    const read=async(host,route,body)=>{
        if(!['firebase.googleapis.com','firebasehosting.googleapis.com','firestore.googleapis.com','cloudfunctions.googleapis.com'].includes(host)
            ||!route.includes(PROJECT)||body&&!/:(runAggregationQuery|listCollectionIds)$/.test(route))throw new Error('Read-only audit boundary.');
        const r=await fetch('https://'+host+route,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token.access_token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,redirect:'error',signal:AbortSignal.timeout(30000)});
        if(!r.ok)return {httpStatus:r.status};return r.json();
    };
    const project=await read('firebase.googleapis.com','/v1beta1/projects/'+PROJECT);
    const result={observedAt:new Date().toISOString(),projectId:PROJECT,projectStatus:project.httpStatus||project.state,productionWrites:0,userDataExported:false};
    if(project.projectId!==PROJECT){result.blocker='Project inaccessible/unconfirmed';return result;}
    const sites=await read('firebasehosting.googleapis.com','/v1beta1/projects/'+PROJECT+'/sites');
    result.hosting={status:sites.httpStatus||200,sites:(sites.sites||[]).map(s=>({name:s.name,defaultUrl:s.defaultUrl}))};
    for(const site of result.hosting.sites){
        const releases=await read('firebasehosting.googleapis.com','/v1beta1/'+site.name+'/releases?pageSize=1');
        site.latestRelease=(releases.releases||[]).map(r=>({name:r.name,type:r.type,releaseTime:r.releaseTime,version:r.version?.name}));
    }
    const apps=await read('firebase.googleapis.com','/v1beta1/projects/'+PROJECT+'/webApps');
    result.webApps=(apps.apps||[]).map(a=>({appId:a.appId,name:a.name}));
    if(result.webApps.length===1){const config=await read('firebase.googleapis.com','/v1beta1/'+result.webApps[0].name+'/config');
        if(config.projectId===PROJECT)fs.writeFileSync(path.resolve('.local-runtime/production-public-webconfig.json'),JSON.stringify(config,null,2));}
    const dbs=await read('firestore.googleapis.com','/v1/projects/'+PROJECT+'/databases');
    result.databases=(dbs.databases||[]).map(d=>({name:d.name,locationId:d.locationId,type:d.type,pointInTimeRecoveryEnablement:d.pointInTimeRecoveryEnablement,deleteProtectionState:d.deleteProtectionState}));
    const base='/v1/projects/'+PROJECT+'/databases/(default)/documents';
    const cols=await read('firestore.googleapis.com',base+':listCollectionIds',{pageSize:100});
    result.collections=cols.collectionIds||[];result.counts={};
    async function count(collection,field,value,op='EQUAL'){
        const q={from:[{collectionId:collection}]};if(field)q.where={fieldFilter:{field:{fieldPath:field},op,value:typeof value==='number'?{integerValue:String(value)}:{stringValue:value}}};
        const answer=await read('firestore.googleapis.com',base+':runAggregationQuery',{structuredAggregationQuery:{structuredQuery:q,aggregations:[{alias:'n',count:{}}]}});
        return Array.isArray(answer)?Number(answer[0]?.result?.aggregateFields?.n?.integerValue??0):{httpStatus:answer.httpStatus};
    }
    for(const c of ['spieler','spieler_public','spieltage','scorecards','flights','scoreSyncV2Generations','roundClosureReceipts','historyPublication'])result.counts[c]=await count(c);
    for(const [key,c,field,value,op] of [['activeRounds','spieltage','status','Aktiv'],['closedRounds','spieltage','status','Beendet'],
        ['v2RoundSnapshots','spieltage','hcpSnapshotVersion',1],['publishedClosures','spieltage','_roundClose.version',1],
        ['cardsWithGeneration','scorecards','_sync.generation','', 'GREATER_THAN'],['playersWithPinHash','spieler','pinHash','','GREATER_THAN']])result.counts[key]=await count(c,field,value,op);
    const f=await read('cloudfunctions.googleapis.com','/v2/projects/'+PROJECT+'/locations/europe-west1/functions');
    result.functions={status:f.httpStatus||200,items:(f.functions||[]).map(x=>({name:x.name,state:x.state,updateTime:x.updateTime,uri:x.serviceConfig?.uri}))};
    return result;
}
if(require.main===module)main().then(r=>{fs.writeFileSync('.local-runtime/production-readonly-audit.json',JSON.stringify(r,null,2));console.log(JSON.stringify(r,null,2));}).catch(()=>{console.error('Read-only audit failed; no credentials or document contents logged.');process.exitCode=1;});
