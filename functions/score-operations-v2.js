"use strict";

const { createHash, randomUUID } = require("node:crypto");
const FIELDS = ["strokes", "puts", "lady", "maxscore"];
const HcpRules = require('./hcp-rules');

function identifier(value)
{
    return typeof value === "string" && value.length > 0 && value.length <= 200
        && value.trim() === value && !/[\x00-\x1f/]/.test(value)
        && value !== "." && value !== "..";
}

function hash(value)
{
    return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function canonical(value)
{
    if (Array.isArray(value))
    {
        return value.map(canonical);
    }
    if (value && typeof value === "object")
    {
        return Object.fromEntries(Object.keys(value).sort().map(function(key)
        {
            return [key, canonical(value[key])];
        }));
    }
    return value;
}

function result(op, status, revision, reason)
{
    return { changeId: op && op.changeId || null, documentId: op && op.documentId || null,
        field: op && op.field || null, status: status, currentServerRevision: revision, reason: reason };
}

function map(value)
{
    return value !== null && typeof value === "object" && !Array.isArray(value)
        && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function allowedHoles(round)
{
    const ranges = { "18": [18, 1, 18], "9": [9, 1, 9], "9-Front": [9, 1, 9], "9-Back": [9, 10, 18] };
    const range = typeof round.rundenTyp === "string" && Object.hasOwn(ranges, round.rundenTyp) ? ranges[round.rundenTyp] : null;
    return range && round.bahnAnzahl === range[0] ? { first: range[1], last: range[2] } : null;
}

// A legacy generation is tied to Firestore's immutable creation timestamp.
// New V2 cards receive a fresh generation token on creation. A field delete
// preserves that token; physical deletion ends the document lifecycle.
function readDocumentState(snapshot)
{
    if (!snapshot.exists)
    {
        return { generation: "absent", revisions: Object.fromEntries(FIELDS.map(function(field) { return [field, 0]; })) };
    }
    const data = snapshot.data();
    const sync = data._sync;
    if (Object.hasOwn(data, "_sync"))
    {
        if (!map(sync) || !map(sync.fields)
            || (sync.generation !== undefined && (!identifier(sync.generation) || sync.generation === "absent"))
            || Object.keys(sync.fields).some(function(field)
            {
                const meta = sync.fields[field];
                return !FIELDS.includes(field) || !map(meta) || !Number.isSafeInteger(meta.revision)
                    || meta.revision < 0 || !identifier(meta.lastMutationId);
            }))
        {
            throw new Error("invalid-server-metadata");
        }
    }
    const time = snapshot.createTime;
    const legacy = time && Number.isSafeInteger(time.seconds) && Number.isInteger(time.nanoseconds)
        ? "legacy:" + time.seconds + ":" + time.nanoseconds : null;
    if (sync?.generation && (sync.generation.startsWith("legacy:") ? sync.generation !== legacy
        : !sync.generation.startsWith("gen:")))
    {
        throw new Error("document-generation-mismatch");
    }
    const generation = sync?.generation || legacy;
    if (!generation)
    {
        throw new Error("missing-server-generation");
    }
    return { generation: generation, revisions: Object.fromEntries(FIELDS.map(function(field)
    {
        return [field, sync?.fields[field]?.revision ?? 0];
    })) };
}

// Dependencies are injected so unit tests never need credentials or a network.
function createScoreOperationsV2(db, FieldValue)
{
    return async function saveScoreOperationsV2(auth, data)
    {
        // Clone before the first await: caller mutations cannot alter this request.
        const request = JSON.parse(JSON.stringify(data || {}));
        const operations = request.operations;
        if (!Array.isArray(operations) || operations.length < 1 || operations.length > 100)
        {
            throw new Error("Request must contain between 1 and 100 operations.");
        }
        const rejectAll = function(reason)
        {
            return { requestId: request.requestId || null, results: operations.map(function(op)
            {
                return result(op, "rejected", null, reason);
            }) };
        };
        if (!auth || !identifier(auth.uid) || !auth.token
            || !identifier(auth.token.playerId) || auth.uid !== auth.token.playerId
            || auth.token.mustChangePin === true)
        {
            return rejectAll("unauthenticated-or-pin-change-required");
        }
        if (!["requestId", "ownerUid", "playerId", "spieltagId", "flightId"].every(function(key)
        {
            return identifier(request[key]);
        }) || request.ownerUid !== auth.uid || request.playerId !== auth.token.playerId
            || !["ownFlight", "selectedFlight"].includes(request.mode))
        {
            return rejectAll("invalid-request-context");
        }
        const ids = operations.map(function(op)
        {
            return op && op.changeId;
        });
        if (ids.some(function(id)
        {
            return !identifier(id);
        }) || new Set(ids).size !== ids.length)
        {
            return rejectAll("invalid-or-duplicate-change-id");
        }

        return db.runTransaction(async function(tx)
        {
            await require('./local-maintenance').assertWritable(tx,db);
            if((await require('./history-lock').historyState(tx,db)).activeRun)return rejectAll('history-correction-barrier');
            const actorRef = db.collection("spieler").doc(auth.token.playerId);
            const roundRef = db.collection("spieltage").doc(request.spieltagId);
            const flightRef = db.collection("flights").doc(request.flightId);
            const requestRef = db.collection("scoreSyncV2Requests").doc(hash([auth.uid, request.requestId]));
            const [actor, round, flight, priorRequest, roundFlights] = await Promise.all([
                tx.get(actorRef), tx.get(roundRef), tx.get(flightRef), tx.get(requestRef),
                tx.get(db.collection("flights").where("spieltagId","==",request.spieltagId))
            ]);
            const fingerprint = hash(canonical(request));
            if (priorRequest.exists && priorRequest.data().fingerprint !== fingerprint)
            {
                return rejectAll("request-id-reused-with-different-content");
            }
            // A definitive rejection/conflict belongs to this immutable request.
            // A late duplicate must not revive an operation explicitly resolved
            // after an earlier rejection. A deliberate new decision needs new IDs.
            const terminal = priorRequest.exists ? priorRequest.data().terminalResults || [] : [];
            function deny(reason)
            {
                const reply = rejectAll(reason);
                tx.set(requestRef, { fingerprint: fingerprint, terminalResults: terminal.length ? terminal : reply.results });
                return reply;
            }
            if (!actor.exists || actor.data().istGeloescht === true || actor.data().mustChangePin === true || actor.data().pinChangePending)
            {
                return deny("invalid-actor");
            }
            const role = actor.data().role || "Spieler";
            const privileged = role === "Admin" || role === "Spielleiter";
            if (!["Spieler", "Spielleiter", "Admin"].includes(role))
            {
                return deny("invalid-role");
            }
            if (!round.exists || round.data().istGeloescht === true
                || !['Aktiv','Beendet'].includes(round.data().status))
            {
                return deny("round-not-editable");
            }
            const holes = allowedHoles(round.data());
            if (!holes)
            {
                return deny("invalid-round-configuration");
            }
            const members = flight.exists ? String(flight.data().spielerIdsCsv || "").split(",").map(function(id)
            {
                return id.trim();
            }).filter(Boolean) : [];
            if (!flight.exists || flight.data().spieltagId !== request.spieltagId
                || !members.length || new Set(members).size !== members.length
                || members.some(id=>!identifier(id) || roundFlights.docs.filter(doc=>String(doc.data().spielerIdsCsv || '').split(',').map(x=>x.trim()).includes(id)).length!==1)
                || (request.mode === "ownFlight" && !members.includes(auth.token.playerId))
                || (request.mode === "selectedFlight" && !privileged))
            {
                return deny("flight-not-authorized");
            }
            try { HcpRules.validateRoundSnapshot(round.data(),members); }
            catch (_) { return deny('round-start-snapshots-missing-or-invalid'); }
            const writeLocked=round.data().status!=='Aktiv'||round.data().closure?.phase==='collecting'||!!round.data()._roundClose;

            const valid = operations.map(function(op)
            {
                const contextValid = ["ownerUid", "playerId", "spieltagId", "flightId"].every(function(key)
                {
                    return op[key] === request[key];
                });
                const numeric = op.field === "strokes" || op.field === "puts";
                const valueValid = op.operation === "delete" ? op.value === null
                    : numeric ? Number.isSafeInteger(op.value) && op.value >= (op.field === "strokes" ? 1 : 0)
                        : typeof op.value === "boolean";
                return contextValid && identifier(op.spielerId) && members.includes(op.spielerId)
                    && Number.isInteger(op.hole) && op.hole >= holes.first && op.hole <= holes.last
                    && op.documentId === "SC-" + request.spieltagId + "-" + op.spielerId + "-" + op.hole
                    && FIELDS.includes(op.field) && ["set", "delete"].includes(op.operation)
                    && valueValid && Number.isSafeInteger(op.baseFieldRevision) && op.baseFieldRevision >= 0
                    && identifier(op.baseDocumentGeneration);
            });
            const documents = new Map();
            const receipts = new Map();
            // All transaction reads precede all writes, including reads for rejected operations.
            for (let i = 0; i < operations.length; i++)
            {
                const op = operations[i];
                if (!valid[i])
                {
                    continue;
                }
                if (!documents.has(op.documentId))
                {
                    const ref = db.collection("scorecards").doc(op.documentId);
                    const snap = await tx.get(ref);
                    const target = await tx.get(db.collection("spieler").doc(op.spielerId));
                    let state;
                    let metadataError;
                    try
                    {
                        state = readDocumentState(snap);
                    }
                    catch (error)
                    {
                        metadataError = error.message;
                    }
                    const generation = state?.generation === "absent" ? "gen:" + randomUUID() : state?.generation;
                    let generationRef;
                    if (generation?.startsWith("gen:"))
                    {
                        generationRef = db.collection("scoreSyncV2Generations").doc(hash([op.documentId, generation]));
                        const binding = await tx.get(generationRef);
                        if (snap.exists ? !binding.exists || binding.data().documentId !== op.documentId
                            || binding.data().generation !== generation
                            || binding.createTime.seconds !== snap.createTime.seconds
                            || binding.createTime.nanoseconds !== snap.createTime.nanoseconds : binding.exists)
                        {
                            metadataError = "document-generation-mismatch";
                        }
                    }
                    documents.set(op.documentId, { ref: ref, data: snap.exists ? snap.data() : {},
                        creation: { hcpStart:round.data().hcpStart?.[op.spielerId], strokesGiven:round.data().holeAllowances?.[op.spielerId]?.[String(op.hole)],...(round.data().historyPublication?{historyPublication:round.data().historyPublication}:{}),...(round.data().hcpSnapshotRevision?{hcpSnapshotRevision:round.data().hcpSnapshotRevision}:{}) },
                        exists: snap.exists, targetValid: target.exists && target.data().istGeloescht !== true,
                        observedGeneration: state?.generation,
                        generation: generation, generationRef: generationRef,
                        revisions: state?.revisions, metadataError: metadataError,
                        patch: {}, metadata: {}, states: {} });
                }
                const ref = db.collection("scoreSyncV2Mutations").doc(hash([auth.uid, op.changeId]));
                receipts.set(op.changeId, { ref: ref, snap: await tx.get(ref) });
            }
            const receiptWrites = [];
            const results = operations.map(function(op, index)
            {
                if (!valid[index])
                {
                    return result(op, "rejected", null, "invalid-operation");
                }
                const doc = documents.get(op.documentId);
                const stored = doc.data;
                if (!doc.targetValid || (doc.exists && (stored.spieltagId !== request.spieltagId
                    || stored.spielerId !== op.spielerId || stored.hole !== op.hole
                    || (stored.id !== undefined && stored.id !== op.documentId))))
                {
                    return result(op, "rejected", null, "scorecard-context-mismatch");
                }
                if (doc.metadataError)
                {
                    return result(op, "rejected", null, doc.metadataError);
                }
                if (!doc.exists && (!Number.isFinite(doc.creation.hcpStart) || doc.creation.hcpStart<0 || doc.creation.hcpStart>54
                    || !Number.isSafeInteger(doc.creation.strokesGiven) || doc.creation.strokesGiven<0))
                    return result(op,"rejected",null,"missing-authoritative-round-score-metadata");
                const revision = doc.metadata[op.field]?.revision ?? doc.revisions[op.field];
                const mutation = receipts.get(op.changeId);
                const mutationHash = hash(canonical(op));
                if (mutation.snap.exists)
                {
                    const receipt = mutation.snap.data();
                    if (receipt.fingerprint !== mutationHash)
                    {
                        return result(op, "rejected", revision, "change-id-reused-with-different-content");
                    }
                    if (!doc.exists || receipt.generation !== doc.observedGeneration)
                    {
                        return result(op, "rejected", doc.exists ? revision : null,
                            doc.exists ? "document-generation-mismatch" : "document-deleted");
                    }
                    return Object.assign(result(op, "acknowledged", revision, "already-applied"),
                        { appliedFieldRevision: receipt.appliedRevision, appliedDocumentGeneration: receipt.generation });
                }
                const previousDecision = terminal.find(function(entry) { return entry.changeId === op.changeId; });
                if (previousDecision)
                {
                    return result(op, previousDecision.status, revision, previousDecision.reason);
                }
                // Durable receipt replay above remains possible after freeze/close;
                // it acknowledges an existing commit and never mutates a score.
                if(writeLocked)return result(op,'rejected',revision,'round-frozen-or-closed');
                if (op.baseDocumentGeneration !== doc.observedGeneration)
                {
                    return result(op, "rejected", doc.exists ? revision : null,
                        doc.exists ? "document-generation-mismatch" : "document-deleted");
                }
                if (revision !== op.baseFieldRevision)
                {
                    return result(op, "conflict", revision, "field-revision-mismatch");
                }
                if (revision === Number.MAX_SAFE_INTEGER)
                {
                    return result(op, "rejected", revision, "revision-exhausted");
                }
                doc.patch[op.field] = op.operation === "delete" ? FieldValue.delete() : op.value;
                doc.states[op.field] = { deleted: op.operation === "delete", value: op.value };
                doc.metadata[op.field] = { revision: revision + 1, lastMutationId: op.changeId };
                if (!doc.exists)
                {
                    Object.assign(doc.patch, { id: op.documentId, spieltagId: request.spieltagId,
                        spielerId: op.spielerId, hole: op.hole, ...doc.creation });
                }
                receiptWrites.push({ ref: mutation.ref, data: { fingerprint: mutationHash,
                    requestId: request.requestId, appliedRevision: revision + 1, generation: doc.generation } });
                return Object.assign(result(op, "acknowledged", revision + 1, "applied"),
                    { appliedFieldRevision: revision + 1, appliedDocumentGeneration: doc.generation });
            });
            // Report the final revision after all operations of this transaction.
            results.forEach(function(entry)
            {
                const doc = documents.get(entry.documentId);
                const latest = doc?.metadata[entry.field];
                if (latest && entry.currentServerRevision !== null)
                {
                    entry.currentServerRevision = latest.revision;
                }
                if (doc && entry.currentServerRevision !== null)
                {
                    entry.currentDocumentGeneration = doc.generation;
                    const state = doc.states[entry.field];
                    entry.currentServerDeleted = state ? state.deleted : !Object.hasOwn(doc.data, entry.field);
                    entry.currentServerValue = entry.currentServerDeleted ? null
                        : state ? state.value : doc.data[entry.field];
                }
            });
            documents.forEach(function(doc)
            {
                if (Object.keys(doc.patch).length)
                {
                    doc.patch._sync = { fields: doc.metadata, generation: doc.generation };
                    tx.set(doc.ref, doc.patch, { merge: true });
                    if (!doc.exists)
                    {
                        // New card and private birth binding share one atomic commit
                        // and therefore the same Firestore document creation time.
                        tx.set(doc.generationRef, { documentId: doc.patch.id, generation: doc.generation });
                    }
                }
            });
            receiptWrites.forEach(function(write)
            {
                tx.set(write.ref, write.data);
            });
            if(receiptWrites.length){
                const revision=round.data().scoreRevision??0;
                if(!Number.isSafeInteger(revision)||revision<0||revision===Number.MAX_SAFE_INTEGER)throw new Error('Round revision invalid');
                tx.set(roundRef,{scoreRevision:revision+1},{merge:true});
            }
            tx.set(requestRef, { fingerprint: fingerprint, terminalResults: results.filter(function(entry)
            {
                return entry.status !== "acknowledged";
            }) });
            return { requestId: request.requestId, results: results };
        });
    };
}

module.exports = { createScoreOperationsV2, readDocumentState, allowedHoles };
