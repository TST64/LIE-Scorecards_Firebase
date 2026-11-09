'use strict';
const {createHash}=require('node:crypto');const H=require('./hcp-rules');
function requireValue(ok,message){if(!ok)throw new Error(message);}
function id(value){return typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value);}
function csv(value){const ids=String(value||'').split(',').map(x=>x.trim());requireValue(ids.length>0&&ids.every(id)&&new Set(ids).size===ids.length,'Invalid participant mapping');return ids;}
function canonical(x){if(Array.isArray(x))return x.map(canonical);return x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;}
function createRoundStart(db)
{
    return async function(auth,input)
    {
        requireValue(auth&&auth.uid===auth.token?.playerId&&auth.token.mustChangePin===false,'Authentication required');
        const request=structuredClone(input||{}),raw=request.spieltagObj,flights=request.flightsPayload;
        requireValue(raw&&id(raw.id)&&id(raw.kursId)&&/^\d{4}-\d{2}-\d{2}$/.test(raw.date)&&new Date(raw.date).toISOString().slice(0,10)===raw.date,'Invalid round identity/date');
        requireValue(Object.keys(raw).every(k=>['id','date','kursId','rundenTyp','bahnAnzahl','status','teilnehmerCsv','bruttoSieger','nettoSieger','kalenderId'].includes(k))&&raw.status==='Aktiv','Client snapshot not permitted');
        const r=H.normalizeRound(raw),members=csv(raw.teilnehmerCsv);
        requireValue(members.length<=12&&Array.isArray(flights)&&flights.length>=1&&flights.length<=12,'Invalid round/flight count');
        const normalizedFlights=flights.map((f,i)=>{
            const seq=Number(f.seq ?? f.id?.split('-').at(-1)),ids=csv(f.spielerIdsCsv);
            requireValue(Number.isSafeInteger(seq)&&seq>0&&f.id==='FL-'+raw.id+'-'+seq&&f.spieltagId===raw.id&&ids.length<=4,'Invalid flight');
            return {id:f.id,spieltagId:raw.id,seq,spielerIdsCsv:ids.join(',')};
        });
        const assigned=normalizedFlights.flatMap(f=>csv(f.spielerIdsCsv));
        requireValue(new Set(normalizedFlights.map(f=>f.id)).size===normalizedFlights.length&&assigned.length===members.length&&new Set(assigned).size===members.length&&members.every(x=>assigned.includes(x)),'Invalid flight membership');
        const normalized={...raw,rundenTyp:r.type,bahnAnzahl:r.H,teilnehmerCsv:members.join(','),flights:normalizedFlights};
        const fingerprint=createHash('sha256').update(JSON.stringify(canonical(normalized))).digest('hex');
        return db.runTransaction(async tx=>{
            const actor=await tx.get(db.collection('spieler').doc(auth.uid));
            requireValue(actor.exists&&!actor.data().istGeloescht&&!actor.data().mustChangePin&&!actor.data().pinChangePending
                &&['Admin','Spielleiter'].includes(actor.data().role)&&auth.token.role===actor.data().role,'Round initialization not authorized');
            const ref=db.collection('spieltage').doc(raw.id),existing=await tx.get(ref);
            if(existing.exists){requireValue(existing.data()._roundStart?.fingerprint===fingerprint&&existing.data().hcpSnapshotVersion===1,'Existing round cannot be overwritten/backfilled');return {success:true,spieltag:existing.data(),flights:normalizedFlights};}
            const config=await tx.get(db.collection('config').doc('saison'));
            requireValue(config.exists&&typeof config.data().saisonStartDatum==='string'&&raw.date>=config.data().saisonStartDatum,'Missing valid season baseline');
            const season=config.data(),start=Object.fromEntries(members.map(p=>[p,Object.hasOwn(season.seasonStartHcpByPlayer||{},p)?H.normalizeHcp(season.seasonStartHcpByPlayer[p]):26]));
            for(const p of members){const player=await tx.get(db.collection('spieler').doc(p));requireValue(player.exists&&!player.data().istGeloescht,'Missing active participant');}
            const course=await tx.get(db.collection('kurse').doc(raw.kursId));requireValue(course.exists,'Course missing');
            const holes=await tx.get(db.collection('bahnen').where('kursId','==',raw.kursId));const courseHoles=holes.docs.map(d=>d.data());
            const rows=await tx.get(db.collection('handicaps').where('kursId','==',raw.kursId));
            const numeric=v=>{requireValue(typeof v==='number'||(typeof v==='string'&&/^\d+(\.\d+)?$/.test(v)),'Invalid course table value');return Number(v);};
            const table=rows.docs.map(d=>({vorgabe:numeric(d.data().vorgabe),spielvorgabe:numeric(d.data().spielvorgabe)}));
            requireValue(table.every(t=>Number.isFinite(t.vorgabe)&&Number.isSafeInteger(t.spielvorgabe)&&t.spielvorgabe>=0),'Invalid course handicap table');
            const active=await tx.get(db.collection('spieltage').where('status','==','Aktiv'));
            const closed=await tx.get(db.collection('spieltage').where('status','==','Beendet'));
            const rounds={docs:[...active.docs,...closed.docs]};
            const previous=[];
            for(const doc of rounds.docs){const old={...doc.data(),id:doc.id};if(old.istGeloescht)continue;
                const overlap=String(old.teilnehmerCsv||'').split(',').some(p=>members.includes(p));if(!overlap)continue;
                requireValue(old.status!=='Aktiv','Participant already has active round; S05 required');
                if(old.status==='Beendet')requireValue(typeof old.date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(old.date),'Historical round date missing');
                if(old.status==='Beendet'&&old.date>=season.saisonStartDatum){requireValue(old.date<raw.date&&old.hcpSnapshotVersion===1&&Array.isArray(old.hcpHoleData),'Legacy/history initialization blocked until safe S07 validation');previous.push(old);}
            }
            const historical=[];for(const old of previous){const scores=await tx.get(db.collection('scorecards').where('spieltagId','==',old.id));historical.push(...scores.docs.map(d=>d.data()));}
            const plan=H.plan(previous,historical,start,old=>old.hcpHoleData,old=>old.hcpCourseTable||[]);
            requireValue(plan.entries.every(e=>e.complete),'Incomplete history blocks start HCP');
            requireValue(plan.entries.every(e=>previous.find(r=>r.id===e.roundId).hcpStart?.[e.playerId]===e.startHcp),'Historical start chain requires S07 verification');
            const snapshots=Object.fromEntries(members.map(p=>[p,H.snapshot(raw,courseHoles,plan.currentHcp[p],table)]));
            const occupied=await tx.get(db.collection('scorecards').where('spieltagId','==',raw.id));requireValue(!occupied.docs.length,'Orphan scorecards prevent initialization');
            for(const f of normalizedFlights){const old=await tx.get(db.collection('flights').doc(f.id));requireValue(!old.exists,'Flight already exists');}
            const spieltag={...raw,rundenTyp:r.type,bahnAnzahl:r.H,teilnehmerCsv:members.join(','),hcpSnapshotVersion:1,
                hcpStart:Object.fromEntries(members.map(p=>[p,snapshots[p].startHcp])),holeAllowances:Object.fromEntries(members.map(p=>[p,snapshots[p].holeAllowances])),
                hcpHoleData:snapshots[members[0]].holeData,hcpCourseTable:table,_roundStart:{version:1,fingerprint,source:'season-baseline-plus-complete-history',seasonStart:season.saisonStartDatum}};
            tx.set(ref,spieltag);for(const f of normalizedFlights)tx.set(db.collection('flights').doc(f.id),f);
            return {success:true,spieltag,flights:normalizedFlights};
        });
    };
}
module.exports={createRoundStart};
