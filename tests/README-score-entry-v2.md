# Phase B/C: own-flight read and local-only score entry

Explicit server API: readOwnFlightScoresV2({ownerUid, playerId, spieltagId}).
Flight selectors and modes are rejected, including for privileged actors.
The read-only transaction resolves exactly one own flight and reads every
member/allowed-hole combination. It validates active round, players, course
holes, score identity, values, metadata and generation birth bindings.
Response fields: ownerUid, playerId, spieltagId, flightId, flightSeq, members,
players (only id/name/nickname/hcpLIE/avatarUrl/photoURL), round (kursId/rundenTyp/bahnAnzahl/status/
hcpStart/holes/holeData), cards. Each card contains documentId, spielerId, hole,
exists, values, fieldRevisions, generation, metadata. Metadata whitelist:
hcpStart, strokesGiven, flightSeq. No PIN/email or unlisted document data.

Client factory: app.createScoreEntryV2Controller({store, getIdentity, getState,
readTransport}). getIdentity returns ownerUid/playerId/mustChangePin; getState
returns currentUser/flights. Production callers can inject the lazy
app.scoreSyncV2ReadCallableTransport. Construction/module loading is inert.
open({spieltagId, offline}), refresh(), invalidate(), readEntry(spielerId,hole),
readAll(), project(raw,holeData), action(spielerId,hole,name,delta) are explicit.
Actions serialize, read the latest V2 projection, append one transaction and
read the committed projection. No sync/retry/write transport is connected. Call invalidate on session/context
transitions. Each awaited read is checked against the captured identity/epoch.
The whole response and known cache generations are checked before cache writes.
Cache updates are individually transactional: an I/O error/concurrent lifecycle
change can leave some valid old-partition cache updates, but no active result
is published. Refresh is not an atomic whole-flight snapshot in IndexedDB.
No replaceServerGeneration call, no pending rewrite, no request creation.

Offline context uses the separate IndexedDB lie_score_entry_context_v2 version 1,
store contexts keyed by ownerUid/playerId/spieltagId and carrying actual flightId,
schemaVersion, validatedAt and the authoritative response. No change to V2 queue
database/version and no V1 migration. Only successful authoritative reads save
context. Offline opens validate the matching user's record; score cache is not
reseeded from its historical cards. Unknown editing bases remain null.

Authoritative context includes course name, whitelisted player names/avatar URLs,
all course calculationHoles and course handicaps. calculateScoreEntryAllowanceV2
uses those inputs with the unchanged legacy distribution (including generic
nine-hole handling) and has equivalence tests. hcpStart initialization still
requires a round-start basis before enabling any future writes.

The view loads all V2 projections once, updates committed target entries, and
never imports liveScores/pendingScoreKeys or V1 localStorage. Par/2 are display
defaults only. Strich AUS persists delete strokes/delete puts/set maxscore=false.
The real router marks a departed screen for reload on return and does not start
legacy score polling. The existing bridge polling branch cannot repaint V2.
An accepted append can finish after a view switch in its original partition;
stale results cannot repaint another hole/view/user.

Offline bootstrap is narrowly in App_Start.js before initial network data load:
an existing Firebase UID may open only its previously authoritative context.
This authorizes local-only work, not a network send. Without a validated context
the entry is unavailable. No auth/queue data is read from a V1 buffer.
The new scripts are precached. Browser tests use injected identity/read responses;
real Firebase offline token/session and service-worker delivery remain device/
production validation gates. Existing external SDK assets must be available.

No optimistic score values are shown: the view publishes committed results.
A failed append shows the existing error toast and keeps durable values.
Rapid inputs queue without disabling or shrinking controls. No scheduler added.

Tests:
node --test functions/test/score-read-v2.test.js functions/test/score-operations-v2.test.js
node tests/run-score-sync-browser.cjs

Phase C tests:
node --test tests/score-screen.test.cjs
node tests/run-score-screen-browser.cjs

The screen browser runner uses real IndexedDB and the actual App_Router, performs
a complete page navigation/reload with offline context at 320/390/1024, checks
Strich/Lady persistence, append races and zero V1/V2 transport calls.
New read server tests use the injected memory DB. Browser controller tests use
real IndexedDB and injected authoritative read responses. Existing integrated
write tests remain unchanged. Real Firestore query/transaction semantics,
Callable/auth and Rules still require emulator/deployment gates. No deployment
has been performed. The score screen is wired to local V2 only. Network score sends remain disabled.
