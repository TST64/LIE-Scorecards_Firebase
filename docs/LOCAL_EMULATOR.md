# Phase 2A: isoliertes lokales Startprofil

Auftrag: Issue #4; Refs #3. Grundlage ist der Sicherheitsbericht aus PR #3 (`afadff8`). Dieser Branch ist ein lokaler Reviewstand, kein Produktionsrelease. Kein Deploy, kein Merge, keine Anlage eines echten PreProd-Projekts.

## Basis und Umfang

Der Branch wurde isoliert von der lokalen `main`-Basis `f4dcbec` angelegt. Nach ausdrücklicher Zustimmung des Nutzers wurden die beiden Feature-Commits `cd13440` und `cb4661f` per Cherry-pick übernommen und Kopien der sechs vorhandenen uncommitteten Dateien als separater Baseline-Commit gesichert. Der ursprüngliche Entwicklungs-Worktree wird weder umgeschaltet noch bereinigt oder beschrieben. Der PR enthält damit auch die autorisierten V2-/Autosync-Abhängigkeiten gegenüber `main`; er ist kein kleiner Hotfix für Produktion.

## Architektur und Grenzen

- Einziger unterstützter App-Modus dieses Branches: `local` mit `demo-lie-scorecards-local`. Es gibt keinen implementierten Cloud-/Produktionsmodus und keinen Fallback.
- `App_Environment.js` validiert Modus, Projekt-ID, Demo-Konfiguration, Loopback-Origin und drei unterschiedliche Emulatorports. Jede bereits initialisierte Firebase-App wird abgelehnt. Erst nach einem gleichen-Origin-Readiness-Probe werden Auth, Firestore und Functions (`europe-west1`) synchron an Emulatoren gebunden. Der Probe prüft TCP-Erreichbarkeit; der echte Integrationslauf prüft zusätzlich die Protokolle. Ein nicht vertrauenswürdiger lokaler Prozess auf einem reservierten Port liegt außerhalb dieser Grenze.
- `App_Start.js` beendet einen fehlgeschlagenen Guard vor dem bisherigen Loginlisten-Fehlerpfad. V1-Bridge und V2-Callable-Transporte verwenden dieselbe gebundene Instanz.
- Der Wrapper erzeugt eine lokale Firebase-Konfiguration und startet ausschließlich `emulators:exec --project demo-lie-scorecards-local --only auth,firestore,functions`. Keine Deployfunktion, keine Imports oder Exports. `.firebaserc` hat ausschließlich das Demo-Projekt als Default.
- Auth, Firestore und Functions hören auf `127.0.0.1`. Standardports: 9099, 8088, 5001; App 5501. Emulator-Hub/Logging verwenden 4400/4500, Firestore-Websocket standardmäßig 9150. Diese Hilfsports sind ebenfalls für den lokalen Testbetrieb reserviert.
- Functions prüfen Demo-Projekt, Emulatorvariablen und Modus vor Initialisierung des Admin SDK. Ein synthetischer RSA-Schlüssel wird ausschließlich im Speicher erzeugt, damit das Admin SDK eine erkannte Zertifikatsklasse ohne ADC oder echten Service-Account verwenden kann. Er wird nicht gespeichert oder protokolliert. Der Wrapper verwendet ein neues temporäres CLI-Home und entfernt übergebene Credential-/Token-/Proxyvariablen.
- Eine Socket-Sperre verhindert nicht lokale Node-Verbindungen in Functions und Testsession vor dem Verbindungsaufbau. Browser-CSP begrenzt Requests auf den eigenen Origin und die drei konkreten Emulatorports. Frische Browserprofile, deaktivierte Hintergrundverbindungen und DNS-Einschränkungen ergänzen die Tests. Das ist keine Behauptung einer systemweiten Firewall oder einer Sandbox gegen bösartigen lokalen Code.
- GAS-/Mailversand ist im Backend deaktiviert. Der Stub erhält keine PIN und ruft kein Netz auf. Temporäre PINs ändern ausschließlich synthetische lokale Spieler; sie werden nicht verschickt oder ausgegeben.
- Firebase-Compat-SDK, Tailwind und Font Awesome werden aus fest versionierten npm-Paketen lokal geliefert. Es gibt keine CDN-Abhängigkeit beim App-Start; externe Fonts entfallen. Externe Bilder/Wetterrequests sind durch CSP gesperrt. Wetterfunktion und externe Avatare sind lokal entsprechend eingeschränkt.

