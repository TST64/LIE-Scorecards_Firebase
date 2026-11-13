'use strict';
// Only the production artifact installs this as runtime.js. No user allowlist,
// no fallback PIN, no synthetic seed, no emulator mode or production migration.
const PROJECT='liescorecard-70c5e',SA='163868016379-compute@developer.gserviceaccount.com';
function validate(env){
    let cfg;try{cfg=env.FIREBASE_CONFIG?JSON.parse(env.FIREBASE_CONFIG):{};}catch(_){throw new Error('Production configuration rejected.');}
    if(env.LIE_MODE!=='production'||(env.GCLOUD_PROJECT||env.GOOGLE_CLOUD_PROJECT||cfg.projectId)!==PROJECT
        ||[env.GCLOUD_PROJECT,env.GOOGLE_CLOUD_PROJECT,cfg.projectId].some(x=>x&&x!==PROJECT)
        ||['GOOGLE_APPLICATION_CREDENTIALS','FIREBASE_TOKEN','FUNCTIONS_EMULATOR','FIREBASE_EMULATOR_HUB','FIRESTORE_EMULATOR_HOST','FIREBASE_AUTH_EMULATOR_HOST'].some(k=>env[k]!==undefined))throw new Error('Production configuration rejected.');
}
function createRuntime(env=process.env){
    validate(env);
    return {mode:'production',options:{region:'europe-west1',maxInstances:1,serviceAccount:SA},
        disabledMail:async()=>{throw new Error('External PIN delivery disabled.');},
        database(admin){let db;return new Proxy({}, {get:(_,key)=>(...args)=>{
            validate(env);if(!env.K_SERVICE||!env.K_REVISION)throw new Error('Cloud runtime required.');
            if(!db){admin.initializeApp({projectId:PROJECT,serviceAccountId:SA,credential:admin.credential.applicationDefault()});db=admin.firestore();}
            return db[key](...args);
        }});},
        async request(name,db,r,work){
            const deny=()=>{const e=new Error('Production access not permitted.');e.code='preprod-request-denied';throw e;};
            if(['historyCorrectionV1','requestTempPin'].includes(name))deny();
            if(name==='verifyPlayerPin'){
                if(typeof r.data?.spielerId!=='string'||!/^[A-Za-z0-9_-]{1,200}$/.test(r.data.spielerId)||['1234','4227'].includes(r.data.pin))deny();
                const p=await db.collection('spieler').doc(r.data.spielerId).get();
                if(!p.exists||!/^scrypt\$[^$]+\$[a-f0-9]{64}$/.test(p.data().pinHash||''))deny();
            }
            return work();
        }
    };
}
module.exports={createRuntime,validate};
