'use strict';
// Purely local packaging. Never invokes Firebase, credentials, network or deploy.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {validate,PROJECT}=require('./runtime-config.cjs'),{csp}=require('./hosting-contract.cjs');
const root=path.resolve(__dirname,'../..'),runtime=path.join(root,'.local-runtime');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
async function build(input,output){
    const production=input?.mode==='production';
    const c=production?require('../production/config.cjs').validate(input):validate(input),projectId=c.projectId,out=path.resolve(output);fs.mkdirSync(runtime,{recursive:true});
    const sourceCommit=require('node:child_process').execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
    const sourceDirty=!!require('node:child_process').execFileSync('git',['status','--porcelain'],{cwd:root,encoding:'utf8'}).trim();
    if(!out.startsWith(runtime+path.sep))throw new Error('Output must be a fresh directory inside .local-runtime.');
    fs.mkdirSync(out,{recursive:true});
    if(fs.realpathSync(out)!==out||fs.readdirSync(out).length)throw new Error('Output is not empty or is a redirected path.');
    const files={};
    function write(name,data){const file=path.join(out,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,data,{flag:'wx'});files[name]=hash(data);}
    function read(name){const f=path.join(root,name);if(!fs.lstatSync(f).isFile()||fs.lstatSync(f).isSymbolicLink())throw new Error('Regular source files only.');return fs.readFileSync(f);}
    let html=read('index.html').toString();
    const adapter=production?'Production':'Preprod',profileFile=production?'production-profile.js':'preprod-profile.js';
    html=html.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/,'<meta http-equiv="Content-Security-Policy" content="'+csp(projectId)+'">')
        .replace('/__local/profile.js','/'+profileFile).replace('src="App_Environment.js"','src="App_'+adapter+'Environment.js"')
        .replace('data-environment="local"','data-environment="'+c.mode+'"')
        .replace('LOKAL · demo-lie-scorecards-local · kein E-Mail-Versand',production?'PRODUKTION · '+projectId:'PREPROD — SYNTHETIC TEST DATA · '+projectId+' · kein E-Mail-Versand');
    if(!html.includes('"Views_Golfplaetze.js"'))throw new Error('Unknown startup script list.');
    html=html.replace('"Views_Golfplaetze.js"','"Views_Golfplaetze.js", "App_'+adapter+'Bindings.js"');
    const scripts=[...html.matchAll(/"([A-Za-z_0-9]+\.js)"/g)].map(m=>m[1]);
    for(const file of new Set(scripts)){
        if(file==='config.js')continue;
        let data=read(file);
        if(file==='Views_Dashboard.js')data=Buffer.from(data.toString().replace(/const gameUrl = [^\r\n]+;/,'const gameUrl = "#external-game-disabled";'));
        if(file==='App_Logic_UI.js')data=Buffer.from(data.toString().replace('https://tst64.github.io/LIE_Scorecards_PixelGolf/','#external-game-disabled'));
        write('hosting/'+file,data);
    }
    write('hosting/index.html',html);write('hosting/404.html',html);
    const profile={mode:c.mode,projectId:projectId,origin:c.origin,region:c.region};
    write('hosting/'+profileFile,'window.LIE_'+(production?'PRODUCTION':'PREPROD')+'_PROFILE=Object.freeze('+JSON.stringify(profile)+');');
    write('hosting/config.js','var CONFIG=Object.freeze({appVersion:'+JSON.stringify(production?'rc1-production-'+sourceCommit.slice(0,12):'rc1-preprod')+',appName:"lie-scorecard",gasUrl:null});var firebaseConfig=Object.freeze('+JSON.stringify(c.firebase)+');window.CONFIG=CONFIG;window.firebaseConfig=firebaseConfig;');
    for(const file of ['Style.css','manifest.json'])write('hosting/'+file,read(file));
    // Only the logo referenced by the application, no historical screenshots.
    write('hosting/img/LIE_Logo II.jpeg',read('img/LIE_Logo II.jpeg'));
    const vendors={
        '__vendor/tailwind.js':'@tailwindcss/browser/dist/index.global.js',
        '__vendor/fontawesome/css/all.min.css':'@fortawesome/fontawesome-free/css/all.min.css',
        ...Object.fromEntries(['app','auth','firestore','functions'].map(n=>['__sdk/firebase-'+n+'-compat.js','firebase/firebase-'+n+'-compat.js']))};
    for(const file of fs.readdirSync(path.join(root,'node_modules/@fortawesome/fontawesome-free/webfonts')).filter(n=>/\.(woff2|ttf)$/.test(n)))vendors['__vendor/fontawesome/webfonts/'+file]='@fortawesome/fontawesome-free/webfonts/'+file;
    for(const [target,source] of Object.entries(vendors))write('hosting/'+target,read('node_modules/'+source));
    for(const file of fs.readdirSync(path.join(root,'functions')).filter(n=>/^[a-z0-9-]+\.js$/.test(n)||['package.json','package-lock.json'].includes(n))){
        if(file==='production-runtime.js'||production&&['preprod-guard.js','local-guard.js','network-guard.js'].includes(file))continue;
        write('functions/'+file,read('functions/'+(production&&file==='runtime.js'?'production-runtime.js':file)));
    }
    write('functions/.env.'+projectId,'LIE_MODE='+c.mode+'\n');write('firestore.rules',read('firestore.rules'));
    const config={functions:{source:'functions',runtime:'nodejs22',...(production?{}:{codebase:'preprod-fieldtest'})},firestore:{rules:'firestore.rules'},
        hosting:{site:projectId,public:'hosting',ignore:['**/.*','**/*.map'],headers:[{source:'**',headers:[
            {key:'Cache-Control',value:'no-store'},{key:'X-Content-Type-Options',value:'nosniff'},
            {key:'Referrer-Policy',value:'no-referrer'},{key:'Content-Security-Policy',value:csp(projectId)}]}],
            rewrites:[{source:'**',destination:'/index.html'}]}};
    if(production){
        delete config.hosting;
        write('hosting/CNAME','app.lochihnein.de\n');
        write('hosting/.nojekyll','');
        write('HOSTING_TARGET.json',JSON.stringify({origin:c.origin,public:'hosting',preserveExistingStaticHost:true,firebaseHostingRollout:false,dnsChangeAuthorized:false,releaseDecision:'NO-GO'},null,2));
    }
    write('firebase.json',JSON.stringify(config,null,2));
    const evidence={schemaVersion:1,sourceCommit,sourceDirty,mode:c.mode,projectId:projectId,origin:c.origin,cloudExecutionAuthorized:false,...(production?{releaseDecision:'NO-GO',dataMigrationAuthorized:false}:{}),files};
    write('ARTIFACT.json',JSON.stringify({...evidence,artifactDigest:hash(JSON.stringify(files))},null,2));return evidence;
}
if(require.main===module){
    (async()=>{if(process.argv.length!==4)throw new Error('Usage: node tools/preprod/build.cjs <runtime-config.json> <fresh-.local-runtime-output>');
        const result=await build(JSON.parse(fs.readFileSync(path.resolve(process.argv[2]),'utf8')),process.argv[3]);console.log(JSON.stringify({projectId:result.projectId,files:Object.keys(result.files).length,cloudExecutionAuthorized:false}));
    })().catch(()=>{console.error('Offline PreProd build rejected. No cloud action.');process.exitCode=1;});
}
module.exports={build};
