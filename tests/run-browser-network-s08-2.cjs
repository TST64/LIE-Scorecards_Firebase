'use strict';
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path'),browser=require('./s08-browser.cjs'),{profile}=require('../tools/local/profile.cjs');
async function main(){
    const catalog=path.resolve('.local-runtime/82-network');fs.mkdirSync(catalog,{recursive:true});
    // A harness/CSP regression, not an application or emulator acceptance.
    // CSP and Chromium's resolver deny the remote negative-control image.
    const server=http.createServer((q,r)=>{r.writeHead(200,{'content-type':'text/html','content-security-policy':"default-src 'self'; script-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'"});r.end('<script>window.app={state:{currentView:"login"},logic:{callFunction(){}}}</script>');});
    await new Promise(r=>server.listen(0,'127.0.0.1',r));
    for(const key of ['USERPROFILE','APPDATA','HOME'])process.env['LIE_BROWSER_'+key]=process.env[key]||process.env.USERPROFILE||'';
    try{await browser.run(profile({}),server.address().port,catalog,async c=>{
        const result=await c.evaluate("(async()=>{let failed=false,violation=false;document.addEventListener('securitypolicyviolation',e=>{if(e.effectiveDirective==='img-src'&&e.blockedURI.startsWith('https://www.google.com/images/cleardot.gif'))violation=true;});const image=new Image();image.onerror=()=>{failed=true;};image.src='https://www.google.com/images/cleardot.gif?s08-negative';await new Promise(r=>setTimeout(r,700));return {failed,violation};})()");
        assert.deepEqual(result,{failed:true,violation:true});fs.writeFileSync(path.join(catalog,'csp-image-evidence.json'),JSON.stringify(c.networkBoundaryEvidence(),null,2));
    });console.log('PASS browser CSP image boundary regression; no remote response.');}
    finally{await new Promise(r=>server.close(r));}
}
main().catch(e=>{console.error(e.name+': '+e.message);process.exitCode=1;});
