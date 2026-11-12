'use strict';
// Offline proposal review only: no Firebase SDK, network, credentials or deploy.
const fs=require('node:fs'),path=require('node:path');
function review(p){
    const fail=()=>{throw new Error('fieldtest-proposal-rejected');};
    if(!p||p.schemaVersion!==1||p.cloudExecutionAuthorized!==false||p.approved!==false||p.runtimeProfileImplemented!==false||p.testStarted!==false)fail();
    if(p.projectId!=='lie-scorecards-preprod'||p.hostingSite!==p.projectId||p.origin!=='https://'+p.projectId+'.web.app'
        ||p.authDomain!==p.projectId+'.firebaseapp.com'||p.region!=='europe-west1')fail();
    if(p.dataPolicy!=='synthetic-only-no-production-imports'||p.mailMode!=='disabled'||p.gasUrl!==null||p.serviceWorker!=='disabled'
        ||p.knownDemoPinsAllowed!==false||p.hashAllTwelvePlayers!==true||p.secretPolicy!=='individual-random-six-digit-pins-out-of-band-hashes-only')fail();
    if(JSON.stringify(p.issueCredentialsOnlyTo)!==JSON.stringify(['MS01','MS05','MS09'])||!Array.isArray(p.flights)||p.flights.length!==3
        ||p.flights.some((f,i)=>f.length!==4||f[0]!==p.issueCredentialsOnlyTo[i])||new Set(p.flights.flat()).size!==12)fail();
    if(Object.values(p.frontendFirebaseValues||{}).length!==3||Object.values(p.frontendFirebaseValues).some(v=>v!==null))fail();
    return {proposalConsistent:true,cloudExecutionAuthorized:false,onlineReady:false,
        remaining:['explicit-project-and-billing-approval','dedicated-preprod-runtime-bootstrap','private-synthetic-seed-and-claims','artifact-and-IAM-review','separate-deployment-approval','three-phone-field-check']};
}
if(require.main===module){
    try{if(process.argv.length!==2)throw new Error('offline-only');console.log(JSON.stringify(review(JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../config/fieldtest/proposal.json'),'utf8'))),null,2));}
    catch(_){console.error('Offline fieldtest review rejected; no cloud action.');process.exitCode=1;}
}
module.exports={review};
