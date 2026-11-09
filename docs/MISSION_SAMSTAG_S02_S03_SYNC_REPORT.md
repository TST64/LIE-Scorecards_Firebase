# S02/S03 – autoritativer Score-Pfad: Entscheidung, Umsetzung und Nachweise

Prüf-/Abschlussstand: 09.11.2026.

Basis: `3d77af88318679d30896b9d611bbaf812af4d4a7`, Draft-PR #15. Issue #16.
Neuer Branch `codex/s02-s03-authoritative-score-sync`, isolierter Worktree `.codex-s02-s03-worktree`.

## Inventar und verbindliche Entscheidung

| Writer / Einstieg | Bisher | Entscheidung für diesen Kandidaten |
| --- | --- | --- |
| normale Eingabe `Views_ScoreEingabe` → ScoreEntryV2 | IndexedDB, kein automatischer Sender | automatischer Scheduler, bestehender V2-Adapter/Callable |
| `saveScoreOperationsV2` | Transaktion, Feldrevision, Generation, Mutation-/Request-Receipt | einziger aktiver App-Scorewriter; Admin-Korrekturen ebenfalls nur mit derselben CAS-Basis |
| V1-Schnellerfassung → `saveLiveScores` | unversionierter Client-Write | sichtbar sperren; V1-Journal und Puffer unverändert erhalten |
| direkte Admin-Korrektur `saveAdminRoundCorrection` | Round-/Score-Batch ohne Revision | vor jedem Write sperren; S07-Folgearbeit |
| `recalculateSeasonFromStart` | Score-/HCP-/Runden-Batches | vor jedem Write sperren; S07 |
| Rundenschluss UI/API | Runde schließen, danach HCP-Updates | vor Seiteneffekten sperren, Pending-/Konflikthinweis; S05 |
| Master-Reset | löscht zuerst Runden, dann Scores/Flights | vor erstem Write sperren |
| direkter Firestore-Client, auch Admin | Score-/Legacy-Score-Writes ohne CAS | Rules verweigern `scorecards`-/`scores`-Writes, Reads gemäß Auth-Grenze erhalten |
| externe Admin-SDK-Skripte / Operator-Credentials | umgehen Firestore Rules | keine vorhandene App-Route; nicht durch Rules kontrollierbar, Cloud-Guards bleiben gesperrt |

Ein aktiver Vertrag: Owner/Player, Runde, Flight, Zielspieler, Loch, Feld, eindeutige Change-ID,
unveränderlicher Request, erwartete Feldrevision und Dokumentgeneration. Serverseitig atomare
Feldänderung mit Receipt; gleiche Revision konkurrierender Geräte erzeugt genau einen Erfolg,
der andere bleibt Konflikt. Andere Felder bleiben unabhängig. Nie automatisch rebasen/discarden.

Neue Karten verlangen ausdrücklich gespeicherte Rundenstartdaten: `hcpStart[playerId]` und
`holeAllowances[playerId][hole]`. Fehlen sie, wird Erstellung abgewiesen. Kein heutiger HCP,
kein erfundener Wert. Vorbereitung echter Runden und die fachliche Berechnung bleiben S06.

## Implementierter Kandidat

Der neue `App_Logic_ScoreAutoSyncV2.js` wird im echten App-Einstieg geladen. Der normale
View-Load aktiviert den Sender; ein erfolgreich dauerhaftes `appendChanges` im tatsächlichen
Controller weckt ihn. Der Renderer selbst erzeugt keine Operation und ruft keinen Transport
auf. Der Sender bündelt kurze Eingabefolgen, drainiert die Queue begrenzt und prüft vor jedem
Transport den erfassten Owner. Login/Restore, erneutes Öffnen, Reconnect und Logout sind
angebunden. Persistierte eigene Kontexte werden wieder aufgenommen. Logout/Ownerwechsel
stoppt Timer und invalidiert den Controller, ohne lokale Partitionen zu löschen.

Ein unbekannter Ausgang wird mit demselben persistierten Request und denselben IDs über
die bestehenden serverseitigen Receipts wiederholt. Terminale Konflikte/Ablehnungen bleiben
stehen; kein Timer rebased oder verwirft sie. Fehler erhalten begrenzten Backoff. Ein spätes
ACK verarbeitet ausschließlich seine Originalpartition und Change-IDs. Bereits neue lokale
Eingaben werden anschließend gesondert gesendet.

