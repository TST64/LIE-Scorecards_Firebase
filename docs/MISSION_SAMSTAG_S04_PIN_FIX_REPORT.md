# Mission Samstag – S04: PIN-Wechsel und Auth-Pflichtwechsel

Prüfungen: 08.11.2026; Dokumentationsabschluss: 09.11.2026. [Issue #14](https://github.com/TST64/LIE-Scorecards_Firebase/issues/14).
Basis: [Draft-PR #13](https://github.com/TST64/LIE-Scorecards_Firebase/pull/13),
`codex/s01-v1-snapshot-safety`, `f862cf0c8f73ef610cdc711218e2a1dd84b8a839`.
Neuer isolierter Worktree `.codex-s04-worktree`, Branch `codex/s04-pin-auth-safety`.

**Release bleibt NO-GO.** S04 ist lokal repariert und geprüft. S02/S03, S05–S08,
die vollständige Zwölf-Spieler-Matrix und Betriebs-/Releasegates bleiben eigenständige Aufgaben.

## Bestätigter Ausgangsbefund und rote Tests

Der vorhandene `updatePlayerPin`-Callable verwendet eine nicht definierte Variable statt
des validierten Eingabeparameters und setzt gleichzeitig den DB-Pflichtwechselstatus erneut
auf true. Nachfolgend sollen jedoch Claims auf false gesetzt werden. Der Client behandelt
abgewiesene Requests/Refreshfehler nicht zuverlässig und vertraut dem Erfolgsboolean.

Lesender Vergleich mit lokalem `main`: Der fehlerhafte PIN-Wechsel-Body ist auch dort
vorhanden. Der lokale S01-Stack verwendet dieselbe Fachlogik, ergänzt um Demo-only-Bootstrap,
Netzwerk-/Credential-Guards und einen FieldValue-Import. **Nicht geprüft ist, welcher Commit
tatsächlich in einer produktiven Function läuft.** Dafür wurde keine Cloud angesprochen.

Zuerst wurden ausschließlich Regressionen committed:
`476fe23` (`test: reproduce PIN change claims and client recovery failures`).
Der erste Lauf auf unverändertem S01-Code ergibt 28 Tests, 19 rot, 9 grün. Die damals
allgemeinen Ablehnungsprüfungen waren allein kein Autorisierungsnachweis; sie prüfen im
Endstand zusätzlich die konkreten Fehlercodes. Der VM-Adapter wurde um die tatsächlich
verwendeten Node-Buffer- und Firestore-Document-ID-Eigenschaften ergänzt.

Eine separat wiederholbare, credentialfreie Reproduktion mit dem aktuellen Testadapter
lädt ausschließlich den alten Callable-Quelltext über lesendes `git show`:

```powershell
$env:PIN_S04_BASELINE='1'
node --test --test-name-pattern='^AU01' functions/test/pin-s04.test.js
# tests 1 / pass 0 / fail 1
# tempPin is not defined
Remove-Item Env:PIN_S04_BASELINE
```

Der Baseline-Schalter gilt nur für den VM-Test. Er verändert weder Anwendungscode noch
Branches, Worktrees oder Firebase-Verbindungen.

## Reparatur und Berechtigungen

| Datei | Änderung im S04-Scope |
| --- | --- |
| `functions/index.js` | validierter Eingabeparameter, transaktional vorbereiteter PIN-Wechsel, dauerhafter Zwischenstatus, Claims-Synchronisierung, bedingter Abschluss, Retry/Login-Recovery, berechtigter Admin-Zielwechsel, sanitierte Fehler |
| `functions/index.js` | persistente Claims vor Tokenausgabe; Session-Token ohne überlagernde Zusatzclaims; neuer eigener, nicht sensibler Status-Callable; CAS-Schutz des vorhandenen Einmal-PIN-Pfads vor Überschreiben/Rollback neuerer Änderungen |
| `App_Logic_Spieler.js` | awaitbare, gegen Doppelklick gesperrte PIN-Aktion; tatsächliche Neuanmeldung/Tokenprüfung und DB-Statusprüfung vor Erfolg; sicherer Fehlerpfad, freigegebener Button, Owner-Prüfung; Login prüft denselben Status |
| `App_Start.js` | Online-Session-Restore prüft Claims und DB-Status; bei Pflichtwechsel nur minimale Spielerliste, anschließend PIN-Ansicht statt Dashboard |
| `firestore.rules` | UID-/Player-ID-Bindung, DB-/Token-Pflichtwechsel und Pending-Sperre für geschützte Zugriffe; privilegierte Rolle zusätzlich gegen aktuellen DB-Stand geprüft |
| `functions/test/pin-s04.test.js` | tatsächlicher Callable-Quelltext mit synthetischem Memory-Firestore/Auth; Hashing bleibt echtes Node-scrypt; Fehler-/Recovery- und Berechtigungstests |
| `tests/pin-s04-client.test.cjs` | tatsächliche Client-Handler, Refresh-/Login-/Transport-/Statusfehler, Doppelklick und Ownerwechsel |
| `tests/pin-s04-emulator.cjs`, `tests/local-integration.cjs` | reale lokale Emulator-/Browserprüfung einschließlich unabhängiger DB-/Auth-Prüfung |

Der Hashstandard und die bestehende serverseitige PIN-Policy bleiben erhalten: zufälliger
Salt, scrypt, zeitkonstanter Hashvergleich und dieselbe Ziffern-/Längenregel. Weder PINs noch
Hashes werden an den neuen Status-Callable oder dessen Antwort übergeben. Dieser liefert
nur Erfolg, eigene Player-ID, aktuelle Rolle und effektiven Pflichtwechselstatus.

Eigener Wechsel verlangt eine durch Firebase verifizierte UID, deren Player-Claim genau
diese UID bindet. Eine fremde Ziel-ID erfordert zusätzlich aktuellen Admin-Claim, aktuelle
Admin-Rolle in Firestore, keinen Pflichtwechsel/Pending-Status des Admins und ein aktives
Zielkonto. Spielleiter und clientseitige Rollenbehauptungen verleihen keine Berechtigung.
Deaktivierte Auth-Akteure und gelöschte Spieler werden abgewiesen. Ein berechtigter Admin
aktualisiert die Claims des **Zielkontos**, erhält jedoch kein Ziel-Sitzungstoken.

## Nicht atomarer DB-/Auth-Vertrag und Wiederherstellung

Firestore und Firebase Auth besitzen hier keine gemeinsame Transaktion. Der Ablauf ist
deshalb ausdrücklich mehrstufig:

1. Transaktion prüft Actor/Ziel und schreibt das neue Credential zusammen mit
   `mustChangePin=true` und einer eindeutigen `pinChangePending`-Markierung. Klartext wird
   nicht gespeichert. Die neue PIN kann ab diesem Zeitpunkt bereits die gültige sein.
2. Persistente Custom Claims des Zielkontos werden aus den autoritativen Daten gesetzt;
   unbeteiligte Claims bleiben erhalten. Neue Auth-Konten werden nur für vorhandene,
   berechtigt adressierte Spieler bzw. nach erfolgreicher Credentialprüfung angelegt.
3. Eine zweite Transaktion prüft erwartetes Credential, Pending-Markierung, Rolle und
   Aktivstatus erneut. Nur dann setzt sie DB-Pflichtwechsel auf false und entfernt Pending
   sowie überholte Einmal-PIN-/Sperrmetadaten.
4. Beim eigenen Wechsel wird ein neues Sitzungstoken ohne alte Zusatzclaim-Overrides
   ausgegeben. Der Client authentifiziert sich damit, erzwingt die Tokenprüfung und liest
   den effektiven DB-/Claims-Status. Erst danach meldet er Erfolg und öffnet das Dashboard.

| Fehlerstelle | Bestätigtes Verhalten / Korrekturweg |
| --- | --- |
| vorbereitender DB-Write abgewiesen | vorheriges Credential bleibt; kein Erfolg; erneuter Aufruf möglich |
| DB-Commit erfolgt, dessen Bestätigung verloren | neuer Zustand kann bereits pending sein; kein Erfolg; dieselbe neue PIN wiederholen oder damit anmelden |
| Claim-Write scheitert vor/nach Anwendung | DB bleibt pending/wechselpflichtig; geschützte Zugriffe gesperrt, auch bei altem ready-Token; gleicher Retry oder neuer Login repariert |
| finaler DB-Write scheitert | Claims können bereits false sein; DB-/Pending-Gate hält die Sperre; gleicher Retry/Login schließt bedingt ab |
| finale DB-Bestätigung oder Tokenausgabe verloren | DB/Claims können bereits konsistent sein; kein falscher Client-Erfolg; gleicher Retry/Login ist möglich |
| Client-Transport, Neuanmeldung, Refresh oder Statusprüfung scheitert | keine Erfolgsanzeige/Dashboard-Navigation; Button wieder verwendbar; Hinweis auf Wiederholung mit derselben neuen PIN bzw. erneute Anmeldung |
| Ownerwechsel während Request | verspätete Antwort ändert nicht den Pflichtwechselstatus eines anderen lokalen Benutzers |

Gleiche PIN plus gleicher Pending-Vorgang kann fortgesetzt werden. Ein anderer PIN-Wert
darf einen noch ausstehenden Vorgang nicht überschreiben. Bereits abgeschlossene gleiche
Eingaben ändern den Hash nicht erneut. Die Login-Prüfung kann nach erfolgreicher Prüfung
des neuen Credentials denselben Pending-Vorgang abschließen; die alte PIN kann das nicht.
Einmal-PIN-Aktivierung und deren Fehler-Rollback dürfen zwischenzeitliche persönliche
Änderungen nicht überschreiben. Es gibt keine pauschale Rücksetzung auf das alte Credential.

Die Rules sperren geschützte Daten während Pflichtwechsel/Pending, erlauben jedoch die
bisherigen eigenen Profilreads und authentifizierten öffentlichen Profilreads. Ein bloßes
Client-Flag hebt die Sperre nicht auf. Die bestehenden Server-V2-Prüfungen lehnen den
DB-Pflichtwechselstatus ebenfalls ab; ihre Implementierung wurde nicht geändert.

Technischer Hintergrund: Custom-Token-Zusatzclaims können persistente Claims überlagern;
deshalb verwendet der neue Login persistente Claims und Tokens ohne konkurrierende
Zusatzclaims. Die eigene PIN-Aktion authentifiziert sich neu, um auch alte Sitzungen
abzulösen. Siehe [Firebase Custom Claims](https://firebase.google.com/docs/auth/admin/custom-claims).
Rules mit DB-Prüfung schützen die Client-SDK-Zugriffe; Admin-SDK-Callables brauchen eigene
Prüfungen, da sie Rules umgehen. Siehe [Firestore Rules-Bedingungen](https://firebase.google.com/docs/firestore/security/rules-conditions).

## Tatsächlich ausgeführte Tests

**Node: 281 erfolgreich, 0 fehlgeschlagen, 0 übersprungen.** Darin enthalten sind alle
bisherigen 237 Tests des S01-Stacks und 44 S04-Tests (30 serverseitig, 14 Client).
Keine bestehenden Tests wurden entfernt oder ihre Erwartungen abgeschwächt.

```powershell
$env:SCORE_SYNC_EMULATOR_TEST='0'
node --test tests/preprod-gates.test.cjs tests/preprod-hosting.test.cjs tests/local-environment.test.cjs functions/test/score-read-v2.test.js functions/test/score-operations-v2.test.js tests/score-screen.test.cjs tests/v1-s01-snapshot.test.cjs tests/v1-s01-bridge.test.cjs functions/test/pin-s04.test.js tests/pin-s04-client.test.cjs
# tests 281 / pass 281 / fail 0 / skipped 0

node tests/run-score-sync-browser.cjs
# 38 Adapter-Checks + 32 Phase-B-Checks und bestehende Storage-Suite erfolgreich
node tests/run-score-screen-browser.cjs
# je 75 Checks bei 320/390/1024, jeweils V1=0 und V2=0 Transportwrites

# Ausschließlich auf unverändertem Hotfix-Code, separater lesender Lauf:
node --test tests/v1-score-safety.test.cjs
# 30 erfolgreich
```

Die VM-Tests injizieren echte Ablehnungen im verwendeten Adapter: vorbereitender/finaler
DB-Write und verlorene DB-Bestätigung, Claim-Write vor/nach Anwendung, Tokenausgabe,
Client-Neuanmeldung, Token-Refresh, Statusabfrage und Transport. Jeder Teilfehler erhält
einen Retry-/Recovery-Nachweis. Negative Autorisierung verlangt konkrete Fehlercodes.
Getestet werden auch idempotente Wiederholung, gleichzeitige gleiche Requests,
abweichende Pending-Eingabe und Schutz vor Einmal-PIN-Rollback eines neueren Wechsels.

### Reale lokale Auth-/Functions-/Firestore-Integration

```powershell
$env:JAVA_HOME='C:/Users/thoma/source/repos/DEV_Google/LIE Scorecards_Firebase PreProd/.codex-phase2a-worktree/.local-runtime/java21/jdk-21.0.13+9'
$env:PATH="$env:JAVA_HOME/bin;$env:PATH"
$env:LIE_AUTH_PORT='9299'; $env:LIE_FIRESTORE_PORT='8288'
$env:LIE_FUNCTIONS_PORT='5201'; $env:LIE_APP_PORT='5602'
npm run test:integration
# Exit 0; S04-PASS und bestehendes S01/V2/Auth/Rules-PASS; Emulatoren beendet
git diff --check
```

Bestätigte Emulator-Evidenz mit eigenem frischem Browserprofil und ausschließlich
synthetischen Konten:

- Eigener wechselpflichtiger Spieler kann vor Abschluss keine geschützten Scores lesen
  oder sein Pflichtwechsel-Flag direkt ändern. Die tatsächliche PIN-Oberfläche schließt
  den Wechsel ab; unabhängige Admin-SDK-Reads bestätigen neuen Credential-Hash,
  DB-Pflichtwechsel=false, keine Pending-Markierung und tatsächliche persistente Claims=false.
- Altes Credential wird abgewiesen; der tatsächliche Login-Handler akzeptiert das neue.
  Echter Reload/Session-Restore führt ohne erneute Pflichtschleife zum Dashboard.
- Fremder Spieler, Spielleiter, UID-/Claim-Mismatch und veralteter Admin-Claim werden
  abgewiesen. Berechtigter Admin ändert ausschließlich Zielkonto/-Claims ohne Zieltoken.
- Fünf ungültige Versuche aktivieren weiterhin die bestehende zeitliche Anmeldesperre.
- Reproduzierbar vorbereitete DB-/Claims-Teilzustände bleiben auch mit einem vorherigen
  ready-Token gesperrt. Reload zeigt die PIN-Ansicht; derselbe neue PIN-Wert repariert.
  Ein zweiter Teilzustand wird ohne vorherige Sitzung über Login mit dem neuen Credential
  repariert. Einmal-PIN-Anforderung überschreibt den Pending-Zustand nicht.
- Ein tatsächlicher Callable-Commit mit anschließend im Browser verlorener Antwort liefert
  keinen Client-Erfolg; derselbe PIN-Wert schließt den UI-Abgleich beim Retry sicher ab.
- Die vorherigen echten S01-/V2-/Auth-/Rules-/Logout-/deaktivierten Mailprüfungen bleiben grün.

Wichtig: Die DB-/Claims-Teilzustände im Emulator werden gezielt synthetisch vorbereitet.
Die SDK-Schreibfehler selbst werden in den VM-Tests injiziert; kein echter Auth-Serviceausfall
oder Infrastrukturabsturz wurde vorgetäuscht oder als geprüft ausgegeben.

Netzwerkbeleg: ausschließlich `demo-lie-scorecards-local`, 549 normale Loopback-Requests,
0 fremde Origins. App-/Serviceports 5602/9299/8288/5201. GAS-Negativkontrolle vor Übertragung
durch CSP blockiert, zwei Verletzungsmeldungen; Node-Netzwerksperren-Negativkontrolle grün.
Lokale Belege: ignorierte `.local-runtime/network-proof.json` und `s04-pin-proof.json`.

## Datenschutz, Grenzen und offene Abnahme

Im ersten roten Client-Test enthielt die lokale Assertion-Ausgabe einen zufällig erzeugten
synthetischen Eingabewert. Dieser lokale Log wurde geschwärzt; die Assertion prüft jetzt
ausschließlich boolesch. Keine Werte oder Hashes werden in Bericht/PR übernommen; der Log
ist nicht versioniert. Der credentialfreie Baseline-Replay bestätigt den ursprünglichen
ReferenceError erneut. Produktionsdaten oder reale PINs wurden zu keinem Zeitpunkt verwendet.

Bestätigt ist nur der geprüfte lokale Stack. Ungeprüft bleiben produktiver Rollout,
der tatsächlich ausgelieferte Functions-Stand, reale Browser-/Mobilgerätevielfalt,
Crash-/Langzeit-/Lasttests und die vollständige Zwölf-Spieler-Abnahme. Die Regeln und
Callables müssen später zusammen mit dem Client als eigenes freizugebendes Paket behandelt
werden; hier erfolgt kein Deploy. Vorherige Clients besitzen den neuen Recovery-Vertrag nicht.

Ein bedingt abgewiesener Vorgang nach Rolle-/Aktivstatusänderung braucht einen berechtigten
Abgleich; absichtlich deaktivierte/gelöschte Konten werden nicht automatisch entsperrt.
Kein irreversibler Sperrzustand wurde in den injizierten Standard-Teilfehlern beobachtet;
das ist kein Beweis gegen jede Infrastruktur-/Datenkorruption.

Bereits ausgestellte Sitzungen anderer Geräte werden durch PIN-Wechsel nicht global
widerrufen. Sofortige Session-Revocation, Rate-Limit-Härtung gegen konkurrierende anonyme
Loginversuche und ein fachlicher Admin-Reset-/Kommunikationsprozess bleiben gesonderte
Sicherheits-/Betriebsentscheidungen. Die bestehende eigene Profil-Read-Berechtigung und
Admin-Profilverwaltung wurden nicht grundsätzlich neu entworfen. Reale PIN-Mail/GAS bleibt
deaktiviert; dessen produktive Zustellbarkeit wurde nicht geprüft.

S01-Journal/ACK-Vertrag, V1-/V2-Scorelogik, HCP, Rundenschluss, historische Korrekturen,
PreProd-/Hosting-Pläne und Cloud-Execution-/Demo-/Credential-/Netzwerk-Guards sind unverändert.
Die gezielte Rules-Änderung verstärkt ausschließlich die Auth-/Pflichtwechselgrenze.
**Keine Produktionsfreigabe durch S04.**

## Unveränderte vorhandene Worktrees

Original bleibt `feature/score-autosync` auf `cb4661f5194147fa0ef0f40fe44838ce3d0aa19e`.
Der vor Beginn gespeicherte binäre Diff und die vorhandene unversionierte Dateiliste sind
identisch; einzige zusätzliche Listeneintragung ist der neue S04-Worktree. Die sechs
vorhandenen Dirty-Dateien bleiben erhalten. Es wurde kein Checkout/Stash/Reset/Clean dort
ausgeführt. S01 bleibt auf `f862cf0`, Audit auf `3ac98f4`; Phase-2A-/2B-/Hosting-/Safety-/Status-
Worktrees behalten HEAD und sauberen versionierten Status. Hotfix bleibt `55c0db4` mit seiner
vorhandenen unversionierten `fiveserver.config.js` und ohne versionierte Änderungen.

Abhängigkeiten wurden nur im neuen Worktree mit `npm ci --ignore-scripts --no-audit --no-fund`
installiert; Lockfiles bleiben unverändert. Öffentliches Emulator-JAR wurde in dessen
ignorierte Runtime kopiert, vorhandenes JDK ausschließlich lesend verwendet. Emulator-CLI
und Browser nutzen weiterhin getrennte Credential-/Profilgrenzen. Kein produktiver
Firebase-/GAS-Zugriff, keine echten Benutzer-/HCP-Daten, keine Cloud-Projektanlage,
kein Deploy, kein Merge und keine Veränderung früherer PR-Branches.
