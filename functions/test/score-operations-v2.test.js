"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { createScoreOperationsV2 } = require("../score-operations-v2");

const { memoryDatabase, fieldValue: memoryFieldValue } = require("./memory-score-database");
const { readDocumentState } = require("../score-operations-v2");

let db;
let fieldValue;
if (process.env.SCORE_SYNC_EMULATOR_TEST === "1")
{
    if (!/^(127\.0\.0\.1|localhost):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || "")
        || !(process.env.GCLOUD_PROJECT || "").startsWith("demo-"))
    {
        throw new Error("Emulator tests require a loopback FIRESTORE_EMULATOR_HOST and a demo- project.");
    }
    const admin = require("firebase-admin");
    admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT });
    db = admin.firestore();
    fieldValue = admin.firestore.FieldValue;
    require("node:test").after(async function()
    {
        await db.terminate();
        await admin.app().delete();
    });
}
else
{
    db = memoryDatabase();
    fieldValue = memoryFieldValue;
}

async function fixture()
{
    const suffix = randomUUID();
    const actor = "P-" + suffix;
    const round = "ST-" + suffix;
    const flight = "F-" + suffix;
    const documentId = "SC-" + round + "-" + actor + "-1";
    await db.collection("spieler").doc(actor).set({ role: "Spieler" });
    await db.collection("spieltage").doc(round).set({ status: "Aktiv", rundenTyp: "18", bahnAnzahl: 18, hcpStart:{[actor]:20},holeAllowances:{[actor]:Object.fromEntries(Array.from({length:18},(_,i)=>[i+1,1]))} });
    await db.collection("flights").doc(flight).set({ spieltagId: round, spielerIdsCsv: actor });
    const ref = db.collection("scorecards").doc(documentId);
    const initial = { id: documentId, spieltagId: round, spielerId: actor, hole: 1,
        strokes: 5, puts: 2, lady: true, maxscore: true, hcpStart: 20, strokesGiven: 1 };
    await ref.set(initial);
    const generation = readDocumentState(await ref.get()).generation;
    const auth = { uid: actor, token: { playerId: actor, role: "Spieler" } };
    const request = function(changes)
    {
        const context = { ownerUid: actor, playerId: actor, spieltagId: round, flightId: flight };
        return Object.assign({}, context, { requestId: randomUUID(), mode: "ownFlight",
            operations: changes.map(function(change)
            {
                return Object.assign({}, context, { spielerId: actor, hole: 1, documentId: documentId,
                    changeId: randomUUID(), field: "puts", operation: "set", value: 1, baseFieldRevision: 0, baseDocumentGeneration: generation }, change);
            }) });
    };
    return { auth: auth, request: request, ref: ref, initial: initial,
        run: createScoreOperationsV2(db, fieldValue), actor: actor, round: round, flight: flight };
}

test("only puts and its metadata change; legacy revision zero becomes one", async function()
{
    const f = await fixture();
    const request = f.request([{}]);
    const response = await f.run(f.auth, request);
    assert.equal(response.results[0].status, "acknowledged");
    assert.equal(response.results[0].currentServerRevision, 1);
    assert.equal(response.results[0].currentServerValue, 1);
    assert.equal(response.results[0].currentServerDeleted, false);
    const data = (await f.ref.get()).data();
    assert.deepEqual(data, Object.assign({}, f.initial, { puts: 1,
        _sync: { generation: readDocumentState(await f.ref.get()).generation,
            fields: { puts: { revision: 1, lastMutationId: request.operations[0].changeId } } } }));
});

test("strokes only; matching revision increments; stale revision conflicts", async function()
{
    const f = await fixture();
    await f.run(f.auth, f.request([{ field: "strokes", value: 6 }]));
    const next = await f.run(f.auth, f.request([{ field: "strokes", value: 7, baseFieldRevision: 1 }]));
    assert.equal(next.results[0].currentServerRevision, 2);
    const before = (await f.ref.get()).data();
    const stale = await f.run(f.auth, f.request([{ field: "strokes", value: 8 }]));
    assert.equal(stale.results[0].status, "conflict");
    assert.equal(stale.results[0].currentServerRevision, 2);
    assert.deepEqual((await f.ref.get()).data(), before);
    delete before._sync;
    assert.deepEqual(before, Object.assign({}, f.initial, { strokes: 7 }));
});

test("delete removes only its explicit field", async function()
{
    const f = await fixture();
    const response = await f.run(f.auth, f.request([{ field: "lady", operation: "delete", value: null }]));
    assert.equal(response.results[0].status, "acknowledged");
    assert.equal(response.results[0].currentServerDeleted, true);
    assert.equal(response.results[0].currentServerValue, null);
    const actual = (await f.ref.get()).data();
    assert.equal(Object.hasOwn(actual, "lady"), false);
    delete actual._sync;
    const expected = Object.assign({}, f.initial);
    delete expected.lady;
    assert.deepEqual(actual, expected);
});

