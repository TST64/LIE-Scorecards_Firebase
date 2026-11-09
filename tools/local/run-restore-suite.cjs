'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawn}=require('node:child_process'),net=require('node:net');
const root=path.resolve(__dirname,'../..'),runtime=path.join(root,'.local-runtime'),id='run-'+Date.now()+'-'+crypto.randomUUID().slice(0,8),reuse=process.env.S08_REUSE_BACKUP_RUN;
if(reuse&&!/^run-[0-9]+-[a-f0-9]{8}$/.test(reuse))throw new Error('Invalid local sealed backup run');
const runRoot=path.join(runtime,'s08/backups',reuse||id),catalogRoot=path.join(runtime,'s08/catalogs',id),PROJECT='demo-lie-scorecards-local';
const only=process.env.S08_RESTORE_ONLY;if(only&&(!reuse||!['closed','interrupted','authstate'].includes(only)))throw new Error('Targeted scenario requires a sealed local backup run');
if(process.argv.length!==2)throw new Error('No arguments supported; local synthetic tests only');
const dotenv=path.join(root,'functions/.env.local');
for(const f of fs.readdirSync(path.join(root,'functions')).filter(f=>f==='.env'||f.startsWith('.env.')))if(f!=='.env.local'||fs.readFileSync(dotenv,'utf8')!=='LIE_MODE=local\n')throw new Error('Unexpected Functions environment');
if(!fs.existsSync(dotenv))fs.writeFileSync(dotenv,'LIE_MODE=local\n',{flag:'wx'});
fs.mkdirSync(runRoot,{recursive:true,mode:0o700});fs.mkdirSync(catalogRoot,{recursive:true,mode:0o700});
async function stopped(port){return new Promise((resolve,reject)=>{const s=net.connect({host:'127.0.0.1',port});s.setTimeout(1500);s.once('connect',()=>{s.destroy();reject(new Error('Previous source endpoint remains reachable'));});s.once('error',error=>error.code==='ECONNREFUSED'?resolve():reject(new Error('Source shutdown unproven')));s.once('timeout',()=>{s.destroy();reject(new Error('Source shutdown unproven'));});});}
const sourcePorts=[9699,8688,5601,6002];
async function session(role,index,artifact){
    const ports=[9699+index*100,8688+index*100,5601+index*100,6002+index*100],catalog=path.join(catalogRoot,role),home=path.join(catalog,'empty-home');fs.mkdirSync(home,{recursive:true});
    // CLI treats its config directory as project root and forbids external rules.
    // Only code/config are shared. Emulator databases are fresh process memory;
    // no --import, --export-on-exit or previous data directory is supplied.
    const config=path.join(root,'.firebase-local.generated.json'),body=JSON.stringify({functions:{source:'functions',runtime:'nodejs22'},firestore:{rules:'firestore.rules'},emulators:{auth:{host:'127.0.0.1',port:ports[0]},firestore:{host:'127.0.0.1',port:ports[1]},functions:{host:'127.0.0.1',port:ports[2]},hub:{host:'127.0.0.1',port:4400},logging:{host:'127.0.0.1',port:4500},ui:{enabled:false},singleProjectMode:true}},null,2);fs.writeFileSync(config,body);fs.writeFileSync(path.join(catalog,'firebase.json'),body);
    const env={...process.env,LIE_MODE:'local',FUNCTIONS_EMULATOR:'true',GCLOUD_PROJECT:PROJECT,GOOGLE_CLOUD_PROJECT:PROJECT,LIE_AUTH_PORT:String(ports[0]),LIE_FIRESTORE_PORT:String(ports[1]),LIE_FUNCTIONS_PORT:String(ports[2]),LIE_APP_PORT:String(ports[3]),FIRESTORE_EMULATOR_HOST:'127.0.0.1:'+ports[1],FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:'+ports[0],FIREBASE_CLI_DISABLE_UPDATE_CHECK:'true',FIREBASE_EMULATORS_PATH:path.join(runtime,'emulators'),CI:'true',NO_GCE_CHECK:'true',S08_ROLE:role,S08_RUN_ROOT:runRoot,S08_CATALOG:catalog,S08_INSTANCE:crypto.randomUUID(),S08_SOURCE_PORTS:JSON.stringify(sourcePorts),LIE_BROWSER_USERPROFILE:process.env.USERPROFILE||'',LIE_BROWSER_APPDATA:process.env.APPDATA||'',LIE_BROWSER_HOME:process.env.HOME||process.env.USERPROFILE||'',HOME:home,USERPROFILE:home,APPDATA:home,CLOUDSDK_CONFIG:home,XDG_CONFIG_HOME:home};
    for(const key of ['GOOGLE_APPLICATION_CREDENTIALS','FIREBASE_TOKEN','NODE_OPTIONS','FIREBASE_CONFIG','HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','http_proxy','https_proxy','all_proxy'])delete env[key];
    if(artifact){env.S08_BACKUP=path.join(runRoot,'backups',role);env.S08_ANCHOR=artifact.digest;}
    const output=fs.openSync(path.join(catalog,'session.log'),'wx');console.log('S08 starting '+role+' in fresh local processes.');
    const code=await new Promise((resolve,reject)=>{const child=spawn(process.execPath,[path.join(root,'node_modules/firebase-tools/lib/bin/firebase.js'),'emulators:exec','--config',config,'--project',PROJECT,'--only','auth,firestore,functions','node tools/local/restore-session.cjs'],{cwd:root,env,windowsHide:true,stdio:['ignore',output,output]});child.once('error',reject);child.once('exit',resolve);});fs.closeSync(output);
    if(code!==0)throw new Error(role+' session failed; inspect private local log: '+path.join(catalog,'session.log'));console.log('PASS S08 '+role+' session');
}
async function main(){
    console.log('S08 local evidence directory: '+runRoot);
    if(!reuse){await session('source',0);const source=path.resolve(catalogRoot,'source'),retired=path.resolve(catalogRoot,'source-retired');if(!source.startsWith(catalogRoot+path.sep)||!retired.startsWith(catalogRoot+path.sep))throw new Error('Unsafe retirement path');fs.renameSync(source,retired);}
    else if(!JSON.parse(fs.readFileSync(path.join(runRoot,'source-proof.json'),'utf8')).sourceBrowserStopped)throw new Error('Source shutdown not proven');
    for(const port of sourcePorts)await stopped(port);
    const anchors=JSON.parse(fs.readFileSync(path.join(runRoot,'anchors.json'),'utf8'));
    for(const [i,role] of ['closed','interrupted','authstate'].entries())if(!only||only===role)await session(role,i+1,anchors[role]);
    if(only){console.log('PASS S08 selected local scenario '+only+'; this is not a complete-suite or release GO.');return;}
    const proofs={run:id,source:JSON.parse(fs.readFileSync(path.join(runRoot,'source-proof.json'),'utf8')),anchors,releaseGo:false};for(const role of ['closed','interrupted','authstate'])proofs[role]=JSON.parse(fs.readFileSync(path.join(runRoot,role+'-proof.json'),'utf8'));
    fs.writeFileSync(path.join(runtime,'s08-proof.json'),JSON.stringify(proofs,null,2));console.log('PASS S08 complete: cold restore, generation births, interrupted import/history, fresh V2 progress and fail-closed artifacts. No production GO.');
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
