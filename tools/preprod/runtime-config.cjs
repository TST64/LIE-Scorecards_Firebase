'use strict';
const PROJECT='lie-scorecards-preprod';
function validate(c){
    const fail=()=>{throw new Error('preprod-runtime-config-rejected');};
    if(!c||Object.keys(c).sort().join(',')!=='firebase,mode,origin,projectId,region,schemaVersion'||c.schemaVersion!==1||c.mode!=='preprod'
        ||c.projectId!==PROJECT||c.origin!=='https://'+PROJECT+'.web.app'||c.region!=='europe-west1')fail();
    const f=c.firebase;if(!f||Object.keys(f).sort().join(',')!=='apiKey,appId,authDomain,messagingSenderId,projectId,storageBucket'
        ||f.projectId!==PROJECT||f.authDomain!==PROJECT+'.firebaseapp.com'||![PROJECT+'.firebasestorage.app',PROJECT+'.appspot.com'].includes(f.storageBucket)
        ||!/^AIza[A-Za-z0-9_-]{35}$/.test(f.apiKey||'')||!/^\d+$/.test(f.messagingSenderId||'')||!new RegExp('^1:'+f.messagingSenderId+':web:[a-f0-9]+$').test(f.appId||''))fail();
    return JSON.parse(JSON.stringify(c));
}
module.exports={validate,PROJECT};