test("idempotent retry remains safe even after a later mutation", async function()
{
    const f = await fixture();
    const old = f.request([{}]);
    await f.run(f.auth, old);
    const beforeRetry = (await f.ref.get()).data();
    await f.run(f.auth, old);
    assert.deepEqual((await f.ref.get()).data(), beforeRetry);
    const newEnvelope = structuredClone(old);
    newEnvelope.requestId = randomUUID();
    assert.equal((await f.run(f.auth, newEnvelope)).results[0].status, "acknowledged");
    assert.deepEqual((await f.ref.get()).data(), beforeRetry);
    await f.run(f.auth, f.request([{ value: 3, baseFieldRevision: 1 }]));
    const before = (await f.ref.get()).data();
    const retry = await f.run(f.auth, old);
    assert.equal(retry.results[0].status, "acknowledged");
    assert.equal(retry.results[0].currentServerRevision, 2);
    assert.equal(retry.results[0].currentServerValue, 3);
    assert.equal(retry.results[0].currentServerDeleted, false);
    assert.deepEqual((await f.ref.get()).data(), before);
    const manipulated = structuredClone(old);
    manipulated.requestId = randomUUID();
    manipulated.operations[0].value = 9;
    assert.equal((await f.run(f.auth, manipulated)).results[0].status, "rejected");
});

test("different fields can succeed concurrently and a conflict does not block another field", async function()
{
    const f = await fixture();
    const responses = await Promise.all([
        f.run(f.auth, f.request([{ field: "puts", value: 0 }])),
        f.run(f.auth, f.request([{ field: "strokes", value: 6 }]))
    ]);
    assert.ok(responses.every(function(response)
    {
        return response.results[0].status === "acknowledged";
    }));
    const partial = await f.run(f.auth, f.request([{ field: "puts", value: 3 }, { field: "lady", value: false }]));
    assert.deepEqual(partial.results.map(function(entry)
    {
        return entry.status;
    }), ["conflict", "acknowledged"]);
    const data = (await f.ref.get()).data();
    assert.equal(data.puts, 0);
    assert.equal(data.strokes, 6);
    assert.equal(data.hcpStart, 20);
    assert.equal(data.strokesGiven, 1);
});

test("invalid field, identity, context, revision and operation are rejected without writes", async function()
{
    const f = await fixture();
    for (const change of [{ field: "hcpStart" }, { field: "_sync" }, { documentId: "manipulated" },
        { spielerId: "other" }, { spieltagId: "other" }, { flightId: "other" }, { ownerUid: "other" },
        { playerId: "other" }, { hole: 19 }, { baseFieldRevision: -1 }, { baseFieldRevision: undefined },
        { operation: "increment" }, { value: -1 }])
    {
        const response = await f.run(f.auth, f.request([change]));
        assert.equal(response.results[0].status, "rejected", JSON.stringify(change));
        assert.deepEqual((await f.ref.get()).data(), f.initial);
    }
});

test("request identity is immutable and server roles/flight membership govern access", async function()
{
    const f = await fixture();
    const original = f.request([{}]);
    await f.run(f.auth, original);
    const modified = structuredClone(original);
    modified.operations[0].value = 4;
    assert.equal((await f.run(f.auth, modified)).results[0].status, "rejected");
    const before = (await f.ref.get()).data();
    const selected = f.request([{ baseFieldRevision: 1 }]);
    selected.mode = "selectedFlight";
    const forgedRole = structuredClone(f.auth);
    forgedRole.token.role = "Admin";
    assert.equal((await f.run(forgedRole, selected)).results[0].status, "rejected");
    await db.collection("spieler").doc(f.actor).set({ role: "Spielleiter" });
    assert.equal((await f.run(f.auth, selected)).results[0].status, "rejected");
    const newlyAuthorized = f.request([{ baseFieldRevision: 1 }]);
    newlyAuthorized.mode = "selectedFlight";
    assert.equal((await f.run(f.auth, newlyAuthorized)).results[0].status, "acknowledged");
    await db.collection("flights").doc(f.flight).set({ spieltagId: f.round, spielerIdsCsv: "other" });
    assert.equal((await f.run(f.auth, f.request([{}]))).results[0].status, "rejected");
    assert.equal(before.strokes, (await f.ref.get()).data().strokes);
});

