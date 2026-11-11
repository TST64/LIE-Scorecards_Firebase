'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process'),{profile,PROJECT}=require('./profile.cjs');
const root=path.resolve(__dirname,'../..'),args=process.argv.slice(2);
if(args.length>1||(args.length&&args[0]!=='--expect-blocked'))throw new Error('Local RC round-start proof only.');
profile();
const runtime=path.join(root,'.local-runtime');fs.mkdirSync(runtime,{recursive:true});
const dotenv=path.join(root,'functions/.env.local');
for(const f of fs.readdirSync(path.join(root,'functions')).filter(f=>f==='.env'||f.startsWith('.env.')))
    if(f!=='.env.local'||fs.readFileSync(dotenv,'utf8')!=='LIE_MODE=local\n')throw new Error('Unexpected Functions environment.');
if(!fs.existsSync(dotenv))fs.writeFileSync(dotenv,'LIE_MODE=local\n',{flag:'wx'});
// All seven endpoints differ from the user's running RC, including auxiliary ports.
const ports={auth:12099,firestore:12088,functions:12001},emulators=Object.fromEntries(Object.entries(ports).map(([k,port])=>[k,{host:'127.0.0.1',port}]));
const config=path.join(root,'.firebase-local.generated.json');
fs.writeFileSync(config,JSON.stringify({functions:{source:'functions',runtime:'nodejs22'},firestore:{rules:'firestore.rules'},
    emulators:{...emulators,firestore:{...emulators.firestore,websocketPort:12915},hub:{host:'127.0.0.1',port:12400},
        logging:{host:'127.0.0.1',port:12450},ui:{enabled:false},singleProjectMode:true}}));
const home=fs.mkdtempSync(path.join(runtime,'rc-start-home-')),tmp=path.join(home,'tmp');fs.mkdirSync(tmp);
const env={...process.env,LIE_MODE:'local',FUNCTIONS_EMULATOR:'true',GCLOUD_PROJECT:PROJECT,GOOGLE_CLOUD_PROJECT:PROJECT,
    LIE_AUTH_PORT:'12099',LIE_FIRESTORE_PORT:'12088',LIE_FUNCTIONS_PORT:'12001',LIE_APP_PORT:'12501',
    FIRESTORE_EMULATOR_HOST:'127.0.0.1:12088',FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:12099',
    FIREBASE_CLI_DISABLE_UPDATE_CHECK:'true',FIREBASE_EMULATORS_PATH:path.join(runtime,'emulators'),CI:'true',NO_GCE_CHECK:'true',
    LIE_BROWSER_USERPROFILE:process.env.USERPROFILE||'',LIE_BROWSER_APPDATA:process.env.APPDATA||'',
    LIE_BROWSER_HOME:process.env.HOME||process.env.USERPROFILE||'',HOME:home,USERPROFILE:home,APPDATA:home,
    CLOUDSDK_CONFIG:home,XDG_CONFIG_HOME:home,TEMP:tmp,TMP:tmp,TMPDIR:tmp,RC_START_EXPECT_BLOCKED:args.length?'1':'0'};
for(const key of ['GOOGLE_APPLICATION_CREDENTIALS','FIREBASE_TOKEN','NODE_OPTIONS','FIREBASE_CONFIG','FIREBASE_EMULATOR_HUB',
    'HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','http_proxy','https_proxy','all_proxy'])delete env[key];
const child=spawn(process.execPath,[path.join(root,'node_modules/firebase-tools/lib/bin/firebase.js'),'emulators:exec','--config',config,
    '--project',PROJECT,'--only','auth,firestore,functions','node tools/local/rc-round-start-session.cjs'],{cwd:root,env,windowsHide:true,stdio:'inherit'});
child.once('error',()=>{process.exitCode=1;});child.once('exit',code=>{process.exitCode=code??1;});