Die Oberfläche unterscheidet lokal/ausstehend, offline, sendend, serverbestätigt, Konflikt
und Fehler. Lokale numerische Vollständigkeit erzeugt keinen grünen Server-Haken mehr.
Serververgleich und explizites Verwerfen eines einzelnen lokalen Konfliktfelds sind über
die Oberfläche möglich; Erwartungsprüfung und unbekannte Requests sperren einen veralteten
Abgleich. Es gibt keinen automatischen „lokal gewinnt“-Pfad. Versionierte Render-/Action-
Prüfungen verhindern die Anzeige eines alten Ergebnisses über einer neuen Eingabe.

### Nachträglich reproduzierter Cache-Fall

Die erste Zwölf-Spieler-Prüfung zeigte: Eine Karte war in Owner A als abwesend gecacht und
wurde später von einem anderen Owner angelegt. Die bisherige pauschale Generationsprüfung
verhinderte danach schon das erneute Öffnen. Ein zusätzlicher roter Controller-Test
reproduzierte das. Nun darf ein vollständiger autoritativer Read frühere **Abwesenheit ohne
lokale Arbeit** binden. Die IndexedDB-Transaktion prüft nochmals atomar, dass inzwischen
keine Pending-Operation entstanden ist. Eine bekannte frühere Dokumentgeneration wird
weiterhin nicht automatisch ersetzt. Zwei zusätzliche echte IndexedDB-Browsertests prüfen
Bindung und Race-Abweisung.

### Bewusst deaktivierte Funktionen

V1-API, direkte Score-Writes auch durch angemeldete Admins, direkte Admin-Korrektur,
historische Neuberechnung, Rundenschluss und Master-Reset sind gesperrt. Die UI-Funktionen
stoppen vor mutablen Form-/DB-Arbeiten; die API stoppt vor Seiteneffekten. Für Score-Dokumente
ist die Rules-Sperre maßgeblich und lässt sich nicht durch einen Client-Flag umgehen.
Preview-/Leselogik bleibt erhalten. Die alte V1-Renderer-/Bridge-Implementierung bleibt als
Regression-Referenz prüfbar, ist aber keine freigegebene Route zum Schreiben. Der normale
Rapid-Einstieg zeigt ausschließlich die Sperre und den Hinweis auf erhaltene V1-Puffer.

Admin-Korrekturen können im Test über den vorhandenen `selectedFlight`-V2-Callable mit
expliziter Revision erfolgen; die unversionierte Admin-Oberfläche wurde **nicht** heimlich
auf diesen Vertrag migriert. Für S05/S07 bleibt sie deaktiviert. Der Rundenschluss meldet
lokale Pending-Arbeit und ist unabhängig davon vollständig blockiert; unbekannte Queues
anderer Geräte können dadurch nicht versehentlich als abgearbeitet gelten.

## Testbelege und Wiederholung

Tests/Inventar zuerst: `97bc9fd` (`test: reproduce missing automatic sender and unsafe score writer coexistence`).
Auf unverändertem S04-Code: **12 Tests, 10 rot, 2 grün**. Die bereits grünen Fälle zeigen,
dass der vorhandene explizite Backend-CAS-Vertrag grundsätzlich funktioniert; sie beweisen
noch keinen integrierten normalen Sender. Erst danach wurde Anwendungscode verändert.
Der zusätzliche Abwesenheits-Test war vor seinem Fix ebenfalls rot.

Node-Gesamtlauf: **297 erfolgreich, 0 fehlgeschlagen, 0 übersprungen**. S01- und S04-
Regressionen bleiben enthalten. Der V1-Runtime-Vertrag wird jetzt zusätzlich negativ geprüft;
die früheren positiven S01-Algorithmustests prüfen gezielt die erhaltene Legacy-Implementierung.
Keine Tests entfernt. Positive neue Karten-Fixtures enthalten nun explizite Startdaten;
ihre Assertions verlangen genau diese Metadaten statt deren früherem Fehlen. Der bisherige
Generations-Test prüft weiterhin die Ablehnung einer **bekannten alten** Generation; die
neue sichere Abwesenheitsbindung besitzt eigene Tests.