## Persistenz, Session und Service Worker

Neue V1-Puffer tragen Umgebung und Besitzer und liegen unter `lie_score_sync_v1__local:demo-lie-scorecards-local__<owner>`. Ungebundene frühere Puffer werden weder gelesen noch verändert oder gelöscht. Ein fremder Besitzer/Umgebungsmarker wird ignoriert. Bei Benutzerwechsel wird nur der In-Memory-Zustand getrennt; verspätete ACKs verändern keine andere Besitzerpartition. Logout stoppt die bekannten Autosync-Timer, behält aber dauerhafte Daten.

Die neuen Standard-IndexedDB-Namen sind `lie_score_sync_v2__local:demo-lie-scorecards-local` und `lie_score_entry_context_v2__local:demo-lie-scorecards-local`. Alte Datenbanken bleiben unangetastet; es gibt keine automatische Übernahme. Explizite Datenbanknamen der isolierten Regressionstests bleiben erhalten. V2-Eingabe und Produktionsadapter verwenden im normalen App-Pfad den neuen lokalen Store; die eigentliche V2-Sendeintegration wird dadurch nicht automatisch aktiviert.

Lokal wird kein Service Worker registriert. Eine bereits kontrollierte Seite wird vor Firebase-Initialisierung abgewiesen; der Wrapper liefert `sw.js` nicht aus, und CSP verbietet Worker. Keine alten Registrierungen oder Caches werden automatisch gelöscht. Stets einen neuen Browser-Profilordner und `http://127.0.0.1:5501` verwenden. Bestehende Puffer oder Profile nicht kopieren. Der Testbrowser macht dies automatisch.

## Voraussetzungen und Start

Node 22, JDK 21+, installiertes Chrome/Edge für den Integrationslauf. Java über `JAVA_HOME`/`PATH` nur für den lokalen Prozess wählen. Die im Auftrag heruntergeladene portable JDK-Kopie liegt ausschließlich im ignorierten `.local-runtime/`; sie ist kein Repositorybestandteil und keine systemweite Installation.

Im **isolierten Worktree**:

```powershell
npm ci --ignore-scripts --no-audit --no-fund
npm --prefix functions ci --ignore-scripts --no-audit --no-fund
npm run test:local
npm run test:integration
# Erst nach erfolgreichen Guards/Integration für manuelle Arbeit:
npm run local
```

Die Installationsbefehle beziehen nur Werkzeuge/Pakete. Die CLI kann beim ersten Start Emulator-Binaries herunterladen; diese liegen unter `.local-runtime/emulators`. Sie verbindet keine reale Firebase-App. Während App-/Functions-Tests sind nur lokale Dienste zulässig.

`npm run local` öffnet keinen Browser. Nach erfolgreicher Bereitschaftsmeldung die angezeigte URL in einem frischen Browserprofil öffnen. Synthetische Namen: `local-player-a`, `local-player-b`, `local-admin`; öffentlicher Fixture-PIN ausschließlich lokal: `1234`. Keine echten Spieler/PINs verwenden. Der Seed überschreibt bei jedem Start nur die ausdrücklich reservierten synthetischen Fixture-Dokumente, nicht beliebige lokale Daten. Ein temporärer PIN des Stubs ist nicht zum erneuten Login geeignet; erneuter Start stellt den synthetischen Fixture-PIN wieder her.

