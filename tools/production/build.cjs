'use strict';
const fs=require('node:fs'),path=require('node:path'),{validate}=require('./config.cjs');
async function build(config,out){return require('../preprod/build.cjs').build(validate(config),out);}
if(require.main===module){(async()=>{
    if(process.argv.length!==3)throw new Error('Fresh local output required.');
    const r=await build(require('../../config/production/runtime.json'),path.resolve(process.argv[2]));
    console.log(JSON.stringify({projectId:r.projectId,files:Object.keys(r.files).length,decision:'NO-GO',cloudExecutionAuthorized:false}));
})().catch(()=>{console.error('Offline production build rejected. No cloud action.');process.exitCode=1;});}
module.exports={build};
