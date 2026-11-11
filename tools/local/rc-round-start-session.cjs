'use strict';
require('./network-guard.cjs');
const guard=require('../../functions/local-guard'),admin=require('../../functions/node_modules/firebase-admin');
const {profile}=require('./profile.cjs'),{probe,createServer}=require('./server.cjs');
async function main(){
    const p=profile();await probe(p);
    const instance=admin.initializeApp({...guard.validate(process.env),credential:guard.credential(admin)},'rc-start-proof');
    let server;
    try{
        if((await instance.auth().listUsers(1)).users.length)throw new Error('Fresh synthetic Auth required.');
        const data=await require('./rc-fixture.cjs').seed(instance.firestore());
        server=createServer(p);await new Promise((r,j)=>{server.once('error',j);server.listen(12501,'127.0.0.1',r);});
        if(process.env.RC_START_SMOKE==='1')await require('../../tests/rc-smoke.cjs').run(p,12501,instance.firestore(),data);
        else await require('../../tests/rc-round-start-ui.cjs').run(p,12501,instance,data,process.env.RC_START_EXPECT_BLOCKED==='1');
    }finally{if(server)await new Promise(r=>server.close(r));await instance.delete();}
}
main().catch(error=>{console.error('RC round-start proof failed: '+error.name+'; no cloud fallback.');console.error(String(error.stack).split('\n').filter(x=>/^\s+at /.test(x)).join('\n'));process.exitCode=1;});