Ports können vor Start mit `LIE_AUTH_PORT`, `LIE_FIRESTORE_PORT`, `LIE_FUNCTIONS_PORT`, `LIE_APP_PORT` gesetzt werden; alle müssen gültig und verschieden sein. Projekt und Hosts sind bewusst nicht frei konfigurierbar. Beispiel:

```powershell
$env:LIE_AUTH_PORT = '9199'
$env:LIE_FIRESTORE_PORT = '8188'
$env:LIE_FUNCTIONS_PORT = '5101'
$env:LIE_APP_PORT = '5502'
npm run test:integration
```

Stopp: `Ctrl+C` im zugehörigen Wrapper-Terminal. `emulators:exec` beendet die von ihm gestarteten Emulatoren nach Testende/Fehler. Keine fremden Prozesse beenden. Generierte Config `.firebase-local.generated.json`, öffentliche Modusdatei `functions/.env.local`, Runtime-Cache und Logs sind ignoriert. Vorhandene andere Functions-Dotenv-Dateien werden nicht überschrieben: Der Wrapper bricht ab. Die generierte `.env.local` enthält ausschließlich `LIE_MODE=local`, da CLI-Discovery beliebige Prozessvariablen nicht übernimmt.

## Tests und Troubleshooting

- `npm run test:local`: Vertrags-Negativfälle, initialisierte fremde App, Startfehler ohne Legacy-Fallback, ausgefallener Emulator, V1-Timer/Retry/Reload/Besitzerwechsel und verspäteter ACK; Node-Netzwerk-Negativkontrolle.
- `npm run test:integration`: echter normaler `index.html`-Start, echte Compat-SDKs, drei Demo-Emulatoren und synthetischer Seed; Browser-Netzwerkaufzeichnung, anonyme/authentifizierte Rules, falsche PIN, Custom-Token-Login, Session-Restore, V2-Read/Write, deaktivierte Mail, Logout/Reload und absichtlich durch CSP blockierter GAS-Request.
- Weiterhin separat: `node tests/run-score-sync-browser.cjs`, `node tests/run-score-screen-browser.cjs` sowie die bestehenden Node-Suites. Die optionale Firestore-only-Emulatorsuite und deren Config bleiben erhalten; sie ersetzen keine Auth-/Rules-Clienttests.
- Keine Browser-App starten, wenn Bootstrap-/Netzwerkchecks scheitern. Bei fehlendem SDK `npm ci` im isolierten Worktree verwenden. Bei Javafehlern JDK 21+ wählen. Bei Portkonflikt andere freie lokale Ports wählen. Bei aktiver Worker-Kontrolle ein frisches Profil verwenden; keine alten Daten löschen. Bei fehlendem Emulator wird abgebrochen, niemals Cloud-Fallback einschalten.
- Testdetails und tatsächliche Ergebnisse: `docs/PHASE2A_TEST_REPORT.md`. Fehlgeschlagene Zwischenläufe und nicht live geprüfte Bereiche dort ausdrücklich unterscheiden.

## Deployment und Rollback

Dieses lokale Profil darf nicht als Produktionsartefakt veröffentlicht werden. Der bisherige Produktions-Config-/GAS-/Worker-Pfad ist in diesem Branch absichtlich nicht aktiv. Die historische Deployment-README ist keine Anleitung für diesen Branch. Für echtes PreProd und Produktion sind getrennte, später zu prüfende Profile und Deployjobs erforderlich; kein solches Projekt wird hier eingerichtet.

Rollback vor Merge: neuen Worktree/PR unangetastet zur Prüfung stehen lassen oder den lokalen Wrapper stoppen; der ursprüngliche Entwicklungsstand bleibt verfügbar. Kein Reset/Stash/Dateiersatz dort. Bei späterer Umsetzung Rücknahme nur in einem eigenen Review-Commit. Niemals funktionierende Tests durch Umschalten auf `liescorecard-70c5e` herstellen. Vor Freigabe bleiben V1/V2-Rules-Politik, Produktionsworkflow und vollständige Geräte-/Offline-Validierung eigene Entscheidungen.
