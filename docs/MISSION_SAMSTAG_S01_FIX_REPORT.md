# Mission Samstag – S01: V1-Snapshot-/ACK-/Pending-Reparatur

Stand: 08.11.2026. Auftrag: [Issue #12](https://github.com/TST64/LIE-Scorecards_Firebase/issues/12),
Audit: [Draft-PR #11](https://github.com/TST64/LIE-Scorecards_Firebase/pull/11).
Basis: `codex/mission-samstag-audit`, `3ac98f44b324682422605a62340a062a3fc3218a`.
Neuer Branch: `codex/s01-v1-snapshot-safety`, neuer Worktree: `.codex-s01-worktree`.

**Release bleibt NO-GO.** Dieser Fix betrifft die V1-Eingabe-/Bestätigungskette. S02/S03,
PIN-Wechsel, HCP, Rundenschluss, historische Korrekturen und Betriebsabnahme bleiben offen.
Die Audit- und Zwölf-Spieler-Matrix bleiben unverändert.

## Bestätigte Ergebnisse

Die ursprünglichen 14 Regressionen wurden zuerst ohne Anwendungsfix committed:
`09a7bb0e5e6e37bd4ba2c83208b2bea8cc795056` (`test: reproduce V1 ACK pending defaults and persistence failures`).
Danach erst erfolgte die Implementierung. Der unveränderte Audit-Code ergibt **12 Fehler / 2 Erfolge**.
Ein erneuter Replay mit korrigierten Cross-Realm-Arrayvergleichen bestätigt dieselben 12 Fehler;
die Arraykorrektur im Test ändert keine fachliche Erwartung.

```text
Baseline 3ac98f4, erste 14 S01-Regressionen:
# tests 14
# pass 2
# fail 12

Fix, vollständiger Node-Lauf:
# tests 237
# pass 237
# fail 0
# skipped 0
```

| Szenario | Audit-Code / neue Regression | Ergebnis im Fix |
| --- | --- | --- |
| SY01: 5 senden, 6 eingeben, ACK 5 | rot | 6 bleibt persistent pending; nächstes ACK bestätigt 6 |
| SY02: 5→6→5 | rot | neue ID für jede Eingabe, kein Valuevergleich für ACK |
| SY03: Loch 1 sendbar, Loch 2 nur Putts | rot | nur tatsächlich gesendete IDs quittiert; Putts warten auf Schlagbasis |
| SY04: nur strokes, puts=3/lady=true vorhanden | rot | ausschließlich strokes gepatcht; keine Anzeige-Defaults geschrieben |
| SY05: Commit erfolgt, Antwort verloren | rot | Request bleibt dauerhaft unklar/gesperrt, auch nach Reload kein Blind-Retry |
| SY06: Partial ACK | rot | nur benannte IDs quittiert; unbestätigter Rest bleibt gesperrt |
| SY07 / Kontext | Ownerwechsel vorher bereits grün; zusätzliche Fälle ergänzt | spätes ACK betrifft ausschließlich alten Owner/Request; andere Runde/Flight bleibt pending |
| SY08: Clear, puts=0, Boolean false | rot | explizite Set-/Delete-Operationen; keine Truthiness-Defaults |
| OF03 / UX01: Persistenz-/Bestätigungsstatus | rot | abgelehnte Eingabe und Speicherfehler sichtbar; keine falsche lokale/Serverbestätigung |
| Tabs | rot | unabhängige Änderungen bleiben erhalten; gleiches Feld verschiedener Writer wird gesperrt |

## Implementierte Callchain

1. `App_Logic_Spieltage.js` nimmt Rapid-Eingaben strikt numerisch oder als Clear entgegen.
   Leeren erzeugt eine Delete-Operation. Bei Ablehnung wird das Input auf den sicheren Wert
   zurückgesetzt; Fokus und Tab-Reihenfolge bleiben erhalten.
2. `App_Logic_Scores.js` schreibt zuerst einen unveränderlichen Journalbeleg mit UUID,
   Sequenz, Owner, Demo-Environment, Spieltag, Spieler, Loch und Feld. Erst erfolgreicher
   `localStorage.setItem` bedeutet akzeptierte Eingabe. Strich und manuelles Aufheben eines
   Strichs werden als atomare Feldgruppe persistiert. Nicht akzeptierte Änderungen erhalten
   eine Fehlermeldung; frühere sichere Belege bleiben stehen.
3. Der Puffer wird aus diesen Belegen rekonstruiert. Alte, veränderliche V1-Bundles werden
   weder übernommen, überschrieben noch gesendet. Vorhandene Altpuffer erzeugen einen Hinweis.
   Ein separater Snapshot-Checkpoint dient nur der Diagnose; seine Schreibbarkeit ist keine
   Voraussetzung für die Haltbarkeit bereits geschriebener Operationsbelege.
4. Beim Senden werden genau die sendefähigen Feldoperationen tief eingefroren, einschließlich
   Request-ID und vollständigem Zielkontext. Vor jedem möglichen Transport wird der Request
   persistiert. Web Locks verhindern gleichzeitig laufende Requests desselben Owners/Flights
   im selben Origin. Ohne Web Locks wird Senden gesperrt; lokale Eingaben bleiben erhalten.
5. `App_Logic_Bridge.js` akzeptiert für `saveLiveScores` ausschließlich das neue Protokoll.
   Die tatsächliche Firestore-Transaktion liest Runde, Flight und alle Zielkarten vor den
   Writes. Sie prüft Aktivstatus, Membership, Owner und Kartenidentität. Bestehende Karten
   erhalten nur die beabsichtigten Feldupdates bzw. `FieldValue.delete()`. Erstellungsmetadaten
   überschreiben keine vorhandenen Werte, insbesondere kein `hcpStart=0`. Neue Karten erhalten
   keine künstlichen Putts-/Boolean-Defaults. Delete auf nicht vorhandener Karte ist ein
   serverseitig geprüfter No-op, keine erfundene Karte.
6. Erst nach bestätigtem Transaktionsabschluss liefert die Bridge Request-ID und bestätigte
   Change-IDs. Ein dauerhaft geschriebener Receipt quittiert ausschließlich diese IDs.
   Neue Eingaben während des Requests, auch ABA, bleiben unabhängig davon erhalten.
   Die RAM-Karte wird feldweise aktualisiert, der Pending-Stand erneut aus dem Journal gelesen.
7. `Views_ScoreSchnellerfassung.js` rendert den sichtbaren Live-Status, verwendet explizite Flight-Sequenzen und berücksichtigt Delete-Tombstones, statt gelöschte Werte
   aus dem alten Karten-Cache wieder einzublenden. Die Statusanzeige unterscheidet lokal
   gespeichert/ausstehend, wartet auf Schlagbasis, serverbestätigt, Speicherfehler und
   Konflikt/unklarer Ausgang. Eine andere, unberührte Runde bekommt keine Serverbestätigung.

Die Journal-Partition lautet `lie_score_sync_v1_s01__local:demo-lie-scorecards-local__<Owner>`.
Operations-, Gruppen-, Request- und Receipt-Belege sind append-only. Lesefehler, widersprüchliche
Kontexte und beschädigte Feldoperationen sperren das Senden. Es gibt keine automatische
Bereinigung, Adoption alter Puffer oder Auflösung unbekannter Requests.

### Bewusst konservativer Fehlervertrag

Eine fehlgeschlagene Readiness-Prüfung vor jedem Datenzugriff wird als sicher nicht angewandt
und wiederholbar bestätigt; ungültige Payloads vor Transaktionsbeginn bleiben zur Prüfung
gesperrt. Nur eine explizite,
dauerhaft gespeicherte Antwort `definitelyNotApplied=true, retryable=true` erlaubt einen
automatischen neuen Versuch. Ein Fehler nach Eintritt in die Transaktion wird konservativ
als **unklar** behandelt, selbst wenn der konkrete SDK-Fehler möglicherweise einen Abbruch
bezeichnet. Fehlende, falsche, doppelte oder fremde ACK-IDs sowie Receipt-Speicherfehler
führen ebenfalls nicht zu einer Bestätigung. Kein erneuter Write aufgrund bloßer Annahmen.

### Selektiver Hotfix-Port

Kein Merge von `hotfix/v1-score-safety` (`55c0db4`). Selektiv übernommen und an das neue
Operationsprotokoll angepasst wurden explizite Flight-Auswahl, eindeutige Runde/Flight/
Membership/Kartenidentität, Prüfung der gesamten Payload vor Writes, Omission unveränderter
Felder, Schutz von False/Nullwerten, Request-Isolation und Guard-Freigabe. Der frühere
wertbasierte ACK-Vergleich wurde durch Change-IDs ersetzt, weil er ABA nicht absichert.
Die Original-30 Tests wurden separat auf ihrem unveränderten Hotfix-Code erneut ausgeführt;
sie sind keine Behauptung, dass dessen altes Payload-Protokoll hier unterstützt wird.

Bestehende Tests wurden nicht entfernt: Die lokalen Fixtures erhielten Storage-Aufzählung,
UUID und Web Locks; die Namespace-Assertions folgen dem neuen Journal. Der Legacy-Maxscore-
Test stubbt den atomaren Gruppen-Persistenzaufruf statt einzelner Feldaufrufe. Seine bisherigen
fachlichen Erwartungen bleiben bestehen.

## Ausgeführte Tests und Befehle

Alle Befehle im neuen Worktree, außer dem ausdrücklich getrennten Hotfix-Lauf. Node 22,
installierter Headless Chrome, reale IndexedDB/localStorage/Web Locks im Browser.

```powershell
node --test tests/v1-s01-snapshot.test.cjs tests/v1-s01-bridge.test.cjs
# 57 erfolgreich: 40 Journal/UI/Kontext-Tests, 17 tatsächliche Bridge-Tests mit Memory-Firestore

$env:SCORE_SYNC_EMULATOR_TEST='0'
node --test tests/preprod-gates.test.cjs tests/preprod-hosting.test.cjs tests/local-environment.test.cjs functions/test/score-read-v2.test.js functions/test/score-operations-v2.test.js tests/score-screen.test.cjs tests/v1-s01-snapshot.test.cjs tests/v1-s01-bridge.test.cjs
# 237 erfolgreich: bisherige 180 einschließlich 13 lokaler Sicherheitstests und 65 Core/V2/Screen-Tests + 57 S01

node tests/run-score-sync-browser.cjs
# 38 Adapter-Checks + 32 Phase-B-Checks und bestehende Storage-Suite erfolgreich
node tests/run-score-screen-browser.cjs
# je 75 Checks bei 320/390/1024 Pixel, jeweils V1=0 und V2=0 Transportwrites

# Im Hotfix-Worktree, dessen Code unverändert:
node --test tests/v1-score-safety.test.cjs
# 30 erfolgreich

# Im neuen S01-Worktree; vorhandenes JDK ausschließlich lesend genutzt:
$env:JAVA_HOME='C:/Users/thoma/source/repos/DEV_Google/LIE Scorecards_Firebase PreProd/.codex-phase2a-worktree/.local-runtime/java21/jdk-21.0.13+9'
$env:PATH="$env:JAVA_HOME/bin;$env:PATH"
$env:LIE_AUTH_PORT='9299'; $env:LIE_FIRESTORE_PORT='8288'
$env:LIE_FUNCTIONS_PORT='5201'; $env:LIE_APP_PORT='5602'
npm run test:integration
# Exit 0, emulators:exec fährt die gestarteten Emulatoren anschließend herunter
git diff --check
```

Die neuen S01-Tests umfassen zusätzlich Request-/Receipt-Persistenzfehler, ungültige ACKs,
gleichzeitige Tabs, Legacy-Quarantäne, Strich-Gruppen bei Quota-Fehlern, ungültige Flights,
mehrdeutige Memberships/Karten, beschädigte Belege und Status bei Spieltagwechsel.

**Echte Demo-Integration bestätigt:** unveränderter App-Einstieg und Firebase Compat SDK,
synthetischer Login, echte Firestore-Transaktion, echte Browser-Persistenz und Reload.
Nach gehaltenem ACK bleibt der unabhängige `get({source:'server'})` bei 5, während 6 pending
ist; nach zweitem Sync steht serverseitig 6 mit unveränderten Putts/Lady. Clear entfernt das
Feld tatsächlich; anschließende Null/False erreichen den Server. Nach tatsächlichem Commit
und simuliertem Antwortverlust bleibt die Operation nach Reload pending/gesperrt, ohne
erneuten Transport. Bestehende V2-Read/Write-, Auth-, Rules-, Logout- und deaktivierte
Mailprüfungen bleiben grün.

Netzwerkbeleg des vollständigen Integrationslaufs: `demo-lie-scorecards-local`, 307 beobachtete
normale Loopback-Requests, **0 fremde Origins**; erlaubte App-/Serviceports 5602/9299/8288/5201.
Der GAS-Negativkontrollversuch wurde vor Übertragung von CSP blockiert (2 beobachtete
Verletzungsmeldungen). Zusätzlich bleibt die Node-Netzwerksperren-Negativkontrolle grün.
Die Log-/Profilbelege liegen ignoriert unter `.local-runtime/`; sie sind keine Produktivdaten.
Der erste Testversuch innerhalb der Sandbox konnte Loopback-HTTP nicht ausführen; der
unveränderte Sicherheitstest bestand anschließend außerhalb der Sandbox. Keine Testlockerung.

`npm ci --ignore-scripts --no-audit --no-fund` wurde im neuen Root und in dessen `functions`
ausgeführt. Bestehende Lockfiles blieben unverändert. Das öffentliche Emulator-JAR wurde
in die neue ignorierte Runtime kopiert. Keine vorhandenen Credentials oder Browserprofile
wurden kopiert; die vorhandenen leeren CLI-Homes, Demo-Guards und Loopback-Policies bleiben aktiv.

## Grenzen, offene Entscheidungen und Annahmen

**Bestätigte Einschränkungen / Folgeblocker:**

- Unklarer Commit-Ausgang hat noch keinen serverseitigen, revisionsgebundenen V1-Receipt.
  Es gibt bewusst keinen automatischen Retry, kein automatisches Entsperren und keine
  Recovery-Schaltfläche. Betrieblich ist ein separater, geprüfter Abgleich notwendig.
  Bis dahin den Puffer weder löschen noch manuell erneut senden.
- Web Locks gelten für denselben Origin und dieselbe Owner-/Flight-Partition. Unterschiedliche
  Geräte, Origins, Browserprofile oder Owner sind dadurch nicht koordiniert. V1/V2/Admin-
  Schreiber besitzen weiterhin keine gemeinsame Feldrevisionierung: **S03 bleibt P0**.
  Firestore-Transaktionen erhalten unabhängige Felder, verhindern allein aber keinen
  beabsichtigten Same-Field-Last-write-wins eines anderen Geräts. Kein Mehrgeräte-Sicherheitsnachweis.
- Unterschiedliche Writer desselben Felds bleiben als Konflikt erhalten. Ein vom Browser
  duplizierter Tab kann denselben `sessionStorage`-Writer erben; diese Identitätskollision
  ist nicht vollständig abgesichert. Deshalb keine Abnahme gleichzeitiger Tabs/Geräte.
- Append-only-Belege wachsen; Quota führt zu sichtbarer Ablehnung weiterer Eingaben.
  Versionsgebundene Kompaktierung/Export/Recovery und eine Browser-Eviction-/Storage-Clear-
  Strategie fehlen. Ein bestätigtes `setItem` beweist keine Hardware-Dauerhaftigkeit nach
  Stromverlust, Browserdatenlöschung oder Betriebssystemfehler.
- Altpuffer bleiben quarantiniert. Eine geprüfte manuelle Wiederherstellung/Migration ist
  vor Übernahme realer Altstände erforderlich; kein automatischer Upload.
- Der neue Vertrag ist weiterhin **Demo-only**. Keine Produktionsaktivierung, kein Cloud-
  Einsatz vorbereitet oder geprüft. Sicherheits-Policy, Cloud-Execution-Gates, Rules,
  Functions/V2-Implementierung und Deploymentkonfiguration sind unverändert.

**Nicht ausgeführt / ungeprüfte Annahmen:**

- Keine vollständige Zwölf-Spieler-/Drei-Flight-E2E-Abnahme, Last-/Mobilgeräte-/Langzeitprüfung,
  kein physischer Browserabsturz, kein produktiver Backup-/Restoretest. Die echte Integration
  verwendet ausschließlich die vorhandenen synthetischen Demo-Accounts, nicht zwölf reale Golfer.
- V1-Strich-Konvention bleibt fachlich unverändert: an = übergebener Maxscore, aus = übergebenes
  Par, Putts unverändert. Nun sind beide beteiligten Felder atomar und explizit. Diese technische
  Erhaltung ist **keine neue fachliche Gruppenfreigabe** für Strich/Putts/unvollständige Runden.
  Die im Audit offenen Entscheidungen bleiben offen.
- Die bestätigten HCP-Zahlenregeln wurden nicht geändert. HCP-Berechnung, historischer Verlauf,
  PIN-Fehler, V2-UI-Sender und Rundenschluss wurden hier nicht repariert oder neu abgenommen.

Nächstes notwendiges Paket: PIN-P0 separat beheben, danach S02/S03 mit gemeinsamer
Writer-/Revisions-/Idempotenzstrategie und expliziter Konflikt-/Recovery-Abnahme; HCP- und
Rundenschluss-P0s sowie die vollständige synthetische Zwölf-Spieler-Matrix bleiben Releasegates.

## Arbeitsgrenzen

Der ursprüngliche Feature-Worktree bleibt auf `cb4661f5194147fa0ef0f40fe44838ce3d0aa19e`.
Der vor Beginn gespeicherte binäre Diff und die Liste vorhandener unversionierter Dateien
wurden bytegleich verglichen; einzige zusätzliche Listeintragung ist der neue isolierte
S01-Worktree. Die sechs vorhandenen Dirty-Dateien und ihre Änderungen bleiben unverändert.
Vorhandene Audit-/Phase-2A-/2B-/Hosting-/Safety-/Status-Branches behalten ihre HEADs und
sauberen versionierten Zustände. Hotfix wird ausschließlich gelesen und separat getestet;
HEAD bleibt `55c0db4344c1da9501609d7525722a7c82e2aeb5`, seine vorhandene unversionierte
`fiveserver.config.js` bleibt erhalten, keine versionierten Änderungen.
Keine alten Branches verändert, kein Stash/Reset/Clean, kein Merge, kein Deploy, keine
Cloud-Projektänderung, keine produktiven Firebase-/GAS-Zugriffe und keine echten Personendaten.
