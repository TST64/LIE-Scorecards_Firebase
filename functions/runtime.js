'use strict';
function createRuntime(env=process.env,installNetwork=true){
    if(env.LIE_MODE==='local'){
        const guard=require('./local-guard'),options=guard.validate(env);
        if(installNetwork)require('./network-guard');
        return {mode:'local',options:{region:'europe-west1',maxInstances:10},disabledMail:guard.disabledMail,
            database(admin){admin.initializeApp({...options,credential:guard.credential(admin)});return admin.firestore();},
            request:async(name,db,request,work)=>work()};
    }
    if(env.LIE_MODE!=='preprod')throw new Error('Explicit local or preprod mode required.');
    const guard=require('./preprod-guard'),options=guard.validate(env);
    // No loopback monkeypatch in Cloud: grpc-js resolves IPs before TLS.
    // Project-bound SDK options and the dedicated runtime IAM scope apply.
    return {mode:'preprod',options:{region:'europe-west1',maxInstances:1,serviceAccount:guard.SERVICE_ACCOUNT},
        disabledMail:async()=>{throw new Error('Mail disabled in PreProd.');},
        database(admin){
            let db;
            function get(){
                guard.assertRuntime(env);
                if(!db){admin.initializeApp({...options,credential:admin.credential.applicationDefault()});db=admin.firestore();}
                return db;
            }
            // No ADC, metadata or database calls during Firebase CLI discovery.
            return new Proxy({}, {get:(_,key)=>(...args)=>get()[key](...args)});
        },
        async request(name,db,request,work){
            const deny=()=>{const e=new Error('PreProd request not permitted.');e.code='preprod-request-denied';throw e;};
            const safePin=value=>typeof value==='string'&&/^\d{6}$/.test(value)&&!['000000','111111','123456','654321','999999'].includes(value);
            if(!guard.CALLS.includes(name))deny();
            if(name==='verifyPlayerPin'){
                if(!guard.WRITERS.includes(request.data?.spielerId)||!safePin(request.data?.pin))deny();
                const player=await db.collection('spieler').doc(request.data.spielerId).get();
                if(!player.exists||!/^scrypt\$[^$]+\$[a-f0-9]{64}$/.test(player.data().pinHash||''))deny();
            }else if(name!=='getLoginPlayers'&&!guard.WRITERS.includes(request.auth?.uid))deny();
            if(name==='updatePlayerPin'&&!safePin(request.data?.newPin))deny();
            const result=await work();
            return name==='getLoginPlayers'?{...result,spieler:result.spieler.filter(p=>guard.WRITERS.includes(p.id))}:result;
        }
    };
}
module.exports={createRuntime};
