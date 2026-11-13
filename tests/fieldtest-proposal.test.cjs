'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const proposal=require('../config/fieldtest/proposal.json'),{review}=require('../tools/preprod/fieldtest-review.cjs');
test('offline fieldtest proposal never claims cloud authorization or online readiness',()=>{
    const result=review(proposal);assert.equal(result.onlineReady,false);assert.equal(result.cloudExecutionAuthorized,false);
});
test('cloud flags, shared/demo access, foreign targets and credential values fail closed',()=>{
    for(const patch of [{cloudExecutionAuthorized:true},{approved:true},{projectId:'other-project'},{knownDemoPinsAllowed:true},
        {hashAllTwelvePlayers:false},{frontendFirebaseValues:{apiKey:'secret',appId:null,messagingSenderId:null}}])assert.throws(()=>review({...structuredClone(proposal),...patch}));
});
