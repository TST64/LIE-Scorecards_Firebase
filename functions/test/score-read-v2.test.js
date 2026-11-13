"use strict";
const {metadata}=require("./hcp-fixture");
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createScoreReadV2 } = require("../score-read-v2");
const { createScoreOperationsV2 } = require("../score-operations-v2");
const { memoryDatabase, fieldValue } = require("./memory-score-database");

async function fixture()
{
    const db = memoryDatabase();
    await db.collection("spieler").doc("A").set({ role: "Spieler", nickname: "Anna", email: "private" });
    await db.collection("spieler").doc("B").set({ role: "Spieler" });
    await db.collection("spieltage").doc("ST").set({ status: "Aktiv", rundenTyp: "9-Back", bahnAnzahl: 9, kursId: "K", ...metadata({rundenTyp:"9-Back",bahnAnzahl:9},{A:26,B:26}) });
    await db.collection("flights").doc("F-1").set({ spieltagId: "ST", spielerIdsCsv: "B,A" });
    for (let hole = 10; hole <= 18; hole++)
    {
        await db.collection("bahnen").doc(String(hole)).set({ kursId: "K", nr: hole, par: 4, si: hole });
    }
    const auth = { uid: "A", token: { playerId: "A" } };
    const input = { ownerUid: "A", playerId: "A", spieltagId: "ST" };
    const run = createScoreReadV2(db);
    return { db, auth, input, run };
}

test("full ordered own flight, back-nine absent cards, no defaults or private profile data", async function()
{
    const f = await fixture();
    const reply = await f.run(f.auth, f.input);
    assert.deepEqual(reply.members, ["B", "A"]);
    assert.equal(reply.cards.length, 18);
    assert.deepEqual(reply.round.holes, [10,11,12,13,14,15,16,17,18]);
    assert.ok(reply.cards.every(function(card)
    {
        return !card.exists && card.generation === "absent" && Object.keys(card.values).length === 0
            && Object.values(card.fieldRevisions).every(function(value) { return value === 0; });
    }));
    assert.ok(!JSON.stringify(reply).includes("private"));
});

for (const scenario of ["unauthenticated", "uid", "pin-token", "pin-record", "inactive", "round", "type", "missing", "ambiguous", "member", "duplicate", "hole", "foreign-round", "identity", "metadata"])
{
    test("reject read " + scenario, async function()
    {
        const f = await fixture();
        if (scenario === "unauthenticated")
        {
            f.auth = null;
        }
        if (scenario === "uid")
        {
            f.auth.uid = "B";
        }
        if (scenario === "pin-token")
        {
            f.auth.token.mustChangePin = true;
        }
        if (scenario === "pin-record")
        {
            await f.db.collection("spieler").doc("A").set({ mustChangePin: true });
        }
        if (scenario === "inactive")
        {
            await f.db.collection("spieler").doc("A").set({ istGeloescht: true });
        }
        if (scenario === "round")
        {
            f.input.spieltagId = "UNKNOWN";
        }
        if (scenario === "type")
        {
            await f.db.collection("spieltage").doc("ST").set({ rundenTyp: "bad" }, { merge: true });
        }
        if (scenario === "missing")
        {
            await f.db.collection("flights").doc("F-1").delete();
        }
        if (scenario === "ambiguous")
        {
            await f.db.collection("flights").doc("F-2").set({ spieltagId: "ST", spielerIdsCsv: "A" });
        }
        if (scenario === "member")
        {
            await f.db.collection("spieler").doc("B").delete();
        }
        if (scenario === "duplicate")
        {
            await f.db.collection("flights").doc("F-1").set({ spieltagId: "ST", spielerIdsCsv: "A,A" });
        }
        if (scenario === "hole")
        {
            const snap=(await f.db.collection("spieltage").doc("ST").get()).data();
            await f.db.collection("spieltage").doc("ST").set({hcpHoleData:snap.hcpHoleData.slice(1)},{merge:true});
        }
        if (scenario === "foreign-round")
        {
            await f.db.collection("flights").doc("F-1").set({ spieltagId: "OTHER", spielerIdsCsv: "A" });
        }
        if (scenario === "identity")
        {
            await f.db.collection("scorecards").doc("SC-ST-A-10").set({ spieltagId: "OTHER", spielerId: "A", hole: 10 });
        }
        if (scenario === "metadata")
        {
            await f.db.collection("scorecards").doc("SC-ST-A-10").set({ spieltagId: "ST", spielerId: "A", hole: 10, _sync: {} });
        }
        await assert.rejects(f.run(f.auth, f.input));
    });
}

for (const role of ["Admin", "Spielleiter"])
{
    test(role + " cannot select foreign flight", async function()
    {
        const f = await fixture();
        await f.db.collection("spieler").doc("A").set({ role });
        await f.db.collection("flights").doc("F-2").set({ spieltagId: "ST", spielerIdsCsv: "B" });
        assert.equal((await f.run(f.auth, f.input)).flightId, "F-1");
        await assert.rejects(f.run(f.auth, Object.assign({}, f.input, { flightId: "F-2" })));
    });
}

test("legacy generation and separated metadata, no writes", async function()
{
    const f = await fixture();
    const ref = f.db.collection("scorecards").doc("SC-ST-A-10");
    const data = { spieltagId: "ST", spielerId: "A", hole: 10, strokes: 5, hcpStart: 18, strokesGiven: 1 };
    await ref.set(data);
    const reply = await f.run(f.auth, f.input);
    const card = reply.cards.find(function(item) { return item.documentId === "SC-ST-A-10"; });
    assert.match(card.generation, /^legacy:/);
    assert.deepEqual(card.values, { strokes: 5 });
    assert.deepEqual(card.metadata, { hcpStart: 18, strokesGiven: 1 });
    assert.deepEqual((await ref.get()).data(), data);
});

test("real V2 creation binding accepted; copied generation rejected after recreation", async function()
{
    const f = await fixture();
    const op = { ownerUid: "A", playerId: "A", spieltagId: "ST", flightId: "F-1",
        spielerId: "A", hole: 10, documentId: "SC-ST-A-10", field: "strokes", operation: "set", value: 5,
        changeId: "CHANGE", baseFieldRevision: 0, baseDocumentGeneration: "absent" };
    await createScoreOperationsV2(f.db, fieldValue)(f.auth, { ownerUid: "A", playerId: "A", spieltagId: "ST",
        flightId: "F-1", mode: "ownFlight", requestId: "REQUEST", operations: [op] });
    const card = (await f.run(f.auth, f.input)).cards.find(function(item) { return item.documentId === op.documentId; });
    assert.match(card.generation, /^gen:/);
    assert.equal(card.fieldRevisions.strokes, 1);
    const ref = f.db.collection("scorecards").doc(op.documentId);
    const copy = (await ref.get()).data();
    await ref.delete();
    await ref.set(copy);
    await assert.rejects(f.run(f.auth, f.input), /generation/);
});
