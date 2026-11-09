'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const {memoryDatabase,fieldValue}=require('./memory-score-database');
async function fixture(){
    assert.ok(fs.existsSync('functions/round-start.js'),'authoritative versioned round initialization required');
    const {createRoundStart}=require('../round-start'),db=memoryDatabase();
    await db.collection('spieler').doc('M').set({role:'Spielleiter',mustChangePin:false});
    for(const id of ['A','B'])await db.collection('spieler').doc(id).set({role:'Spieler',hcpLIE:54,mustChangePin:false});
    await db.collection('config').doc('saison').set({saisonStartDatum:'2026-01-01',seasonStartHcpByPlayer:{A:0}});
    await db.collection('kurse').doc('K').set({name:'Synthetic'});
    for(let n=1;n<=18;n++)await db.collection('bahnen').doc('H'+n).set({kursId:'K',nr:n,par:4,si:n});
    const auth={uid:'M',token:{playerId:'M',role:'Spielleiter',mustChangePin:false}};
    const data={spieltagObj:{id:'R',date:'2026-01-03',kursId:'K',rundenTyp:'9-Back',bahnAnzahl:9,status:'Aktiv',teilnehmerCsv:'A,B'},flightsPayload:[{id:'FL-R-1',spieltagId:'R',spielerIdsCsv:'A,B'}]};
    const run=createRoundStart(db,fieldValue);return {db,auth,data,run};
}
test('real creation contract uses season baseline/explicit zero, not todays HCP; atomic and idempotent',async()=>{
    const f=await fixture(),r=await f.run(f.auth,f.data);assert.equal(r.success,true);assert.equal(r.spieltag.hcpStart.A,0);assert.equal(r.spieltag.hcpStart.B,26);assert.equal(r.spieltag.hcpSnapshotVersion,1);
    assert.equal(Object.keys(r.spieltag.holeAllowances.B).length,9);assert.equal(Object.values(r.spieltag.holeAllowances.B).reduce((a,b)=>a+b,0),13);
    const again=await f.run(f.auth,f.data);assert.deepEqual(again,r);assert.equal((await f.db.collection('flights').doc('FL-R-1').get()).exists,true);
});
for(const kind of ['foreign-role','forced-pin','duplicate-member','missing-member','invalid-hole','client-snapshot'])test('initialization denies '+kind+' before creating any round',async()=>{
    const f=await fixture();if(kind==='foreign-role')f.auth={uid:'A',token:{playerId:'A',role:'Admin',mustChangePin:false}};
    if(kind==='forced-pin')f.auth.token.mustChangePin=true;if(kind==='duplicate-member')f.data.flightsPayload[0].spielerIdsCsv='A,A,B';
    if(kind==='missing-member')f.data.flightsPayload[0].spielerIdsCsv='A';if(kind==='invalid-hole')await f.db.collection('bahnen').doc('H18').delete();
    if(kind==='client-snapshot')f.data.spieltagObj.hcpStart={A:54,B:54};
    await assert.rejects(f.run(f.auth,f.data));assert.equal((await f.db.collection('spieltage').doc('R').get()).exists,false);assert.equal((await f.db.collection('flights').doc('FL-R-1').get()).exists,false);
});
test('existing round or competing active participant is never overwritten or backfilled',async()=>{
    const f=await fixture();await f.db.collection('spieltage').doc('R').set({id:'R',status:'Aktiv'});await assert.rejects(f.run(f.auth,f.data));assert.equal((await f.db.collection('spieltage').doc('R').get()).data().hcpStart,undefined);
    f.data.spieltagObj.id='R2';f.data.flightsPayload=[{id:'FL-R2-1',spieltagId:'R2',spielerIdsCsv:'A,B'}];await f.db.collection('spieltage').doc('OTHER').set({date:'2026-01-02',status:'Aktiv',teilnehmerCsv:'A'});
    await assert.rejects(f.run(f.auth,f.data));
});
