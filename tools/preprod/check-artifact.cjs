'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function check(directory){
    const root=path.resolve(directory),m=JSON.parse(fs.readFileSync(path.join(root,'ARTIFACT.json'),'utf8'));
    const expected=m.mode==='production'?'liescorecard-70c5e':'lie-scorecards-preprod';
    const origin=m.mode==='production'?'https://app.lochihnein.de':'https://'+expected+'.web.app';
    if(m.schemaVersion!==1||m.projectId!==expected||m.origin!==origin
        ||m.cloudExecutionAuthorized!==false||hash(JSON.stringify(m.files))!==m.artifactDigest)throw new Error('Artifact manifest mismatch.');
    for(const [name,digest] of Object.entries(m.files)){
        if(!/^[A-Za-z0-9_ ./-]+$/.test(name)||name.split('/').some(p=>p==='..'||p==='.')||path.isAbsolute(name))throw new Error('Artifact path mismatch.');
        const file=path.join(root,name);if(!fs.lstatSync(file).isFile()||fs.lstatSync(file).isSymbolicLink()||hash(fs.readFileSync(file))!==digest)throw new Error('Artifact file mismatch.');
    }
    function inventory(dir,prefix=''){
        for(const n of fs.readdirSync(dir)){
            const key=prefix+n;if(key==='functions/node_modules')continue;
            const file=path.join(dir,n),s=fs.lstatSync(file);if(s.isSymbolicLink())throw new Error('Artifact symlink.');
            if(s.isDirectory())inventory(file,key+'/');else if(key!=='ARTIFACT.json'&&!Object.hasOwn(m.files,key))throw new Error('Unexpected artifact file.');
        }
    }
    inventory(root);return {integrityVerified:true,projectId:m.projectId,artifactDigest:m.artifactDigest,cloudExecutionAuthorized:false};
}
if(require.main===module){try{if(process.argv.length!==3)throw new Error();console.log(JSON.stringify(check(process.argv[2]),null,2));}catch(_){console.error('Offline artifact check rejected. No cloud action.');process.exitCode=1;}}
module.exports={check};
