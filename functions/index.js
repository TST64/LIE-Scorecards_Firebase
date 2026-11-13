/**
 * LIE Scorecard - sichere Authentifizierung und serverseitige PIN-Verarbeitung
 *
 * Die bisherige Client-PIN-Prüfung wurde bewusst entfernt.
 * Der Browser erhält weder PINs noch PIN-Hashes.
 */

const runtime = require('./runtime').createRuntime();
const crypto = require("crypto");
const { onCall: firebaseOnCall, HttpsError } = require("firebase-functions/v2/https");
const localMaintenance = require('./local-maintenance');
const onCall = (name,handler) => firebaseOnCall(async request=>{
    try{return await runtime.request(name,db,request,()=>localMaintenance.withRequest(db,'callable',()=>handler(request)));}
    catch(error){if(error.code==='preprod-request-denied')throw new HttpsError('permission-denied','Testzugang oder Funktion nicht freigegeben.');throw error;}
});
const { setGlobalOptions } = require("firebase-functions/v2");
const admin = require("firebase-admin");

setGlobalOptions(runtime.options);
const db = runtime.database(admin);
const { FieldValue, Timestamp } = require("firebase-admin/firestore");

// Authoritative revisioned score endpoint. Direct/V1 score writes are disabled.
const { createScoreOperationsV2 } = require("./score-operations-v2");
const saveScoreOperationsV2 = createScoreOperationsV2(db, FieldValue);

exports.saveScoreOperationsV2 = onCall('saveScoreOperationsV2',async function(request)
{
    requireAuth(request);
    try
    {
        return await saveScoreOperationsV2(request.auth, request.data);
    }
    catch (error)
    {
        console.error("[saveScoreOperationsV2]", error);
        throw new HttpsError("internal", "Score-Request konnte nicht verarbeitet werden.");
    }
});

// Separate own-flight read. Loading/exporting does not execute a read.
const { createScoreReadV2 } = require("./score-read-v2");
const readOwnFlightScoresV2 = createScoreReadV2(db);
exports.readOwnFlightScoresV2 = onCall('readOwnFlightScoresV2',async function(request)
{
    requireAuth(request);
    try
    {
        return await readOwnFlightScoresV2(request.auth, request.data);
    }
    catch (error)
    {
        console.error("[readOwnFlightScoresV2]", error);
        throw new HttpsError("failed-precondition", "Eigener Flight konnte nicht sicher gelesen werden.");
    }
});

const initializeRoundStart = require('./round-start').createRoundStart(db,FieldValue);
const historyCorrection = require('./history-correction').createHistoryCorrection(db);
exports.historyCorrectionV1 = onCall('historyCorrectionV1',async request=>{
    requireAuth(request);
    try{return await historyCorrection(request.auth,request.data);}
    catch(error){const codes=['admin-required','stale-score-cas','stale-preview','competing-correction','active-following-round-blocks-correction','legacy-closure-blocked','historical-chain-invalid','publication-bound-exceeded','source-changed-repair-required','run-not-ready','stage-integrity-failed','run-not-locked'];throw new HttpsError('failed-precondition','Historische Korrektur nicht veröffentlicht ('+(codes.includes(error.code)?error.code:'Prüfung fehlgeschlagen')+'). Laufstatus prüfen; bisheriger veröffentlichter Stand bleibt maßgeblich.');}
});
const readPublication = require('./published-season').createPublishedSeasonRead(db);
exports.readPublishedSeasonV1 = onCall('readPublishedSeasonV1',async request=>{
    requireAuth(request);
    try{return await readPublication(request.auth);}
    catch(_){throw new HttpsError('failed-precondition','Veröffentlichter Saisonstand nicht konsistent lesbar. Keine Erfolgsmeldung.');}
});
const roundClosure = require('./round-close').createRoundClosure(db);
exports.roundClosureV1 = onCall('roundClosureV1',async request=>{
    requireAuth(request);
    try { return await roundClosure(request.auth,request.data); }
    catch(error) { throw new HttpsError('failed-precondition','Rundenschluss nicht bestätigt ('+(['round-incomplete','stale-server-basis','flight-releases-missing','flight-review-required','competing-closure','closure-window-mismatch','invalid-actor','privileged-role-required'].includes(error.code)?error.code:'Prüfung fehlgeschlagen')+'). Serverstand erneut laden; lokale Änderungen erhalten.'); }
});
exports.createRoundStart = onCall('createRoundStart',async request=>
{
    requireAuth(request);
    try { return await initializeRoundStart(request.auth,request.data); }
    catch (_) { throw new HttpsError('failed-precondition','Rundenstart nicht freigegeben: Autorisierung, Saisonbasis, Vorgeschichte, Kurs oder Zuordnung prüfen. Keine bestehenden Daten wurden ersetzt.'); }
});

