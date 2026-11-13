'use strict';
const PROJECT='lie-scorecards-preprod',SERVICE_ACCOUNT='fieldtest-runtime@'+PROJECT+'.iam.gserviceaccount.com';
const WRITERS=Object.freeze(['MS01','MS05','MS09']);
const CALLS=Object.freeze(['getLoginPlayers','verifyPlayerPin','getPlayerSessionState','updatePlayerPin',
    'readOwnFlightScoresV2','saveScoreOperationsV2','readPublishedSeasonV1','roundClosureV1','createRoundStart']);
function validate(env){
    if(env.LIE_MODE!=='preprod')throw new Error('PreProd mode required.');
    let config;try{config=env.FIREBASE_CONFIG?JSON.parse(env.FIREBASE_CONFIG):null;}catch(_){throw new Error('Invalid PreProd config.');}
    const project=env.GCLOUD_PROJECT||env.GOOGLE_CLOUD_PROJECT||config?.projectId;
    if(project!==PROJECT||[env.GCLOUD_PROJECT,env.GOOGLE_CLOUD_PROJECT,config?.projectId].some(v=>v&&v!==PROJECT))throw new Error('PreProd project mismatch.');
    if(['GOOGLE_APPLICATION_CREDENTIALS','FIREBASE_TOKEN','FUNCTIONS_EMULATOR','FIREBASE_EMULATOR_HUB',
        'FIRESTORE_EMULATOR_HOST','FIREBASE_AUTH_EMULATOR_HOST','FIREBASE_DATABASE_EMULATOR_HOST',
        'STORAGE_EMULATOR_HOST','CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE'].some(k=>env[k]!==undefined))throw new Error('Mixed PreProd credentials/emulators.');
    if(config?.databaseURL||config?.storageBucket&&![PROJECT+'.firebasestorage.app',PROJECT+'.appspot.com'].includes(config.storageBucket))throw new Error('Foreign PreProd resource.');
    return {projectId:PROJECT,serviceAccountId:SERVICE_ACCOUNT};
}
function assertRuntime(env){
    validate(env);
    if(!env.K_SERVICE||!env.K_REVISION)throw new Error('PreProd credentials available only inside the deployed Cloud Run runtime.');
}
module.exports={validate,assertRuntime,PROJECT,SERVICE_ACCOUNT,WRITERS,CALLS};
