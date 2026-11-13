'use strict';
require('./network-guard.cjs');
const guard=require('../../functions/local-guard'),admin=require('../../functions/node_modules/firebase-admin'),B=require('./synthetic-backup.cjs');
async function main(){const instance=admin.initializeApp({...guard.validate(process.env),credential:guard.credential(admin)},'s08-restore-worker');try{const result=await B.restore(instance.firestore(),instance.auth(),admin,process.env.S08_BACKUP,process.env.S08_ANCHOR,process.env.S08_INSTANCE,{afterBatch:n=>{if(process.env.S08_CRASH_IMPORT==='1'&&n===1)process.exit(74);}});console.log('S08_RESTORE '+JSON.stringify({phase:result.phase,birthPairs:result.birthPairs,changedCreateTimes:result.changedCreateTimes,repeated:!!result.repeated}));}finally{await instance.delete();}}
main().catch(error=>{console.error('S08 local restore worker failed ('+error.name+'); target remains closed.');console.error(String(error.stack).split('\n').filter(line=>/^\s+at /.test(line)).join('\n'));process.exitCode=1;});