// External delivery is deliberately unavailable in Phase 2A.

function requireAuth(request)
{
    if (!request.auth || !request.auth.uid)
    {
        throw new HttpsError("unauthenticated", "Authentifizierung erforderlich.");
    }
}

function isAdmin(request)
{
    return !!(
        request.auth &&
        request.auth.token &&
        request.auth.token.role === "Admin"
    );
}

function validatePin(pin)
{
    const value = String(pin || "").trim();

    if (!/^\d{4,6}$/.test(value))
    {
        throw new HttpsError("invalid-argument", "Die PIN muss aus 4 bis 6 Ziffern bestehen.");
    }

    return value;
}

function hashPin(pin)
{
    const salt = crypto.randomBytes(16).toString("hex");
    const derivedKey = crypto.scryptSync(String(pin), salt, 32).toString("hex");
    return `scrypt$${salt}$${derivedKey}`;
}

function verifyPinHash(storedHash, pin)
{
    const parts = String(storedHash || "").split("$");

    if (parts.length !== 3 || parts[0] !== "scrypt")
    {
        return false;
    }

    const salt = parts[1];
    const expected = Buffer.from(parts[2], "hex");
    const actual = crypto.scryptSync(String(pin), salt, expected.length);

    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

async function setPlayerClaims(uid, playerId, role, mustChangePin)
{
    let user;
    try { user = await admin.auth().getUser(uid); }
    catch (error)
    {
        if (error.code !== "auth/user-not-found") throw error;
        user = await admin.auth().createUser({ uid });
    }
    if (user.disabled) throw new HttpsError("permission-denied", "Konto nicht verfügbar.");
    await admin.auth().setCustomUserClaims(uid, {
        ...user.customClaims, playerId: String(playerId), role: role || "Spieler", mustChangePin: !!mustChangePin
    });
}

function validatePlayerId(value)
{
    const id = typeof value === "string" ? value.trim() : "";
    if (!id || id.length > 128 || /[/\s]/.test(id)) throw new HttpsError("invalid-argument", "Ungültiger Spieler.");
    return id;
}

// Firestore and Auth cannot commit atomically. The durable pending marker and
// mustChangePin=true gate remain until persistent claims AND final DB CAS succeed.
async function completePinChange(ref, expected)
{
    await setPlayerClaims(ref.id, ref.id, expected.role, false);
    await db.runTransaction(async tx =>
    {
        const snap = await tx.get(ref), data = snap.exists && snap.data();
        if (!data || data.istGeloescht === true || data.pinHash !== expected.pinHash
            || (data.role || "Spieler") !== expected.role
            || (data.pinChangePending !== expected.pending && !(data.pinChangePending === undefined && data.mustChangePin === false)))
            throw new HttpsError("failed-precondition", "PIN-Änderung muss geprüft werden.");
        tx.set(ref, { mustChangePin: false, pinChangePending: FieldValue.delete(),
            pin: FieldValue.delete(), tempPinSentAt: FieldValue.delete(), failedPinAttempts: 0,
            pinLockUntil: FieldValue.delete() }, { merge: true });
    });
}
function pinRecoveryError(error)
{
    // Never log/return provider errors, request payloads or credential material.
    if (error instanceof HttpsError) return error;
    return new HttpsError("unavailable", "PIN-Status unklar. Mit derselben neuen PIN erneut versuchen oder neu anmelden.");
}

function publicPlayerData(id, data)
{
    return {
        id: String(id),
        nickname: data.nickname || "",
        name: data.name || "",
        teeColor: data.teeColor || "Gelb",
        hcpOfficial: data.hcpOfficial ?? 54,
        hcpLIE: data.hcpLIE ?? 54,
        role: data.role || "Spieler"
    };
}

exports.getPlayerSessionState = onCall('getPlayerSessionState',async request =>
{
    requireAuth(request);
    if (!request.auth.token || request.auth.token.playerId !== request.auth.uid)
        throw new HttpsError("permission-denied", "Ungültige Kontobindung.");
    try
    {
        const snap = await db.collection("spieler").doc(request.auth.uid).get();
        if (!snap.exists || snap.data().istGeloescht === true)
            throw new HttpsError("permission-denied", "Konto nicht verfügbar.");
        const data = snap.data();
        return { success: true, playerId: request.auth.uid, role: data.role || "Spieler",
            mustChangePin: request.auth.token.mustChangePin !== false || data.mustChangePin === true || !!data.pinChangePending };
    }
    catch (error) { throw pinRecoveryError(error); }
});

exports.getLoginPlayers = onCall('getLoginPlayers',async (request) =>
{

    const snap = await db.collection("spieler").get();
    const players = [];
    snap.forEach((doc) =>
    {
        const data = doc.data();

        if (data.istGeloescht === true)
        {
            return;
        }

        players.push(publicPlayerData(doc.id, data));

    });

    // Read only: login discovery must never overwrite a concurrently closed
    // round's public HCP with a pre-commit private snapshot.

    players.sort((a, b) =>
        String(a.nickname || a.name).localeCompare(
            String(b.nickname || b.name),
            "de",
            { sensitivity: "base" }
        )
    );

    return {
        success: true,
        spieler: players.map((p) =>
        ({
            id: p.id,
            nickname: p.nickname,
            name: p.name
        }))
    };
});

exports.verifyPlayerPin = onCall('verifyPlayerPin',async (request) =>
{
    try
    {
        const playerId = validatePlayerId(request.data && request.data.spielerId);
        const pin = validatePin(request.data && request.data.pin);
        const ref = db.collection("spieler").doc(playerId);
        const snap = await ref.get();
        if (!snap.exists || snap.data().istGeloescht === true)
            throw new HttpsError("permission-denied", "Spieler oder PIN nicht korrekt.");
        let data = snap.data();
        const now = Date.now();
        const lockUntil = data.pinLockUntil && typeof data.pinLockUntil.toMillis === "function" ? data.pinLockUntil.toMillis() : 0;
        if (lockUntil > now) throw new HttpsError("resource-exhausted", "Zu viele Fehlversuche. Bitte später erneut versuchen.");
        const storedHash = data.pinHash || "";
        const legacyPin = data.pin != null ? String(data.pin).trim() : "";
        const valid = storedHash ? verifyPinHash(storedHash, pin) : legacyPin ? legacyPin === pin : pin === "4227";
        if (!valid)
        {
            const failed = Number(data.failedPinAttempts || 0) + 1;
            await ref.set(failed >= 5 ? { failedPinAttempts: 0, pinLockUntil: Timestamp.fromMillis(now + 15 * 60 * 1000) }
                : { failedPinAttempts: failed }, { merge: true });
            throw new HttpsError("permission-denied", "Spieler oder PIN nicht korrekt.");
        }
        if (data.pinChangePending)
        {
            await completePinChange(ref, { pinHash: storedHash, pending: data.pinChangePending, role: data.role || "Spieler" });
            data = (await ref.get()).data();
        }
        const mustChangePin = data.mustChangePin === true || !storedHash;
        const successUpdate = { failedPinAttempts: 0, pinLockUntil: FieldValue.delete() };
        if (!storedHash) Object.assign(successUpdate, { pinHash: hashPin(pin), pin: FieldValue.delete(), mustChangePin: true });
        await db.runTransaction(async tx =>
        {
            const current = await tx.get(ref), latest = current.exists && current.data();
            if (!latest || latest.istGeloescht === true || latest.pinHash !== data.pinHash
                || latest.pinChangePending || (latest.role || "Spieler") !== (data.role || "Spieler")
                || latest.mustChangePin !== data.mustChangePin)
                throw new HttpsError("failed-precondition", "Anmeldestatus geändert. Bitte erneut anmelden.");
            tx.set(ref, successUpdate, { merge: true });
        });
        await setPlayerClaims(playerId, playerId, data.role || "Spieler", mustChangePin);
        // No additional claims: old custom-token claims would override future persistent claims.
        const customToken = await admin.auth().createCustomToken(playerId);
        return { success: true, mustChangePin, customToken };
    }
    catch (error) { throw pinRecoveryError(error); }
});

exports.updatePlayerPin = onCall('updatePlayerPin',async (request) =>
{
    requireAuth(request);
    const playerId = validatePlayerId(request.data && request.data.spielerId);
    const newPin = validatePin(request.data && request.data.newPin);
    const token = request.auth.token || {};
    if (String(token.playerId || "") !== request.auth.uid)
        throw new HttpsError("permission-denied", "Ungültige Kontobindung.");
    const ownPlayer = request.auth.uid === playerId;
    const ref = db.collection("spieler").doc(playerId);
    try
    {
        const authActor = await admin.auth().getUser(request.auth.uid);
        if (authActor.disabled) throw new HttpsError("permission-denied", "Konto nicht verfügbar.");
        const preparedHash = hashPin(newPin);
        const expected = await db.runTransaction(async tx =>
        {
            const actor = await tx.get(db.collection("spieler").doc(request.auth.uid));
            const target = await tx.get(ref);
            if (!actor.exists || actor.data().istGeloescht === true
                || (!ownPlayer && (!isAdmin(request) || actor.data().role !== "Admin"
                    || token.mustChangePin !== false || actor.data().mustChangePin === true || actor.data().pinChangePending)))
                throw new HttpsError("permission-denied", "Du darfst diese PIN nicht ändern.");
            if (!target.exists || target.data().istGeloescht === true)
                throw new HttpsError("not-found", "Spieler nicht verfügbar.");
            const data = target.data(), role = data.role || "Spieler";
            const samePin = data.pinHash && verifyPinHash(data.pinHash, newPin);
            if (data.pinChangePending)
            {
                if (!samePin) throw new HttpsError("failed-precondition", "Ausstehende Änderung mit derselben neuen PIN abschließen.");
                return { pinHash: data.pinHash, pending: data.pinChangePending, role };
            }
            if (samePin && data.mustChangePin === false) return { pinHash: data.pinHash, pending: undefined, role };
            const pending = crypto.randomUUID();
            tx.set(ref, { pinHash: preparedHash, pin: FieldValue.delete(), mustChangePin: true,
                pinChangePending: pending, failedPinAttempts: 0, pinLockUntil: FieldValue.delete() }, { merge: true });
            return { pinHash: preparedHash, pending, role };
        });
        await completePinChange(ref, expected);
        const customToken = ownPlayer ? await admin.auth().createCustomToken(playerId) : undefined;
        return { success: true, mustChangePin: false, ...(ownPlayer ? { customToken } : {}) };
    }
    catch (error) { throw pinRecoveryError(error); }
});

exports.requestTempPin = onCall('requestTempPin',async (request) =>
{

    const playerId = String(request.data && request.data.spielerId || "").trim();

    if (!playerId)
    {
        throw new HttpsError("invalid-argument", "Spieler fehlt.");
    }

    const ref = db.collection("spieler").doc(playerId);
    const snap = await ref.get();

    if (!snap.exists || snap.data().istGeloescht === true || snap.data().pinChangePending)
    {
        // Keine unnötige Information darüber, welche Namen existieren.
        return { success: true };
    }

    const data = snap.data();
    const email = String(data.email || "").trim();

    if (!email || !email.includes("@"))
    {
        return { success: true };
    }

    const lastSent = data.tempPinSentAt && typeof data.tempPinSentAt.toMillis === "function"
        ? data.tempPinSentAt.toMillis()
        : 0;

    // Einmal-Code höchstens alle 5 Minuten je Spieler.
    if (lastSent && Date.now() - lastSent < 5 * 60 * 1000)
    {
        return { success: true };
    }

    const tempPin = String(crypto.randomInt(100000, 1000000));

    // Bisherigen PIN-Zustand sichern, damit wir ihn bei einem
    // fehlgeschlagenen E-Mail-Versand wiederherstellen können.
    const previousPinState =
    {
        pinHash: data.pinHash,
        pin: data.pin,
        mustChangePin: data.mustChangePin,
        tempPinSentAt: data.tempPinSentAt
    };

    // Do not overwrite an S04 operation that started after the initial read.
    const temporaryHash = hashPin(tempPin);
    const activated = await db.runTransaction(async tx =>
    {
        const current = await tx.get(ref);
        if (!current.exists || current.data().istGeloescht === true || current.data().pinChangePending
            || current.data().pinHash !== data.pinHash) return false;
        tx.set(ref, {
            pinHash: temporaryHash,
            pin: FieldValue.delete(),
            mustChangePin: true,
            tempPinSentAt: FieldValue.serverTimestamp(),
            failedPinAttempts: 0,
            pinLockUntil: FieldValue.delete()
        }, { merge: true });
        return true;
    });
    if (!activated) return { success: true };


    try
    {
        const response = await runtime.disabledMail();

        const text = await response.text();

        if (!response.ok)
        {
            throw new Error(`GAS HTTP ${response.status}`);
        }

        let result = null;

        try
        {
            result = JSON.parse(text);
        }
        catch (parseError)
        {
            // Das bestehende GAS kann je nach Deployment/Redirect HTML
            // zurückliefern. Der HTTP-Status ist dann die technische Rückmeldung.
        }

        if (result && result.success === false)
        {
            throw new Error(result.error || "E-Mail-Versand fehlgeschlagen.");
        }
    }
    catch (err)
    {
        console.error("[requestTempPin] Zustellung fehlgeschlagen.");

        // E-Mail konnte nicht versendet werden:
        // vorherigen PIN-Zustand wiederherstellen.
        const rollback =
        {
            pinHash: previousPinState.pinHash !== undefined
                ? previousPinState.pinHash
                : FieldValue.delete(),

            pin: previousPinState.pin !== undefined
                ? previousPinState.pin
                : FieldValue.delete(),

            mustChangePin: previousPinState.mustChangePin !== undefined
                ? previousPinState.mustChangePin
                : FieldValue.delete(),

            tempPinSentAt: previousPinState.tempPinSentAt !== undefined
                ? previousPinState.tempPinSentAt
                : FieldValue.delete()
        };

        await db.runTransaction(async tx =>
        {
            const current = await tx.get(ref);
            if (current.exists && current.data().pinHash === temporaryHash && !current.data().pinChangePending)
                tx.set(ref, rollback, { merge: true });
        });

        throw new HttpsError(
            "internal",
            "Der Einmal-Code konnte nicht versendet werden."
        );
    }

    return { success: true };
});
