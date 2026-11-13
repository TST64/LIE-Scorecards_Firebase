'use strict';
require('./network-guard.cjs');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process'),net=require('node:net');
const guard=require('../../functions/local-guard'),admin=require('../../functions/node_modules/firebase-admin'),{profile}=require('./profile.cjs'),{createServer,probe}=require('./server.cjs'),B=require('./synthetic-backup.cjs'),C=require('./restore-contract.cjs');
async function closedPort(port){return new Promise((resolve,reject)=>{const s=net.connect({host:'127.0.0.1',port});s.setTimeout(1000);s.once('connect',()=>{s.destroy();reject(new Error('Source endpoint still reachable'));});s.once('error',error=>error.code==='ECONNREFUSED'?resolve():reject(new Error('Source refusal not proven')));s.once('timeout',()=>{s.destroy();reject(new Error('Source refusal not proven'));});});}
async function main(){
    const role=process.env.S08_ROLE,catalog=path.resolve(process.env.S08_CATALOG||''),runRoot=path.resolve(process.env.S08_RUN_ROOT||''),allowed=path.resolve(__dirname,'../../.local-runtime/s08');if(!catalog.startsWith(allowed+path.sep)||!runRoot.startsWith(allowed+path.sep))throw new Error('Unsafe catalogue');
    const p=profile();await probe(p);const instance=admin.initializeApp({...guard.validate(process.env),credential:guard.credential(admin)},'s08-session'),db=instance.firestore(),auth=instance.auth(),instanceId=process.env.S08_INSTANCE;
    let server;
    try{
        if(role==='source')await B.arm(db,auth,instanceId);
        else{
            for(const port of JSON.parse(process.env.S08_SOURCE_PORTS))await closedPort(port);
            const workerEnv={...process.env};let result;
            if(role==='closed'){
                for(const kind of ['checksum','generation','receipt','stage','claims','revision','snapshot','projection','partial-export']){await assert.rejects(B.restore(db,auth,admin,path.join(runRoot,'backups',kind==='partial-export'?kind:'rejected-'+kind),process.env.S08_ANCHOR,instanceId));assert.equal((await db.listCollections()).length,0,'rejected backup must not write target');assert.equal((await auth.listUsers(1)).users.length,0);}
                const crashed=spawnSync(process.execPath,['tools/local/restore-worker.cjs'],{cwd:path.resolve(__dirname,'../..'),env:{...workerEnv,S08_CRASH_IMPORT:'1'},encoding:'utf8',windowsHide:true,timeout:55000});assert.equal(crashed.status,74);
                assert.equal((await db.collection('restoreControl').doc('current').get()).data().phase,'importing');
                const endpoint='http://127.0.0.1:'+p.emulators.functions.port+'/'+C.PROJECT+'/europe-west1/getLoginPlayers';const response=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json'},body:'{"data":{}}'});assert.ok((await response.json()).error,'partial restore must not expose login/app data');
            }
            const restored=spawnSync(process.execPath,['tools/local/restore-worker.cjs'],{cwd:path.resolve(__dirname,'../..'),env:workerEnv,encoding:'utf8',windowsHide:true,timeout:55000});if(restored.status!==0)console.error(String(restored.stderr||'').split('\n').filter(line=>/^\s+at |^S08 local restore worker/.test(line)).join('\n'));assert.equal(restored.status,0,'fresh worker must finish import');
            result=(await db.collection('restoreControl').doc('current').get()).data();assert.equal(result.phase,'verified');assert.equal(result.birthPairs,role==='interrupted'?432:433);assert.equal(result.changedCreateTimes,result.birthPairs,'all fresh target births differ from original timestamps');
            const again=await B.restore(db,auth,admin,process.env.S08_BACKUP,process.env.S08_ANCHOR,instanceId);assert.equal(again.repeated,true);assert.equal(again.restoreId,result.restoreId);
        }
        const port=Number(process.env.LIE_APP_PORT);server=createServer(p);await new Promise((r,j)=>{server.once('error',j);server.listen(port,'127.0.0.1',r);});
        const artifact=role==='source'?null:B.readArtifact(process.env.S08_BACKUP,process.env.S08_ANCHOR);let outcome;
        const browser=await require('../../tests/s08-browser.cjs').run(p,port,path.join(catalog,'browser'),async client=>{
            if(role==='source')outcome=await require('../../tests/s08-source.cjs').run(client,db,auth,p,runRoot);
            else if(role==='authstate')outcome=await require('../../tests/s08-authstate.cjs').run(client,db,auth);
            else outcome=await require('../../tests/s08-target.cjs').run(client,db,auth,admin,artifact,role);
        });
        if(role==='source'){
            outcome.anchors.closed=await B.capture(db,auth,path.join(runRoot,'backups','closed'),outcome.quarantine);
            const closed=B.readArtifact(path.join(runRoot,'backups','closed'),outcome.anchors.closed.digest),altered=structuredClone(closed.payload);
            const player=altered.documents.find(d=>d.path==='spieler/MS12').data;player.mustChangePin=true;player.pinChangePending='synthetic-pending-restore';
            altered.users.find(u=>u.uid==='MS10').disabled=true;const locked=altered.documents.find(d=>d.path==='spieler/MS11').data;locked.failedPinAttempts=5;locked.pinLockUntil=C.encode(admin.firestore.Timestamp.fromMillis(Date.now()+86400000));
            const fixture=C.seal(altered);B.writeArtifact(path.join(runRoot,'backups','authstate'),fixture);outcome.anchors.authstate={digest:fixture.digest,authUsers:12,inventory:fixture.inventory};
            const negatives=[];for(const kind of ['checksum','generation','receipt','stage','claims','revision','snapshot','projection']){
                const bad=structuredClone(closed);if(kind==='checksum'){bad.digest='0'.repeat(64);assert.throws(()=>C.verify(bad,closed.digest));}
                else{const s=bad.payload,remove=prefix=>s.documents.splice(s.documents.findIndex(d=>d.path.startsWith(prefix)),1);
                    if(kind==='generation')remove('scoreSyncV2Generations/');if(kind==='receipt'){const meta=Object.values(s.documents.find(d=>d.path.startsWith('scorecards/')).data._sync.fields)[0];const candidates=new Set(s.users.map(u=>'scoreSyncV2Mutations/'+require('../../functions/round-close').hash([u.uid,meta.lastMutationId])));s.documents=s.documents.filter(d=>!candidates.has(d.path));}if(kind==='stage')remove('historyCorrectionStages/');if(kind==='claims')s.users[0].customClaims.role='unexpected';
                    const r=s.documents.find(d=>d.path.startsWith('spieltage/')&&d.data.status==='Beendet').data;if(kind==='revision')r._roundClose.revision++;if(kind==='snapshot')delete r.hcpStart;if(kind==='projection')remove('spieler_public/');assert.throws(()=>C.seal(s));
                }B.writeArtifact(path.join(runRoot,'backups','rejected-'+kind),bad);negatives.push(kind);
            }
            const broken=path.join(runRoot,'backups','partial-export');fs.mkdirSync(broken,{recursive:true});fs.writeFileSync(path.join(broken,'backup.json.partial'),'incomplete');assert.throws(()=>B.readArtifact(broken,closed.digest));negatives.push('partial-export');
            fs.writeFileSync(path.join(runRoot,'anchors.json'),JSON.stringify(outcome.anchors,null,2),{mode:0o600});fs.writeFileSync(path.join(runRoot,'source-proof.json'),JSON.stringify({instanceId,authUsers:12,cards:433,closingBackupRefused:outcome.closingRefused,activeStageWaited:outcome.activeStageWaited,negativeCases:negatives,sourceBrowserStopped:true,forbiddenOrigins:browser.forbiddenOrigins,inventory:outcome.anchors.closed.inventory},null,2));
        }else{
            const checkpoint=(await db.collection('restoreControl').doc('current').get()).data();const repeated=await B.restore(db,auth,admin,process.env.S08_BACKUP,process.env.S08_ANCHOR,instanceId);assert.equal(repeated.repeated,true,'repeat after normal progress must never rewind data');
            fs.writeFileSync(path.join(runRoot,role+'-proof.json'),JSON.stringify({instanceId,restoreId:checkpoint.restoreId,sourceFallbackUnavailable:true,freshBrowserProfile:true,forbiddenOrigins:browser.forbiddenOrigins,birthPairs:checkpoint.birthPairs,changedCreateTimes:checkpoint.changedCreateTimes,partialImportDenied:role==='closed',...outcome,releaseGo:false},null,2));
        }
        console.log('PASS S08 '+role+': isolated catalogue, verified snapshot, fresh browser and unchanged integrity gates.');
    }finally{if(server)await new Promise(r=>server.close(r));await instance.delete();}
}
main().catch(error=>{console.error('S08 local session failed ('+error.name+'); no source fallback, no GO.');console.error(String(error.stack).split('\n').filter(line=>/^\s+at /.test(line)).join('\n'));process.exitCode=1;});
