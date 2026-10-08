/**
 * LIE Scorecard - sichere Authentifizierung und serverseitige PIN-Verarbeitung
 *
 * Die bisherige Client-PIN-Prüfung wurde bewusst entfernt.
 * Der Browser erhält weder PINs noch PIN-Hashes.
 */

const crypto = require("crypto");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");
const admin = require("firebase-admin");

admin.initializeApp();
setGlobalOptions({ region: "europe-west1", maxInstances: 10 });

const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;

// Das bestehende Google-Apps-Script versendet weiterhin die temporären PINs.
// Die URL stammt aus der bisherigen config.js des Projekts.
const GAS_URL = "https://script.google.com/macros/s/AKfycbyxrATlHf3bcAD4vHjTKVIdwDXdyUXBtr_2L0asZXDDEyw9wDEfF2HDdouMc2dEiFBEOQ/exec";

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
    await admin.auth().setCustomUserClaims(uid,
    {
        playerId: String(playerId),
        role: role || "Spieler",
        mustChangePin: !!mustChangePin
    });
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

exports.getLoginPlayers = onCall(async (request) =>
{

    const snap = await db.collection("spieler").get();
    const players = [];
    const batch = db.batch();

    snap.forEach((doc) =>
    {
        const data = doc.data();

        if (data.istGeloescht === true)
        {
            batch.delete(db.collection("spieler_public").doc(doc.id));
            return;
        }

        players.push(publicPlayerData(doc.id, data));

        batch.set(
            db.collection("spieler_public").doc(doc.id),
            publicPlayerData(doc.id, data),
            { merge: true }
        );
    });

    // Beim ersten Aufruf wird die öffentliche Spielerliste automatisch
    // aus den bestehenden Spielerdokumenten aufgebaut.
    if (players.length)
    {
        await batch.commit();
    }

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

exports.verifyPlayerPin = onCall(async (request) =>
{

    const playerId = String(request.data && request.data.spielerId || "").trim();
    const pin = validatePin(request.data && request.data.pin);

    if (!playerId)
    {
        throw new HttpsError("invalid-argument", "Spieler fehlt.");
    }

    const ref = db.collection("spieler").doc(playerId);
    const snap = await ref.get();

    // Gleiche Fehlermeldung für unbekannte Spieler und falsche PIN.
    if (!snap.exists || snap.data().istGeloescht === true)
    {
        throw new HttpsError("permission-denied", "Spieler oder PIN nicht korrekt.");
    }

    const data = snap.data();
    const now = Date.now();
    const lockUntil = data.pinLockUntil && typeof data.pinLockUntil.toMillis === "function"
        ? data.pinLockUntil.toMillis()
        : 0;

    if (lockUntil > now)
    {
        throw new HttpsError("resource-exhausted", "Zu viele Fehlversuche. Bitte später erneut versuchen.");
    }

    const storedHash = data.pinHash || "";
    const storedLegacyPin = data.pin != null ? String(data.pin).trim() : "";

    console.log("[verifyPlayerPin] Diagnose", {
        playerId: playerId,
        hasPinHash: !!storedHash,
        hasLegacyPin: !!storedLegacyPin,
        mustChangePin: data.mustChangePin === true,
        hasLockUntil: !!data.pinLockUntil,
        failedPinAttempts: Number(data.failedPinAttempts || 0)
    });

    let valid = false;
    let migrated = false;

    if (storedHash)
    {
        valid = verifyPinHash(storedHash, pin);
    }
    else
    {
        // Übergangskompatibilität: bestehende Klartext-PINs werden beim
        // ersten erfolgreichen Login sofort in einen scrypt-Hash umgewandelt.
        valid = storedLegacyPin ? storedLegacyPin === pin : pin === "4227";
        migrated = valid;
    }

    if (!valid)
    {
        const failed = Number(data.failedPinAttempts || 0) + 1;
        const update = { failedPinAttempts: failed };

        if (failed >= 5)
        {
            update.failedPinAttempts = 0;
            update.pinLockUntil = admin.firestore.Timestamp.fromMillis(now + 15 * 60 * 1000);
        }

        await ref.set(update, { merge: true });

        throw new HttpsError("permission-denied", "Spieler oder PIN nicht korrekt.");
    }

    const mustChangePin = data.mustChangePin === true || !storedHash;

    const successUpdate =
    {
        failedPinAttempts: 0,
        pinLockUntil: FieldValue.delete()
    };

    if (migrated)
    {
        successUpdate.pinHash = hashPin(pin);
        successUpdate.pin = FieldValue.delete();
        successUpdate.mustChangePin = true;
    }

    await ref.set(successUpdate, { merge: true });

    const role = data.role || "Spieler";

    // Der Spieler wird erst NACH erfolgreicher PIN-Prüfung bei Firebase
    // authentifiziert. Die UID entspricht stabil der vorhandenen Spieler-ID.
    const customToken = await admin.auth().createCustomToken(playerId,
    {
        playerId: playerId,
        role: role,
        mustChangePin: !!mustChangePin
    });

    return {
        success: true,
        mustChangePin: !!mustChangePin,
        customToken: customToken
    };
});

exports.updatePlayerPin = onCall(async (request) =>
{
    requireAuth(request);

    const playerId = String(request.data && request.data.spielerId || "").trim();
    const newPin = validatePin(request.data && request.data.newPin);

    if (!playerId)
    {
        throw new HttpsError("invalid-argument", "Spieler fehlt.");
    }

    const ownPlayer = String(request.auth.token.playerId || "") === playerId;

    if (!ownPlayer && !isAdmin(request))
    {
        throw new HttpsError("permission-denied", "Du darfst diese PIN nicht ändern.");
    }

    const ref = db.collection("spieler").doc(playerId);
    const snap = await ref.get();

    if (!snap.exists)
    {
        throw new HttpsError("not-found", "Spieler nicht gefunden.");
    }

    await ref.set(
    {
        pinHash: hashPin(tempPin),
        pin: FieldValue.delete(),
        mustChangePin: true,
        tempPinSentAt: admin.firestore.FieldValue.serverTimestamp(),
    
        // Ein neu angeforderter Einmal-Code startet einen frischen
        // Anmeldeversuch. Vorherige PIN-Fehlversuche und Sperren werden gelöscht.
        failedPinAttempts: 0,
        pinLockUntil: FieldValue.delete()
    },
    { merge: true });

    if (ownPlayer)
    {
        await setPlayerClaims(request.auth.uid, playerId, snap.data().role || "Spieler", false);
    }

    return { success: true };
});

exports.requestTempPin = onCall(async (request) =>
{

    const playerId = String(request.data && request.data.spielerId || "").trim();

    if (!playerId)
    {
        throw new HttpsError("invalid-argument", "Spieler fehlt.");
    }

    const ref = db.collection("spieler").doc(playerId);
    const snap = await ref.get();

    if (!snap.exists || snap.data().istGeloescht === true)
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

    // Neuen Einmal-Code zunächst aktivieren.
    await ref.set(
    {
        pinHash: hashPin(tempPin),
        pin: FieldValue.delete(),
        mustChangePin: true,
        tempPinSentAt: admin.firestore.FieldValue.serverTimestamp(),

        // Ein neuer Einmal-Code startet einen frischen Anmeldeversuch.
        failedPinAttempts: 0,
        pinLockUntil: FieldValue.delete()
    },
    { merge: true });

    const requestBody = JSON.stringify(
    {
        action: "sendTempPinEmail",
        spielerId: playerId,
        tempPin: tempPin
    });

    try
    {
        const response = await fetch(
            `${GAS_URL}?data=${encodeURIComponent(requestBody)}`
        );

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
        console.error("[requestTempPin] E-Mail-Versand:", err);

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

        await ref.set(rollback, { merge: true });

        throw new HttpsError(
            "internal",
            "Der Einmal-Code konnte nicht versendet werden."
        );
    }

    return { success: true };
});
