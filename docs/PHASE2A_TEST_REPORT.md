# Phase 2A: Implementierung und Testbericht

Datum: 08.11.2026, Europe/Berlin. Issue #4; Refs #3. Nur isolierter Worktree `.codex-phase2a-worktree`, Branch `codex/local-emulator-isolation`. Keine Deployments, echten Firebase-/GAS-Aufrufe, produktiven Datenimporte oder Merges. Paket-/JDK-/Emulator-Downloads dienen ausschließlich dem lokalen Testwerkzeug.

## Herkunft und Sicherheitsnachweis

Ausgangs-`main`: `f4dcbec`. Entwicklungs-Worktree: `feature/score-autosync` bei `cb4661f5194147fa0ef0f40fe44838ce3d0aa19e`, sechs vorhandene geänderte Anwendungsdateien. Nach expliziter Nutzerentscheidung wurden ausschließlich im neuen Worktree die Feature-Commits `cd13440`/`cb4661f` übernommen (`8ae530b`, `14d7096`) und Kopien der sechs lokalen Dateien als Baseline `8763d7b` gesichert. Kein stillschweigender Feature-Merge und keine Änderung des ursprünglichen Index oder Branchs.

Der ursprüngliche binäre Git-Diff und die vorher vorhandene Liste unversionierter Dateien wurden nach Implementierung erneut gelesen und gegenüber dem zu Beginn im Arbeitsspeicher erfassten Snapshot verglichen: unverändert, abgesehen vom erwarteten neuen Worktree-Verzeichniseintrag. Das ist ein Nachweis des Git-Diffs/Inventars, keine Behauptung eines Hashvergleichs sämtlicher unversionierter Dateiinhalte. Kein Checkout/Reset/Clean/Stash im ursprünglichen Worktree.

## Bestätigte Tests

Ausführung mit Node 22.21.0, installiertem Chrome, Firebase CLI 15.33.0 und portablem JDK 21.0.13 im ignorierten Runtime-Ordner. Die Functions-Abhängigkeiten wurden aus dem unveränderten Functions-Lockfile installiert; neue Frontend-/CLI-Abhängigkeiten sind im Root-Lockfile festgehalten.

| Befehl | Bestätigtes Ergebnis |
| --- | --- |
| `node --test tests/local-environment.test.cjs` | 13 bestanden, 0 fehlgeschlagen; Loopback-Server außerhalb der Dateisandbox ausgeführt |
| `$env:SCORE_SYNC_EMULATOR_TEST='0'; node --test functions/test/score-read-v2.test.js functions/test/score-operations-v2.test.js tests/score-screen.test.cjs` | 65 bestanden, 0 fehlgeschlagen, 0 übersprungen |
| `node tests/run-score-sync-browser.cjs` | 38 Adapter-/Integrationstests erfolgreich, Phase B 32 erfolgreich, Storage-Seite vollständig erfolgreich; Memory-DB und echte IndexedDB |
| `node tests/run-score-screen-browser.cjs` | Je 75 Checks bei 320/390/1024 Pixeln erfolgreich; beobachtete V1-/V2-Schreibaufrufe jeweils 0; injizierter Kontext |
| `npm run test:integration` | Echter normaler App-Start mit drei Demo-Emulatoren erfolgreich; Abschlussmeldung `PASS local real-app network/Auth/Functions/Firestore/Rules/V2/mail/reload/logout checks; CSP negative control blocked.`, Exit 0 |
| Derselbe Integrationsbefehl mit `LIE_AUTH_PORT=9199`, `LIE_FIRESTORE_PORT=8188`, `LIE_FUNCTIONS_PORT=5101`, `LIE_APP_PORT=5502` | Ebenfalls Exit 0; 213 aufgezeichnete lokale Requests, 0 fremde Origins im normalen Ablauf; absichtlicher GAS-Request abgewiesen, 2 CSP-Verletzungsereignisse (Header- und Meta-Policy) |
| `git diff --check` | Keine Whitespacefehler im geprüften Implementierungsdiff |