test("unknown round/flight, deleted actor and unauthenticated callers cannot write", async function()
{
    const f = await fixture();
    assert.equal((await f.run(null, f.request([{}]))).results[0].status, "rejected");
    for (const key of ["spieltagId", "flightId"])
    {
        const request = f.request([{}]);
        request[key] = "missing";
        request.operations[0][key] = "missing";
        assert.equal((await f.run(f.auth, request)).results[0].status, "rejected");
    }
    await db.collection("spieler").doc(f.actor).set({ role: "Admin", istGeloescht: true });
    assert.equal((await f.run(f.auth, f.request([{}]))).results[0].status, "rejected");
    assert.deepEqual((await f.ref.get()).data(), f.initial);
});

test("concurrent writes to the same field produce exactly one ACK and one conflict", async function()
{
    const f = await fixture();
    const responses = await Promise.all([
        f.run(f.auth, f.request([{ value: 0 }])),
        f.run(f.auth, f.request([{ value: 3 }]))
    ]);
    assert.deepEqual(responses.map(function(response)
    {
        return response.results[0].status;
    }).sort(), ["acknowledged", "conflict"]);
    assert.equal((await f.ref.get()).data()._sync.fields.puts.revision, 1);
});

test("new document initializes identity but no unrelated or calculated fields", async function()
{
    const f = await fixture();
    const documentId = f.initial.id.replace(/-1$/, "-2");
    const request = f.request([{ hole: 2, documentId: documentId, baseDocumentGeneration: "absent" }]);
    assert.equal((await f.run(f.auth, request)).results[0].status, "acknowledged");
    const actual = (await db.collection("scorecards").doc(documentId).get()).data();
    assert.deepEqual(Object.keys(actual).sort(), ["_sync", "hole", "id", "puts", "spielerId", "spieltagId", "hcpStart", "strokesGiven"].sort());
    assert.equal(actual.puts, 1);
    assert.equal(actual.hcpStart,20);assert.equal(actual.strokesGiven,1);
});

test("closed rounds and invalid hole ranges are denied using server context", async function()
{
    const f = await fixture();
    await db.collection("spieltage").doc(f.round).set({ status: "Beendet" });
    assert.equal((await f.run(f.auth, f.request([{}]))).results[0].status, "rejected");
    await db.collection("spieltage").doc(f.round).set({ status: "Aktiv", rundenTyp: "9-Back", bahnAnzahl: 9 });
    assert.equal((await f.run(f.auth, f.request([{}]))).results[0].status, "rejected");
    assert.deepEqual((await f.ref.get()).data(), f.initial);
});

test("malformed stored field revision is rejected rather than treated as revision zero", async function()
{
    const f = await fixture();
    const malformed = Object.assign({}, f.initial, { _sync: { fields: { puts: null } } });
    await f.ref.set(malformed);
    assert.equal((await f.run(f.auth, f.request([{}]))).results[0].status, "rejected");
    assert.deepEqual((await f.ref.get()).data(), malformed);
});

test("local editing revision zero conflicts with foreign server revision one", async function()
{
    const f = await fixture();
    const local = f.request([{ field: "strokes", value: 5 }]);
    await f.run(f.auth, f.request([{ field: "strokes", value: 7 }]));
    const reply = await f.run(f.auth, local);
    assert.equal(reply.results[0].status, "conflict");
    assert.equal(reply.results[0].currentServerRevision, 1);
    assert.equal((await f.ref.get()).data().strokes, 7);
});

test("malformed _sync containers are rejected, never interpreted as legacy revision zero", async function()
{
    for (const sync of [null, [], "bad", {}, { fields: null }, { fields: [] }, { fields: 1 },
        { fields: { puts: {} } }, { fields: {}, generation: "absent" }])
    {
        const f = await fixture();
        const malformed = Object.assign({}, f.initial, { _sync: sync });
        await f.ref.set(malformed);
        const reply = await f.run(f.auth, f.request([{}]));
        assert.equal(reply.results[0].status, "rejected", JSON.stringify(sync));
        assert.equal(reply.results[0].reason, "invalid-server-metadata");
        assert.deepEqual((await f.ref.get()).data(), malformed);
    }
});

test("explicit 9-hole legacy/front/back configurations have exact server-side ranges", async function()
{
    for (const config of [
        { type: "9", first: 1, denied: 10 },
        { type: "9-Front", first: 1, denied: 10 },
        { type: "9-Back", first: 10, denied: 1 }
    ])
    {
        const f = await fixture();
        await db.collection("spieltage").doc(f.round).set({ status: "Aktiv", rundenTyp: config.type, bahnAnzahl: 9, hcpStart:{[f.actor]:20},holeAllowances:{[f.actor]:Object.fromEntries(Array.from({length:18},(_,i)=>[i+1,1]))} });
        const allowedId = f.initial.id.replace(/-1$/, "-" + config.first);
        const allowed = f.request([{ hole: config.first, documentId: allowedId,
            baseDocumentGeneration: config.first === 1 ? readDocumentState(await f.ref.get()).generation : "absent" }]);
        assert.equal((await f.run(f.auth, allowed)).results[0].status, "acknowledged");
        const deniedId = f.initial.id.replace(/-1$/, "-" + config.denied);
        const denied = f.request([{ hole: config.denied, documentId: deniedId, baseDocumentGeneration: "absent" }]);
        assert.equal((await f.run(f.auth, denied)).results[0].status, "rejected");
    }
});

