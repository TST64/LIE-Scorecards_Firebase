'use strict';
// Purely local packaging. Never invokes Firebase, credentials, network or deploy.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {validate,PROJECT}=require('./runtime-config.cjs'),{csp}=require('./hosting-contract.cjs');
const root=path.resolve(__dirname,'../..'),runtime=path.join(root,'.local-runtime');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
async function build(input,output){
    const c=validate(input),out=path.resolve(output);fs.mkdirSync(runtime,{recursive:true});
    if(!out.startsWith(runtime+path.sep))throw new Error('Output must be a fresh directory inside .local-runtime.');
    fs.mkdirSync(out,{recursive:true});
    if(fs.realpathSync(out)!==out||fs.readdirSync(out).length)throw new Error('Output is not empty or is a redirected path.');
    const files={};
    function write(name,data){const file=path.join(out,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,data,{flag:'wx'});files[name]=hash(data);}
    function read(name){const f=path.join(root,name);if(!fs.lstatSync(f).isFile()||fs.lstatSync(f).isSymbolicLink())throw new Error('Regular source files only.');return fs.readFileSync(f);}
    let html=read('index.html').toString();
    html=html.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/,'<meta http-equiv="Content-Security-Policy" content="'+csp(PROJECT)+'">')
        .replace('/__local/profile.js','/preprod-profile.js').replace('src="App_Environment.js"','src="App_PreprodEnvironment.js"')
        .replace('data-environment="local"','data-environment="preprod"')
        .replace('LOKAL · demo-lie-scorecards-local · kein E-Mail-Versand','PREPROD — SYNTHETIC TEST DATA · '+PROJECT+' · kein E-Mail-Versand');
    if(!html.includes('"Views_Golfplaetze.js"'))throw new Error('Unknown startup script list.');
    html=html.replace('"Views_Golfplaetze.js"','"Views_Golfplaetze.js", "App_PreprodBindings.js"');
    const scripts=[...html.matchAll(/"([A-Za-z_0-9]+\.js)"/g)].map(m=>m[1]);
    for(const file of new Set(scripts)){
        if(file==='config.js')continue;
        let data=read(file);
        if(file==='Views_Dashboard.js')data=Buffer.from(data.toString().replace(/const gameUrl = [^\r\n]+;/,'const gameUrl = "#external-game-disabled";'));
        if(file==='App_Logic_UI.js')data=Buffer.from(data.toString().replace('https://tst64.github.io/LIE_Scorecards_PixelGolf/','#external-game-disabled'));
        write('hosting/'+file,data);
    }
    write('hosting/index.html',html);write('hosting/404.html',html);
    const profile={mode:'preprod',projectId:PROJECT,origin:c.origin,region:c.region};
    write('hosting/preprod-profile.js','window.LIE_PREPROD_PROFILE=Object.freeze('+JSON.stringify(profile)+');');
    write('hosting/config.js','var CONFIG=Object.freeze({appVersion:"rc1-preprod",appName:"lie-scorecard",gasUrl:null});var firebaseConfig=Object.freeze('+JSON.stringify(c.firebase)+');window.CONFIG=CONFIG;window.firebaseConfig=firebaseConfig;');
    for(const file of ['Style.css','manifest.json'])write('hosting/'+file,read(file));
    // Only the logo referenced by the application, no historical screenshots.
    write('hosting/img/LIE_Logo II.jpeg',read('img/LIE_Logo II.jpeg'));
    const vendors={
        '__vendor/tailwind.js':'@tailwindcss/browser/dist/index.global.js',
        '__vendor/fontawesome/css/all.min.css':'@fortawesome/fontawesome-free/css/all.min.css',
        ...Object.fromEntries(['app','auth','firestore','functions'].map(n=>['__sdk/firebase-'+n+'-compat.js','firebase/firebase-'+n+'-compat.js']))};
    for(const file of fs.readdirSync(path.join(root,'node_modules/@fortawesome/fontawesome-free/webfonts')).filter(n=>/\.(woff2|ttf)$/.test(n)))vendors['__vendor/fontawesome/webfonts/'+file]='@fortawesome/fontawesome-free/webfonts/'+file;
    for(const [target,source] of Object.entries(vendors))write('hosting/'+target,read('node_modules/'+source));
    for(const file of fs.readdirSync(path.join(root,'functions')).filter(n=>/^[a-z0-9-]+\.js$/.test(n)||['package.json','package-lock.json'].includes(n)))write('functions/'+file,read('functions/'+file));
    write('functions/.env.'+PROJECT,'LIE_MODE=preprod\n');write('firestore.rules',read('firestore.rules'));
    const config={functions:{source:'functions',runtime:'nodejs22',codebase:'preprod-fieldtest'},firestore:{rules:'firestore.rules'},
        hosting:{site:PROJECT,public:'hosting',ignore:['**/.*','**/*.map'],headers:[{source:'**',headers:[
            {key:'Cache-Control',value:'no-store'},{key:'X-Content-Type-Options',value:'nosniff'},
            {key:'Referrer-Policy',value:'no-referrer'},{key:'Content-Security-Policy',value:csp(PROJECT)}]}],
            rewrites:[{source:'**',destination:'/index.html'}]}};
    write('firebase.json',JSON.stringify(config,null,2));
    const evidence={schemaVersion:1,projectId:PROJECT,origin:c.origin,cloudExecutionAuthorized:false,files};
    write('ARTIFACT.json',JSON.stringify({...evidence,artifactDigest:hash(JSON.stringify(files))},null,2));return evidence;
}
if(require.main===module){
    (async()=>{if(process.argv.length!==4)throw new Error('Usage: node tools/preprod/build.cjs <runtime-config.json> <fresh-.local-runtime-output>');
        const result=await build(JSON.parse(fs.readFileSync(path.resolve(process.argv[2]),'utf8')),process.argv[3]);console.log(JSON.stringify({projectId:result.projectId,files:Object.keys(result.files).length,cloudExecutionAuthorized:false}));
    })().catch(()=>{console.error('Offline PreProd build rejected. No cloud action.');process.exitCode=1;});
}
module.exports={build};