Der lokale Unit-/Vertragstest enthält Produktionsprojekt-ID, fehlenden Modus, gemischte IDs/Auth-Domain, falschen Host, fehlende/gleiche Ports, vorhandene fremde Firebase-App und Server-Credentials als Negativfälle. Dabei kein SDK-Initialisierungs-/Callable-Transport bei ungültigem Vertrag. Readiness-Ausfall vor Start und vor einem späteren Callable blockiert den Sendepfad. Ein echter lokaler Readiness-Endpunkt liefert bei fehlendem Emulator 503. Ein aktiver Service-Worker-Controller blockiert vor SDK-Initialisierung und vor Readiness-Fetch. Ein Socket-Negativtest lehnt `script.google.com` vor DNS/Verbindung ab.

V1-Tests rufen gespeicherte 1500-ms-/Periodik-Callbacks deterministisch auf und simulieren `online`, statt 30 Sekunden real zu warten. Sie prüfen unveränderte ungebundene Altbestände, fremde Marker, Besitzerwechsel, Besitzerpartition nach Reload, nur eigene neue Sendepayloads und verspätete ACKs. Die 30-Sekunden-Periodik wird damit funktional geprüft, nicht als Langzeit-/Timing-Stresstest bestätigt.

## Echter Demo-Integrationslauf und Netzwerkbeweis

Der Browser lädt den normalen `index.html`-Einstieg vom neuen lokalen Server, keine speziell nachgebaute Testseite. SDKs werden lokal aus npm bereitgestellt. Ein frisches Profil verhindert Übernahme bestehender Sessions, Worker und IndexedDBs. Der Browserrunner zeichnet Request-Origins/Ports über CDP auf; keine Header, Tokens, PINs oder Nutzdaten werden in den Beleg übernommen.

Bestätigte Abläufe:

1. App-Start und `getLoginPlayers`, anonyme Firestore-Abweisung.
2. Falsche PIN gegen synthetischen Spieler; korrekte PIN, Custom Token und echter Auth-Emulator-Login.
3. Vollständiger Reload und Wiederherstellung der Session im normalen App-Start.
4. Rules-Clienttests: Spieler kann aktiven Score ändern, fremde private Spieler-/Sync-Belege nicht lesen und abgeschlossenen Score nicht ändern; Spielleiter kann Spieltag verwalten, abgeschlossenen Score nicht ändern; Admin kann abgeschlossenen Score ändern und private Spielerdaten lesen.
5. Echter V2-Read-Callable; Append in die lokale IndexedDB und expliziter Firebase-V2-Write-Adapter mit bestätigtem ACK.
6. Temporärer PIN gegen zweiten synthetischen Spieler, ausschließlich mit deaktiviertem Mailstub.
7. Echter Logout-Handler samt Loginlisten-Neuladen; weiterer Seitenreload.
8. Vor der Negativkontrolle keine fremden Request-Origins im aufgezeichneten normalen App-Verkehr; alle drei Emulatorports wurden tatsächlich benutzt.
9. Bewusst unerlaubter GAS-Fetch wird verworfen und erzeugt einen beobachteten `securitypolicyviolation`-Event mit `connect-src`. Die Negativkontrolle wird getrennt vom normalen Netzwerkverkehr bewertet und nicht als echter GAS-Aufruf ausgeführt.

Der optionale tokenfreie Beleg des aktuellen Runners liegt nach erfolgreichem Lauf unter `.local-runtime/network-proof.json` (ignoriert, keine produktiven Daten). Er enthält nur Demo-Projekt-ID, erlaubte Ports, Requestanzahl, Rollen und CSP-Negativkontrolle. Die Socket-Sperre in Functions/Testsession begrenzt zusätzlich den serverseitigen Node-Verkehr auf Loopback. Kein Nachweis einer systemweiten Firewall oder Absicherung gegen bösartigen lokalen Code.

## Fehlgeschlagene Zwischenläufe und Korrekturen

