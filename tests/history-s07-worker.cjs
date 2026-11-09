'use strict';
// Test-only OS process. The crash flag is never exposed by an application API.
const guard=require('../functions/local-guard'),admin=require('../functions/node_modules/firebase-admin');
async function main(){
    const runId=process.argv[2];if(!/^[A-Za-z0-9_-]{1,200}$/.test(runId))throw new Error('Invalid local test run');
    const instance=admin.initializeApp({...guard.validate(process.env),credential:guard.credential(admin)},'s07-recovery-worker'),db=instance.firestore();
    const wrapped={collection:db.collection.bind(db),runTransaction:db.runTransaction.bind(db),batch(){const batch=db.batch();return {set(...args){batch.set(...args);},async commit(){await batch.commit();if(process.argv[3]==='crash-after-batch')process.exit(73);}};}};
    try{const result=await require('../functions/history-correction').createHistoryCorrection(wrapped)({uid:'MS01',token:{playerId:'MS01',role:'Admin',mustChangePin:false}},{action:'stage',runId});console.log('S07_WORKER '+JSON.stringify({phase:result.phase,staged:result.staged}));}
    finally{await instance.delete();}
}
main().catch(()=>{console.error('S07 local worker failed; no credential output.');process.exitCode=1;});
