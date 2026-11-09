'use strict';
const H=require('../hcp-rules');
function metadata(round,starts,table=[]){
    const course=Array.from({length:18},(_,i)=>({nr:i+1,par:4,si:i+1}));const snapshots=Object.fromEntries(Object.entries(starts).map(([id,hcp])=>[id,H.snapshot(round,course,hcp,table)]));
    return {hcpSnapshotVersion:1,hcpStart:starts,hcpHoleData:Object.values(snapshots)[0].holeData,hcpCourseTable:table,holeAllowances:Object.fromEntries(Object.entries(snapshots).map(([id,s])=>[id,s.holeAllowances]))};
}
module.exports={metadata};