- Erster Paketinstallationsversuch in der Sandbox blieb ohne Fortschritt und wurde beendet; Installation anschließend mit erlaubtem Netzwerkzugriff für npm. Keine Firebase-App wurde dafür geöffnet.
- Eine generierte Config unter `.local-runtime/` wurde von der CLI wegen eines außerhalb ihres Projektverzeichnisses liegenden Rules-Pfads abgewiesen. Die generierte Config liegt jetzt im Worktree-Root. Kein App-Start in diesem fehlgeschlagenen Lauf.
- Functions-Discovery übernimmt beliebige Prozessvariablen nicht. Der fehlende lokale Modus führte zum Guard-Abbruch; der Wrapper erzeugt jetzt ausschließlich die öffentliche Markierung `LIE_MODE=local` und lehnt fremde Dotenv-Dateien ab.
- Eine beliebige Credential-Implementierung wurde vom Admin-Firestore-SDK abgelehnt. Statt auf ADC auszuweichen, wird jetzt eine synthetische, nur im Speicher erzeugte Zertifikatsidentität verwendet. Keine echten Service-Accounts oder Schlüsseldateien.
- Chrome verweigerte Remote-Debugging unter dem leeren CLI-Home. Nur der Browser erhält seine ursprünglichen Windows-Verzeichnispfade zurück, weiterhin mit einem eigenen frischen `--user-data-dir`; Functions/CLI behalten das leere Home.
- Der erste echte PIN-Erfolg deckte einen vorhandenen SDK-Kompatibilitätsfehler auf: `admin.firestore.FieldValue` war im installierten Admin-SDK nicht verfügbar. `FieldValue` und `Timestamp` werden jetzt aus `firebase-admin/firestore` importiert. PIN-Diagnoselogging wurde entfernt. Fachliche PIN-/HCP-Regeln wurden hierdurch nicht geändert.
- Der Test-Runner beobachtete beim echten Reload einen noch nicht aufgebauten JS-Kontext. Die Beobachtung wartet nun auf den neuen Zustand; sie wiederholt keine Schreibaktion.
- Die ursprüngliche Negativkontrolle erwartete ein Netzwerk-Fehlerereignis, obwohl CSP schon vor dem Netz blockiert. Der Nachweis erfolgt jetzt direkt über das CSP-Verletzungsereignis; der normale Verkehr war bereits ausschließlich Loopback.

Diese Zwischenläufe werden nicht als erfolgreiche Tests gezählt. Es wurde zu keinem Zeitpunkt ein Produktionsbackend als Ersatz verwendet.

## Geänderte Dateien der Phase 2A gegenüber Baseline 8763d7b

| Dateien | Änderung |
| --- | --- |
| `.firebaserc`, `.gitignore` | Demo-Default; Runtime/Abhängigkeiten/Dotenv ignoriert, bestehende Geheimnis-/Backup-Ausschlüsse erhalten |
| `package.json`, `package-lock.json` | Reproduzierbare lokale SDK-/CLI-/Darstellungsabhängigkeiten und Start-/Testbefehle |
| `App_Environment.js` | Neuer lokaler Vertrag, Bootstrap, Readiness und gebundene Callable-Instanz |
| `config.js`, `index.html`, `Style.css`, `sw.js` | Lokaler Demo-Modus, CSP, lokal gelieferte Assets, kein externer Fontimport, kein lokaler Worker |
| `App_Core.js`, `App_Start.js` | Validierung/Emulatorbindung vor Auth-/Datenstart; kein Fehler-Fallback bei Guardfehler |
| `App_Logic_Bridge.js`, `App_Logic_ScoreSyncV2.js` | Gemeinsame gebundene Functions, Readiness vor Bridge-/Callable-Requests |
| `App_Logic_Scores.js`, `App_Logic_Spieler.js` | V1-Umgebungs-/Besitzerpartition, Besitzerwechsel/ACK-/Logout-Schutz |
| `App_Storage_ScoreSync.js`, `App_Storage_ScoreEntryContext.js` | Neue lokale Standarddatenbanknamen, keine Altbestandsmigration |
| `functions/index.js`, `functions/local-guard.js`, `functions/network-guard.js` | Vorab-Guards, kein ADC, synthetische lokale Identität, Socket-Sperre, deaktivierter Versand, SDK-Importkorrektur |
| `tools/local/profile.cjs`, `start.cjs`, `session.cjs`, `server.cjs`, `seed.cjs`, `network-guard.cjs` | Einheitliches Profil, sicherer Wrapper/Dateiserver/Readiness, synthetischer Seed und Testsession |
| `tests/local-environment.test.cjs`, `tests/local-integration.cjs` | Neue negative/positive Sicherheits- und echte SDK-/Rules-/Netzwerktests |
| `README-DEPLOYMENT.md`, `docs/LOCAL_EMULATOR.md`, `docs/PHASE2A_TEST_REPORT.md` | Historische Deployanleitung gesperrt gekennzeichnet; Architektur, Bedienung und Nachweise |

