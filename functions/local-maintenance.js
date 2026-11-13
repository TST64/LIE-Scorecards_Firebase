'use strict';
const {randomUUID}=require('node:crypto');
// Only explicitly armed, owner-controlled demo catalogues can be backed up.
// Unarmed development retains the existing transaction contract; arming is a
// separate local cold-start operation before users or requests exist.
async function assertWritable(tx,db){const s=await tx.get(db.collection('localMaintenance').doc('current'));if(s.exists&&s.data().state!=='armed')throw new Error('Local maintenance barrier');}
async function withRequest(db,kind,work){
    const gate=db.collection('localMaintenance').doc('current'),peek=await gate.get();
    if(!peek.exists)return work();
    const ref=db.collection('localMaintenanceRequests').doc(randomUUID());
    await db.runTransaction(async tx=>{const s=await tx.get(gate);if(!s.exists||s.data().state!=='armed')throw new Error('Local maintenance barrier');tx.set(ref,{active:true,kind,pid:process.pid,instanceId:s.data().instanceId,startedAt:Date.now()});});
    try{return await work();}
    finally{await db.runTransaction(async tx=>{const s=await tx.get(ref);if(s.exists)tx.set(ref,{...s.data(),active:false,finishedAt:Date.now()});});}
}
module.exports={assertWritable,withRequest};
