"use strict";

const { createHash } = require("node:crypto");
const { readDocumentState, allowedHoles } = require("./score-operations-v2");
const FIELDS = ["strokes", "puts", "lady", "maxscore"];

function identifier(value)
{
    return typeof value === "string" && value.length > 0 && value.length <= 200
        && value.trim() === value && !/[\x00-\x1f/]/.test(value) && value !== "." && value !== "..";
}

function requireValid(condition, code)
{
    if (!condition)
    {
        const error = new Error(code);
        error.code = code;
        throw error;
    }
}

function pick(data, keys)
{
    return Object.fromEntries(keys.filter(function(key)
    {
        return Object.hasOwn(data, key);
    }).map(function(key)
    {
        return [key, data[key]];
    }));
}

// Read-only transaction: authentication, membership and cards share one server snapshot.
function createScoreReadV2(db)
{
    return async function readOwnFlightScoresV2(auth, input)
    {
        const request = structuredClone(input || {});
        requireValid(auth && identifier(auth.uid) && auth.token
            && identifier(auth.token.playerId) && auth.uid === auth.token.playerId
            && auth.token.mustChangePin !== true, "invalid-read-identity");
        requireValid(request.ownerUid === auth.uid && request.playerId === auth.token.playerId
            && identifier(request.spieltagId) && !Object.hasOwn(request, "flightId")
            && !Object.hasOwn(request, "flightSeq") && !Object.hasOwn(request, "mode"), "invalid-read-context");
        return db.runTransaction(async function(tx)
        {
            const actor = await tx.get(db.collection("spieler").doc(auth.token.playerId));
            requireValid(actor.exists && actor.data().istGeloescht !== true
                && actor.data().mustChangePin !== true && !actor.data().pinChangePending
                && ["Spieler", "Spielleiter", "Admin"].includes(actor.data().role || "Spieler"), "invalid-actor");
            const roundSnap = await tx.get(db.collection("spieltage").doc(request.spieltagId));
            requireValid(roundSnap.exists, "invalid-round");
            const round = roundSnap.data();
            const range = allowedHoles(round);
            requireValid(round.istGeloescht !== true && round.status === "Aktiv" && range
                && identifier(round.kursId), "invalid-round");
            const flights = await tx.get(db.collection("flights").where("spieltagId", "==", request.spieltagId));
            const own = flights.docs.filter(function(doc)
            {
                return String(doc.data().spielerIdsCsv || "").split(",").map(function(id)
                {
                    return id.trim();
                }).includes(auth.token.playerId);
            });
            requireValid(own.length === 1, own.length ? "ambiguous-own-flight" : "missing-own-flight");
            const flight = own[0];
            const flightData = flight.data();
            requireValid(identifier(flight.id) && flightData.spieltagId === request.spieltagId, "invalid-flight");
            const members = String(flightData.spielerIdsCsv || "").split(",").map(function(id)
            {
                return id.trim();
            });
            requireValid(members.length > 0 && members.every(identifier)
                && new Set(members).size === members.length, "invalid-flight-members");
            const flightSeq = parseInt(flightData.seq || flightData.flightSeq || flight.id.split("-").pop());
            requireValid(Number.isSafeInteger(flightSeq) && flightSeq > 0, "invalid-flight-sequence");
            const players = [];
            for (const id of members)
            {
                const player = await tx.get(db.collection("spieler").doc(id));
                requireValid(player.exists && player.data().istGeloescht !== true, "invalid-flight-member");
                players.push(Object.assign({ id: id }, pick(player.data(), ["name", "nickname", "hcpLIE", "avatarUrl", "photoURL"])));
            }
            const holes = Array.from({ length: range.last - range.first + 1 }, function(_, index)
            {
                return range.first + index;
            });
            const courseHoles = await tx.get(db.collection("bahnen").where("kursId", "==", round.kursId));
            const holeData = holes.map(function(nr)
            {
                const matches = courseHoles.docs.filter(function(doc)
                {
                    return Number(doc.data().nr) === nr;
                });
                requireValid(matches.length === 1 && Number.isSafeInteger(matches[0].data().par)
                    && matches[0].data().par > 0 && Number.isSafeInteger(matches[0].data().si)
                    && matches[0].data().si > 0, "invalid-hole");
                return pick(matches[0].data(), ["nr", "par", "si"]);
            });
            const handicapRows = await tx.get(db.collection("handicaps").where("kursId", "==", round.kursId));
            const handicaps = handicapRows.docs.map(function(doc)
            {
                return pick(doc.data(), ["kursId", "vorgabe", "spielvorgabe"]);
            });
            const course = await tx.get(db.collection("kurse").doc(round.kursId));
            const cards = [];
            for (const spielerId of members)
            {
                for (const hole of holes)
                {
                    const documentId = "SC-" + request.spieltagId + "-" + spielerId + "-" + hole;
                    const snap = await tx.get(db.collection("scorecards").doc(documentId));
                    const data = snap.exists ? snap.data() : {};
                    requireValid(!snap.exists || (data.spieltagId === request.spieltagId
                        && data.spielerId === spielerId && data.hole === hole
                        && (data.id === undefined || data.id === documentId)), "scorecard-context-mismatch");
                    const state = readDocumentState(snap);
                    if (state.generation.startsWith("gen:"))
                    {
                        const key = createHash("sha256").update(JSON.stringify([documentId, state.generation])).digest("hex");
                        const binding = await tx.get(db.collection("scoreSyncV2Generations").doc(key));
                        requireValid(binding.exists && binding.data().documentId === documentId
                            && binding.data().generation === state.generation
                            && binding.createTime.seconds === snap.createTime.seconds
                            && binding.createTime.nanoseconds === snap.createTime.nanoseconds, "document-generation-mismatch");
                    }
                    const values = pick(data, FIELDS);
                    requireValid(Object.entries(values).every(function(entry)
                    {
                        return entry[0] === "strokes" || entry[0] === "puts"
                            ? Number.isSafeInteger(entry[1]) && entry[1] >= (entry[0] === "strokes" ? 1 : 0)
                            : typeof entry[1] === "boolean";
                    }), "invalid-score-value");
                    cards.push({ documentId: documentId, spielerId: spielerId, hole: hole, exists: snap.exists,
                        values: values, fieldRevisions: state.revisions, generation: state.generation,
                        metadata: pick(data, ["hcpStart", "strokesGiven", "flightSeq"]) });
                }
            }
            return { ownerUid: auth.uid, playerId: auth.token.playerId, actorRole: actor.data().role || "Spieler", spieltagId: request.spieltagId,
                flightId: flight.id, flightSeq: flightSeq, members: members, players: players,
                round: Object.assign(pick(round, ["kursId", "rundenTyp", "bahnAnzahl", "status", "hcpStart", "holeAllowances"]), { holes: holes, holeData: holeData }),
                cards: cards, handicaps: handicaps,
                calculationHoles: courseHoles.docs.map(function(doc)
                {
                    return pick(doc.data(), ["nr", "par", "si"]);
                }), course: course.exists ? pick(course.data(), ["name"]) : null };
        });
    };
}

module.exports = { createScoreReadV2 };