Zusätzlich enthält der PR die getrennt nachvollziehbaren autorisierten Baseline-Commits für V2 und die lokale Autosync-Vorschau. Rules, HCP-Berechnungsformeln und die bestehende optionale Firestore-Testkonfiguration wurden in Phase 2A nicht verändert. Die vollständige Dateiliste gegen `main` ist im PR-Diff prüfbar.

## Nicht live geprüft / verbleibende Entscheidungen

- Keine echte Cloud-PreProd-/Produktionsintegration und keine produktiven Regeln, Daten oder IAM-Konfigurationen geprüft. Kein tatsächlicher E-Mail-Versand; der Stub ist absichtlich kein Mail-End-to-End-Test.
- Die ursprüngliche Firestore-only-Emulatorsuite wurde nicht erneut als eigene Suite ausgeführt; ihre Memory-Variante und die neue echte Dreidienste-Integration liefen erfolgreich. Die alte Config/Option bleiben erhalten.
- Ausfallbehandlung wurde mit fehlendem Loopback-Dienst und kontrollierter Readiness-Abweisung geprüft, nicht durch wiederholtes Töten jedes laufenden Emulatorprozesses. Rohes Firestore-SDK bleibt fest am lokalen Host und kann bei Netzverlust lokale Writes puffern/warten; Bridge-/Callable-Aufrufe prüfen zusätzlich Readiness. Kein Cloud-Fallback.
- V2-Offlinelogik, Konflikte und Generationen sind in den vorhandenen isolierten Suiten geprüft. Ein vollständiger kalter Start der normalen App ohne verfügbare Emulatoren ist absichtlich gesperrt; keine Freigabe als unabhängig offline betreibbares Produktions-PWA.
- Keine vollständige fachliche HCP-Abnahme, kein Langzeit-/Mehrgeräte-/Browserversionstest und keine visuelle Gesamtfreigabe. Die Rules-Clienttests bestätigen ausgewählte vorhandene Berechtigungen, keine neu entworfene V1/V2-Schreibpolitik. Die breiten aktiven V1-Schreibrechte bleiben eine separate Aufgabe.
- Ein bereits existierender alter Worker kann alten Code liefern, bevor neuer Bootstrap läuft. Deshalb ist ein frisches Browserprofil mit eigenem lokalen Origin verbindlich; alte Worker-/Cachebestände werden nicht gelöscht oder migriert. Das Profilgebot kann nicht rückwirkend durch bereits gecachten alten Code erzwungen werden.
- Ein echtes PreProd-Projekt, kontrollierte Cloud-Deployjobs, ein produktives Profil sowie eine spätere bewusste Übernahme alter Puffer sind eigenständige Entscheidungen. Dieser PR ist nicht als Produktionsartefakt freigegeben.

## Offizielle Referenzen

Die Compat-Verbindungen und Demo-Projekt-Grenzen wurden mit der offiziellen Dokumentation abgeglichen: [Auth-Emulator](https://firebase.google.com/docs/emulator-suite/connect_auth), [Functions-Emulator](https://firebase.google.com/docs/emulator-suite/connect_functions), [Firestore-Emulator](https://firebase.google.com/docs/emulator-suite/connect_firestore). Die Quellen ersetzen keinen lokalen Testnachweis.