test("unknown, missing or inconsistent round configurations are rejected", async function()
{
    for (const config of [{}, { rundenTyp: "unknown", bahnAnzahl: 9 }, { rundenTyp: "9-Other", bahnAnzahl: 9 },
        { rundenTyp: "9", bahnAnzahl: 18 }, { rundenTyp: "18", bahnAnzahl: 9 },
        { rundenTyp: "9-Back", bahnAnzahl: "9" }, { rundenTyp: 18, bahnAnzahl: 18 }])
    {
        const f = await fixture();
        await db.collection("spieltage").doc(f.round).set(Object.assign({ status: "Aktiv" }, config));
        const reply = await f.run(f.auth, f.request([{}]));
        assert.equal(reply.results[0].status, "rejected");
        assert.equal(reply.results[0].reason, "invalid-round-configuration");
        assert.deepEqual((await f.ref.get()).data(), f.initial);
    }
});

test("receipt after physical deletion/recreation is terminally rejected, never ACKed at revision zero", async function()
{
    const f = await fixture();
    const request = f.request([{}]);
    const first = await f.run(f.auth, request);
    assert.equal(first.results[0].appliedFieldRevision, 1);
    await f.ref.delete();
    const deleted = await f.run(f.auth, request);
    assert.equal(deleted.results[0].status, "rejected");
    assert.equal(deleted.results[0].reason, "document-deleted");
    assert.equal(deleted.results[0].currentServerRevision, null);
    assert.equal((await f.ref.get()).exists, false);
    await f.ref.set(f.initial);
    const recreated = await f.run(f.auth, request);
    assert.equal(recreated.results[0].status, "rejected");
    assert.equal(recreated.results[0].reason, "document-generation-mismatch");
    assert.deepEqual((await f.ref.get()).data(), f.initial);
});

test("new V2 generation survives field deletion; fresh lifecycle has a fresh generation", async function()
{
    const f = await fixture();
    const id = f.initial.id.replace(/-1$/, "-2");
    const request = f.request([{ hole: 2, documentId: id, baseDocumentGeneration: "absent" }]);
    const created = await f.run(f.auth, request);
    const generation = created.results[0].currentDocumentGeneration;
    assert.ok(generation.startsWith("gen:"));
    assert.equal((await f.run(f.auth, request)).results[0].status, "acknowledged");
    const deletedField = await f.run(f.auth, f.request([{ hole: 2, documentId: id, baseDocumentGeneration: generation,
        baseFieldRevision: 1, operation: "delete", value: null }]));
    assert.equal(deletedField.results[0].currentDocumentGeneration, generation);
    await db.collection("scorecards").doc(id).delete();
    const fresh = await f.run(f.auth, f.request([{ hole: 2, documentId: id, baseDocumentGeneration: "absent" }]));
    assert.notEqual(fresh.results[0].currentDocumentGeneration, generation);
    assert.equal((await f.run(f.auth, request)).results[0].status, "rejected");
});

test("restoring a scorecard including copied old _sync cannot reuse the old generation", async function()
{
    const f = await fixture();
    const request = f.request([{}]);
    await f.run(f.auth, request);
    const backup = (await f.ref.get()).data();
    await f.ref.delete();
    await f.ref.set(backup);
    const replay = await f.run(f.auth, request);
    assert.equal(replay.results[0].status, "rejected");
    assert.equal(replay.results[0].reason, "document-generation-mismatch");
    assert.deepEqual((await f.ref.get()).data(), backup);
});

test("copied V2 generation is rejected by its private birth binding", async function()
{
    const f = await fixture();
    const id = f.initial.id.replace(/-1$/, "-2");
    const request = f.request([{ hole: 2, documentId: id, baseDocumentGeneration: "absent" }]);
    await f.run(f.auth, request);
    const ref = db.collection("scorecards").doc(id);
    const backup = (await ref.get()).data();
    await ref.delete();
    await ref.set(backup);
    const replay = await f.run(f.auth, request);
    assert.equal(replay.results[0].status, "rejected");
    assert.equal(replay.results[0].reason, "document-generation-mismatch");
    assert.deepEqual((await ref.get()).data(), backup);
});