```powershell
$env:SCORE_SYNC_EMULATOR_TEST='0'
node --test tests/preprod-gates.test.cjs tests/preprod-hosting.test.cjs tests/local-environment.test.cjs functions/test/score-read-v2.test.js functions/test/score-operations-v2.test.js tests/score-screen.test.cjs tests/v1-s01-snapshot.test.cjs tests/v1-s01-bridge.test.cjs functions/test/pin-s04.test.js tests/pin-s04-client.test.cjs tests/score-auto-sync.test.cjs functions/test/score-writer-safety.test.js
# tests 297 / pass 297 / fail 0 / skipped 0

node tests/run-score-sync-browser.cjs
# 40 Adapter-/IndexedDB-Checks (vorher 38) + 32 Phase-B-Checks und Storage-Suite
node tests/run-score-screen-browser.cjs
# je 75 Checks bei 320/390/1024 Pixel; isolierte Renderer-/Controller-Fixtures, null Transporte

# Ausschließlich auf dem unveränderten Hotfix-Code:
node --test tests/v1-score-safety.test.cjs
# 30 erfolgreich

$env:JAVA_HOME='C:/Users/thoma/source/repos/DEV_Google/LIE Scorecards_Firebase PreProd/.codex-phase2a-worktree/.local-runtime/java21/jdk-21.0.13+9'
$env:PATH="$env:JAVA_HOME/bin;$env:PATH"
$env:LIE_AUTH_PORT='9299'; $env:LIE_FIRESTORE_PORT='8288'
$env:LIE_FUNCTIONS_PORT='5201'; $env:LIE_APP_PORT='5602'
npm run test:integration
```

Die Browser-Screen-Suite bleibt eine isolierte Präsentations-/Local-Commit-Prüfung.
Ihr Mock-Setup ohne automatischen App-Sender ist **kein** E2E-Sendenachweis; dafür dient
der normale App-Einstieg in den echten Demo-Emulatoren mit realem Auth/Functions/Firestore.

### Versuchsaufbau der echten lokalen Integration

Zwölf synthetische Identitäten `SYN01`–`SYN12`, drei Viererflights, separate synthetische
Admin-Identität und eine 9-Front-Runde. Explizite Startdaten unterscheiden sich absichtlich
vom heutigen Spieler-HCP; Start-HCP 0 wird ebenfalls geprüft. PIN-Werte werden ausschließlich
im Testprozess erzeugt, nicht protokolliert. Das Admin-SDK des Tests liest unabhängig die
Serverwerte und Claims; es bereitet nur synthetische Fixtures vor. Die eigentlichen
Korrekturwrites erfolgen über den autorisierten V2-Callable.

Jeder der zwölf Spieler navigiert in die echte normale Eingabe und betätigt deren sichtbaren
Stepper. Kein Test-Direktaufruf von `adapter.sync` oder Scheduler-Flush ersetzt diesen Pfad.
Danach werden Serverwert, HCP-Metadaten und tatsächlicher Queue-/Bestätigungsstatus geprüft.
Zusätzliche echte Browser-Kontexte trennen Auth und IndexedDB derselben Identität.
Zwei Geräte mit gleicher Feldbasis liefern genau einen Erfolg und einen sichtbaren Konflikt.
Eine neuere versionierte Admin-Korrektur wird durch den veralteten normalen Sender nicht
zurückgedreht. Ein anderes Feld kann unabhängig bestätigen. Direkte Admin-Set/Update/Delete-
Versuche auf beiden Score-Collections und V1-API werden abgewiesen. Expliziter lokaler
Discard nach Serververgleich belässt die Admin-Korrektur unverändert.

ACK-Verlust wird **nach tatsächlichem Commit** injiziert. Danach werden Functions-/Firestore-
Browserzugriffe blockiert, ein Offline-Reload mit lokalem Kontext ausgeführt und der
Originalrequest nach Reconnect automatisch über den Receipt-Vertrag wiederholt. Dabei
dürfen weder Dokumentgeneration noch Feldrevision doppelt erhöht werden. Die erste
Offline-Harness-Version injizierte die Browser-Vorgabe nach Reload nicht wirksam; sie
wurde mit aktiviertem CDP-Page-Domain korrigiert. Das war keine Lockerung eines App-Guards.

Ein testinterner Fokuslauf (`LIE_SYNC_FOCUS=1`) dient ausschließlich der Eingrenzung dieses
Szenarios. Für die Gesamtabnahme wird die Variable nicht gesetzt; S01/S04 bleiben enthalten.
**Bestätigter Gesamtlauf: Exit 0**, einschließlich S01- und S04-Integration sowie des
vollständigen Zwölf-Spieler-/Mehrprofil-/Admin-/Receipt-Szenarios. Ein zusätzlicher Fokuslauf
bestätigt darüber hinaus eine **neue** Offline-Putts-Eingabe während des unbekannten Requests:
nach Reconnect wird zuerst das alte Receipt verarbeitet, danach die neue Änderung gesendet.
Die Schlagrevision bleibt dabei 1, Putts erhöht sich genau für die neue Eingabe auf 2.
Ein weiterer Offline-Append übersteht den tatsächlichen Logout. Ein anderer Owner sendet
ihn nicht; erst erneute Anmeldung des ursprünglichen Owners synchronisiert ihn automatisch.

