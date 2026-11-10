'use strict';
const path=require('node:path'),assert=require('node:assert/strict'),browser=require('./s08-browser.cjs');
async function launch(profile,port,catalog,resumeDirectory){
    let ready,release;const available=new Promise(r=>ready=r),done=new Promise(r=>release=r),options={resumeDirectory,multiProfile:true};
    const running=browser.run(profile,port,catalog,async client=>{ready(client);await done;},options);
    const client=await Promise.race([available,running.then(()=>{throw new Error('Browser ended before ready');})]);
    return {client,catalog,async stop(crash=false){if(crash)client.crashProcess();release();return running;},async restart(crash=false){const previous=client.profileDirectory;await this.stop(crash);return launch(profile,port,catalog,previous);}};
}
async function twelve(profile,port,root){const devices=[];try{for(let i=0;i<12;i++)devices.push(await launch(profile,port,path.join(root,'p'+String(i+1).padStart(2,'0'))));assert.equal(new Set(devices.map(d=>d.client.profileDirectory)).size,12);assert.equal(new Set(devices.map(d=>d.client.processId)).size,12);return devices;}catch(e){await Promise.allSettled(devices.map(d=>d.stop()));throw e;}}
module.exports={launch,twelve};