Beide Läufe bestätigen ausschließlich Demo-/Loopback-Verkehr und **0 fremde normale
Origins**. App-/Serviceports 5602/9299/8288/5201. Die CSP-GAS-Negativkontrolle wurde vor
Übertragung blockiert (zwei Meldungen); die Node-Netzwerksperren-Negativkontrolle bleibt grün.
Der letzte zusätzliche Fokuslauf beobachtete 537 lokale Requests. Lokale, ignorierte
Belege: `.local-runtime/s02-emulator-output.txt` (Gesamtlauf),
`s02-extra-emulator-output.txt` (Zusatzlauf), `s02-s03-proof.json` und `network-proof.json`.
Diese sind ausschließlich synthetische Prüfdaten; der Fokuslauf ersetzt keine S04-Abnahme.

## Grenzen, offene Annahmen und Release-Gates

- **NO-GO bleibt bestehen.** S05 Rundenschluss, S06 fachliche HCP-/9-/18-Loch-Abnahme,
  S07 historische Neuberechnung und S08/Betrieb bleiben offen. Zwölf erfolgreiche normale
  Eingaben sind keine vollständige Samstagsrunde mit Abschluss/HCP-Fortschreibung.
- Der Start-Metadatenvertrag wird in synthetischen Fixtures nachgewiesen. Bestehende Runden
  ohne `holeAllowances` erhalten keine automatische Migration; neue Karten werden abgewiesen.
  Erzeugung, fachliche Prüfung und unveränderliche Verwaltung echter Start-Snapshots sind
  S06-Arbeit. Keine implizite Ableitung aus aktuellem HCP und keine Behauptung, dass sämtliche
  alten 9-/18-Loch-Berechnungen damit repariert wären.
- Vorhandene V1-Puffer werden weder gelöscht noch automatisch in V2 übertragen. Ein
  ausdrücklicher, geprüfter Abgleich ist erforderlich. Gesperrte Legacy-/Admin-/Abschluss-
  Funktionen sind bewusst fehlende Betriebsfunktionen, keine erteilte Releasefreigabe.
- Physisch gelöschte/neu angelegte bekannte Karten benötigen explizite Recovery; keine
  automatische Lifecycle-Adoption. Ein einfacher Serververgleich erzwingt kein Überschreiben.
- Änderungen der Flight-Zuordnung migrieren keine alten Queues. Der Server prüft die
  aktuelle Membership und weist veraltete Kontexte ab; deren Daten bleiben in der alten
  Partition. Ein Kontext übergreifender Recovery-Dialog ist nicht implementiert. Die
  Mehrprofilabnahme verwendet die ausdrücklich vorbereiteten drei festen Flights.
- Rules stoppen Client-Schreiber, auch Admin-Clients. Externe privilegierte Admin-SDKs oder
  Console-Operatoren können Rules umgehen. Keine vorhandene freigegebene App-Route benutzt
  diesen Bypass; globale Operator-/Cloud-Sicherheit wird hier nicht behauptet. Sicherheits-
  und Credential-Gates bleiben geschlossen.
- Keine echte Mobilgeräte-/Langzeit-/Last-/Hardware-Crash-/Backup-Restore-Abnahme, keine
  produktive Beobachtung und kein produktiver Deploymentnachweis. Lokales IndexedDB-Commit
  schützt nicht gegen bewusste Browserdatenlöschung. Keine neue fachliche Strich-Freigabe.

## Arbeitsgrenzen

Originaler Feature-HEAD bleibt `cb4661f5194147fa0ef0f40fe44838ce3d0aa19e`; vor Beginn
gespeicherter binärer Dirty-Diff und vorhandene Dateiliste sind unverändert, abgesehen vom
neuen Worktree-Verzeichniseintrag. Alle vorherigen Review-Worktrees behalten HEAD und
sauberen versionierten Status. Hotfix bleibt `55c0db4` mit seiner vorhandenen unversionierten
`fiveserver.config.js`. Kein Checkout/Stash/Reset/Clean oder Merge in bestehenden Worktrees.
Abhängigkeiten/JAR nur im neuen ignorierten Runtime-Verzeichnis; vorhandenes JDK ausschließlich
lesend. Lokale Seed-Ergänzungen sind explizit synthetische Fixtures, keine Guard-Änderungen.
Keine Produktions-/Firebase-Cloud-/GAS-Zugriffe, echten Personen-/PIN-/HCP-Daten, Cloud-
Projektänderungen, Deployments oder Änderungen früherer Branches.
