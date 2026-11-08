# Phase 1: PreProd-Sicherheitsanalyse

Stand: 08.11.2026, Europe/Berlin. Ausschließlich lokale Quelltext-/Git-Analyse und lesender Abgleich mit offizieller Firebase-Dokumentation. Keine App gestartet, keine Firebase-/GAS-Endpunkte aufgerufen, keine Tests mit Datenbankzugriff ausgeführt, keine Deployments oder Projektänderungen.

## Ergebnis und Evidenzgrenze

**Die lokale Entwicklungsumgebung ist im untersuchten Stand nicht vollständig und zuverlässig vom konfigurierten produktiven Firebase-System getrennt.** Der lokale Browser lädt eine Firebase-Konfiguration für `liescorecard-70c5e`; Auth, Firestore und Functions werden nicht auf Emulatoren umgeleitet. Eine lokale URL oder der Ordnername „PreProd“ bewirken keine Backend-Isolation. Bereits der Start ohne Login kann über eine vermeintliche Lese-Function serverseitige Schreiboperationen auslösen.

**Bestätigt** bezeichnet im Folgenden Quelltextbefunde und lokale Git-Ausgaben. **Risiko/Folgerung** bezeichnet die daraus abgeleitete mögliche Wirkung. Dass das konfigurierte Projekt tatsächlich die aktuell laufende Produktion ist, welche Functions-/Rules-Version dort ausgerollt ist und ob ein konkreter Aufruf erfolgreich wäre, wurde nicht live geprüft. Bis zu einer unabhängig belegten Trennung ist `liescorecard-70c5e` als Produktionsziel zu behandeln.

## 1. Ausgangsstand und Unverändertheit

- Arbeitsverzeichnis: `C:\Users\thoma\source\repos\DEV_Google\LIE Scorecards_Firebase PreProd`.
- Aktiver Branch: `feature/score-autosync`.
- HEAD: `cb4661f5194147fa0ef0f40fe44838ce3d0aa19e`.
- Lokale `main`-/gespeicherte `origin/main`-Referenz: `f4dcbecf9c4c95ca30135f3f2a1458def82ca757`. Kein Fetch; Aktualität gegenüber GitHub ist offen.
- Ausgangsbasis: lokale `docs/PROJECT_STATUS.md` aus dem vorangegangenen Dokumentationsauftrag und der aktuelle Dirty-State. Die Statusdatei ist im ursprünglichen Feature-Worktree unversioniert; der separate Status-Worktree enthält ihren Commit `5eba4e6`.

Alle bei Beginn gemeldeten uncommitteten Änderungen:

| Git-Status | Pfad |
| --- | --- |
| geändert | `App_Logic_Bridge.js` |
| geändert | `App_Logic_Scores.js` |
| geändert | `App_Logic_Spieltage.js` |
| geändert | `Views_ScoreSchnellerfassung.js` |
| geändert | `config.js` |
| geändert | `sw.js` |
| unversioniert | `.codex-status-worktree/` (vorhandener Dokumentations-Worktree) |
| unversioniert | `design-reference/` |
| unversioniert | `docs/` (enthält die lokale Statusdatei) |
| unversioniert | `fiveserver.config.js` |

Weitere bestehende Worktrees: Hotfix `hotfix/v1-score-safety` bei `55c0db4` sowie Statusdokumentation `codex/project-status-2026-11-08` bei `5eba4e6`. Diese werden nicht verändert. Für diesen Bericht wird ausschließlich ein neuer Worktree `.codex-safety-worktree/` mit Branch `codex/preprod-safety-analysis` auf der lokalen `main`-Basis verwendet. Der PR enthält nur diese Analyse; er integriert keine Feature-Commits und setzt den Merge des vorherigen Dokumentations-PRs nicht voraus.

## 2. Ist-Architektur und relevante Initialisierungen

| Bestandteil | Bestätigter Befund | Bedeutung für Isolation |
| --- | --- | --- |
| `.firebaserc` | Nur `projects.default = liescorecard-70c5e` | CLI-Standardziel ist kein isoliertes Testprojekt. Browserkonfiguration wird hiervon nicht umgestellt. |
| `config.js:5–18` | App-Version lokal `5.4.0-auto-sync-preview`; `projectId` und `authDomain` für `liescorecard-70c5e`, zugehöriger Storage-Bucket; GAS-Web-App-URL | Vorschauversion ändert keine Backend-Ziele. Die öffentliche Firebase-Konfiguration ist keine Zugriffssperre. |
| `firebase.json` | Functions aus `functions/`, Runtime Node 22; Rules aus `firestore.rules`; keine Emulator-/Hosting-Konfiguration | Ein normaler Start führt keine automatische Emulatoranbindung ein. |
| `index.html` | Firebase Web SDK 10.8.0 Compat per CDN; lädt `config.js` und danach Module | Kein separater lokaler Konfigurationspfad gefunden. |
| `App_Core.js:40–65` | `firebase.initializeApp(config)` bzw. Wiederverwendung vorhandener Default-App; `app.db = firebase.firestore()` | Keine Projekt-Allowlist, keine lokale Sperre, kein `useEmulator`. Bereits initialisierte Apps werden nicht gegen die erwartete Umgebung geprüft. |
| `App_Start.js`, `App_Logic_Spieler.js` | Sessionwiederherstellung, Token-/Claim-Lesen, Custom-Token-Login mit LOCAL-Persistenz | Ein lokaler Origin besitzt eigene Browserdaten, kann aber echte Firebase-Sessions zum gleichen Projekt aufbauen. |
| `App_Logic_Bridge.js:317–335` | `firebase.app().functions('europe-west1').httpsCallable(...)`; Loginliste darüber | Standard-Functions-Ziel der initialisierten App; keine lokale Umleitung. |
| `App_Logic_ScoreSyncV2.js:149–194` | Callable-Transporte für `saveScoreOperationsV2` und `readOwnFlightScoresV2` in `europe-west1` | Auch V2-Transport hat keine eigene Umgebungsgrenze. |
| `functions/index.js:13–19` | `admin.initializeApp()` ohne explizite Projektvalidierung; `admin.firestore()` | Backend-Ziel hängt von Runtime/Umgebung/Credentials ab. Keine eigene Sperre gegen Produktionsprojekt im lokalen Betrieb. |
| `functions/index.js:56,415–416` | GAS-URL separat fest im Backend; Versand per `fetch` | Änderung von `config.js` allein würde den Server-Versand nicht isolieren. |
| `fiveserver.config.js` (unversioniert) | `host: '0.0.0.0'`, Port 5500, `useLocalIp: true` | Kann bei passender Firewall im LAN erreichbar sein; tatsächliche Erreichbarkeit ungeprüft. Kein Backend-Proxy/Sicherheitsfilter. |
| `sw.js:89–139` | Externe Requests werden vom Worker nicht behandelt; lokale GETs aus Cache mit Hintergrundaktualisierung | Kein Netzfilter. Alte Skripte/Konfiguration können aus Cache kommen; externer Firebase-/GAS-Verkehr wird nicht blockiert. |

Im untersuchten Anwendungscode wurden keine Aufrufe von `useEmulator` oder vergleichbare Emulator-Verbindungen gefunden. Die einzige explizite emulatorbezogene SDK-Initialisierung liegt in der optionalen Server-Test-Suite, nicht im App-Start. Ein Storage-Ziel steht in der Konfiguration; im untersuchten Anwendungspfad wurde keine Firebase-Storage-SDK-Nutzung gefunden. Dies ist kein vollständiges Inventar externer Systeme außerhalb des Repositorys.

## 3. Mögliche produktive Zugriffe

| Pfad / Auslöser | Bestätigtes Verhalten im lokalen Code | Abgeleitetes Risiko |
| --- | --- | --- |
| App-Start ohne Session, Fehler-Fallback oder Logout | `loadLoginPlayers()` ruft `getLoginPlayers`; Function liest `spieler`, führt `batch.set`/`batch.delete` auf `spieler_public` aus und committet, wenn die Rückgabeliste nicht leer ist (`functions/index.js:133–183`) | Bereits Öffnen der normalen lokalen App kann ohne vorherige Anmeldung produktiv schreiben, falls dieser Code dort deployt ist. „Nur Loginseite ansehen“ ist kein sicherer Lesetest. |
| Anmeldung/PIN-Prüfung | `verifyPlayerPin` schreibt Fehlversuchszähler/Sperre bzw. Erfolgszustand, migriert gegebenenfalls PIN-Hash und erstellt Custom Token (`functions/index.js:185–292`) | Auch falsche Test-PINs können echte Spieler sperren; erfolgreicher Test-Login kann Daten verändern. |
| PIN ändern | `updatePlayerPin` verändert PIN-Zustand | Echte Zugangsdaten können geändert werden. |
| Temporären PIN anfordern | `requestTempPin` schreibt PIN-Zustand und sendet `spielerId`/temporären PIN an den fest verdrahteten GAS-Endpunkt; Fehlerpfad versucht Wiederherstellung | E-Mail-Versand/Weitergabe an reales GAS auch aus einer künftig nur teilweise emulierten Umgebung möglich. GAS-Code und Empfängerauflösung liegen nicht zur Prüfung vor. |
| Session/initiale Daten/Live-Polling | Auth-Token-Verkehr und Firestore-Lesen über Default-App; Bridge liest Spieler-/Runden-/Score-/Stammdaten | Zugriff auf echte personenbezogene Daten und serverseitige Last; auch ohne beabsichtigtes Editieren. |
| V1 `saveLiveScores` | Bridge schreibt Scorecards direkt mit `batch.set(..., {merge:true})` (`App_Logic_Bridge.js:368–383`) | Ein normaler lokaler Bedienvorgang kann echte Scores überschreiben. |
| Sonstige App-Bedienung | Bridge und Views schreiben Spieltage, Flights, Spieler, Saisonkonfiguration, Kalender, Stammdaten/Settings; Rundenschluss und historische Korrektur schreiben Sieger/HCPs | Bei echten Rollen große fachliche Reichweite bis zur gesamten HCP-Saisonkette. |
| V2 expliziter Sync | Firebase-Adapter kann `saveScoreOperationsV2` aufrufen; Server schreibt Scores plus private Sync-Belege | Revisionen/Idempotenz schützen vor bestimmten Konflikten, aber nicht vor Wahl des falschen Firebase-Projekts. |
| Lokale Functions-Ausführung | Admin SDK ohne eigene Zielprüfung; GAS unabhängig von Emulatoren | Mit passender Umgebung/Credentials können echte Cloud-Ressourcen adressiert werden. Credentials-Bestand wurde nicht geöffnet oder geprüft. |
| Firebase CLI / Deployment-README | Defaultprojekt produktionsverdächtig; README enthält Deploybefehle ohne explizites `--project` | Falsches Deployziel möglich; im Auftrag wurde kein solcher Befehl ausgeführt. |

GAS-Adresse in Frontend und Backend verweist auf dieselbe Web-App unter `script.google.com/macros/s/.../exec`; die vollständige URL und Zugangsdaten müssen für die Umsetzung nicht in diesen Bericht kopiert werden. Ein direkter aktiver Frontend-Aufruf von `CONFIG.gasUrl` wurde nicht gefunden; der Backend-Aufruf ist ausdrücklich vorhanden. Zusätzliche externe Requests (CDNs, Wetter/API, Avatar-URLs) sind keine belegten Firebase-Schreiber, müssen aber im isolierten Testnetz ebenfalls berücksichtigt werden.

### Firestore Rules: Berechtigung ist keine Umgebungstrennung

`firestore.rules` verwendet Token-Claims `playerId`/`role`, trennt `spieler` und `spieler_public` und schützt abgeschlossene Runden vor nicht administrativen Scoreänderungen. Für nicht beendete Runden können angemeldete Mitglieder `scorecards` und Legacy-`scores` direkt verändern; es gibt dort keine Flight-/Feldrevisionsbindung. Admin/Spielleiter besitzen weitere Schreibrechte. Die privaten V2-Belegcollections fallen unter das Client-Deny-all.

**Folgerung:** Echte gültige Sessions machen lokale Schreibzugriffe möglich, sofern die entsprechenden Rules live gelten. Die Rules unterscheiden keinen Entwicklungs-Origin. Das Admin SDK umgeht Client-Rules; serverseitige Prüfungen bleiben zwingend. Der aktuelle Live-Regelstand wurde nicht abgefragt.

## 4. V1-Autosync, V2 und Browser-Tests

### V1-Autosync: produktive Schreibmöglichkeit bestätigt im Code

Die vorhandene uncommittete Vorschau in `App_Logic_Scores.js` persistiert `liveScores` und `pendingScoreKeys` unter `lie_score_sync_v1`. `markScorePending()` plant nach 1500 ms den Sync. `initScoreAutoSync()` lädt den Puffer, registriert einen `online`-Handler und alle 30 Sekunden einen weiteren Sendeversuch. `Views_ScoreSchnellerfassung.js:23` aktiviert diesen Mechanismus. `syncScoresWithServer()` erzeugt Score-Payloads und ruft den direkten V1-Schreibpfad auf.

Es gibt keine Prüfung auf Emulator, Umgebung oder erlaubte Projekt-ID. `navigator.onLine` prüft keine Backend-Isolation. Der gespeicherte V1-Puffer trägt im untersuchten Format keine Projekt-/Umgebungskennung; bei späterem Konfigurationswechsel am gleichen Origin könnten alte Test- oder Echtdaten erneut sendbar werden. Die aktuellen Guards/Flightprüfung begrenzen mögliche Ziele fachlich, verhindern aber keine Wahl des Produktionsprojekts. Es wurde kein Race- oder Schreibtest gegen Firebase durchgeführt.

### V2: lokale Eingabe allein schreibt nicht ins Netz

Die V2-Scoreeingabe persistiert lokal; sie ist derzeit nicht mit einem Sender/Scheduler verbunden. Online-Kontextlesen kann aber den echten `readOwnFlightScoresV2`-Callable adressieren. Der explizit erzeugbare Firebase-Sync-Adapter kann echte Schreib-Callables aufrufen. IndexedDB-Partitionen enthalten Benutzer-/Spieltag-/Flight-Kontexte, keine explizite Umgebungs-/Projektpartition. Für spätere Umschaltung muss deshalb auch V2 auf gleiche Origins und wiederverwendete IDs geprüft werden. Die Servervalidierung ersetzt keine Umgebungsprüfung.

### Isolierte Tests: vom normalen App-Start unterscheiden

| Testmechanismus | Lesend bestätigte Abschirmung | Grenzen |
| --- | --- | --- |
| `tests/run-score-sync-browser.cjs` | Temporäres Browserprofil, HTTP-Server ausschließlich `127.0.0.1`, feste Datei-Allowlist; `/test-api/*` verwendet injizierte Memory-DB; DNS-Auflösung im Browser auf Loopback eingeschränkt | Kein produktiver Firebase-Transport in den vorgesehenen Tests; Browser-Flags sind keine vollständige Betriebssystem-Netzsperre. |
| `tests/run-score-screen-browser.cjs` | Generiert lokale Testseite aus ausgewählten Modulen ohne Firebase SDK/Produktionsconfig, temporäres Profil, DNS-Sperrflag, injizierte Tests/Stubs | Testet nicht den normalen `index.html`-Start und nicht V1-Autosync im realen SDK. |
| `tests/score-*.html` | Laden lokale Speicher-/Controller-/Adaptermodule und Testskripte, keine produktive Config/Firebase SDK | Manuelle Testseite ist vom normalen App-Einstieg zu unterscheiden; Änderungen an Testquellen können Sicherheitsannahmen verändern. |
| Server-Unit-Tests | Memory-DB standardmäßig; Read-Tests injizieren Testdaten | Kein Nachweis echter Rules/Callable-Auth. |
| Optionaler Firestore-Emulatortest | Nur bei `SCORE_SYNC_EMULATOR_TEST=1`; verlangt Loopback-`FIRESTORE_EMULATOR_HOST` und `GCLOUD_PROJECT` mit Präfix `demo-` vor `admin.initializeApp` | Schutz ist auf diese Suite beschränkt. |

Die in `PROJECT_STATUS.md` genannten erfolgreichen Testläufe gehören zum vorangegangenen Auftrag. In Phase 1 wurden keine Tests erneut ausgeführt; die Aussagen hier beruhen auf Prüfung der Runner/Testquellen. Es ist kein produktiver Datenzugriff durch die vorgesehenen isolierten Runner erkennbar. Daraus folgt keine Freigabe des normalen App-Starts über Five Server.

## 5. Vorhandene Emulator-Konfiguration

`functions/test/firebase.json` konfiguriert ausschließlich Firestore auf `127.0.0.1:8088`, Rules über `../../firestore.rules`, UI deaktiviert und `singleProjectMode: true`. `functions/test/README-score-sync-v2.md` beschreibt `emulators:exec --config functions/test/firebase.json --project demo-score-sync-v2 --only firestore` mit aktivierter optionaler Suite.

Damit können Admin-SDK-Transaktionen gegen einen lokalen Emulator geprüft werden. **Nicht vorhanden als vollständiger App-Workflow:** gemeinsame Auth-/Functions-/Firestore-Emulatoren, Frontend-Verbindungen, lokaler Mailersatz, zentraler Startschutz und Rules-Clienttests. `singleProjectMode` ist keine Netz- oder Produktionssperre. Die vorhandene Suite testet mit Admin SDK und beweist deshalb keine Client-Rules-Berechtigungen.

Firebase unterscheidet echte Projekte von `demo-`-Projekten. Bei echten Projekten können nicht emulierte Dienste weiter echte Ressourcen ansprechen; für lokale Integration ist deshalb ein synthetisches Demo-Projekt vorzuziehen. Die Projekt-ID muss bei Client, CLI und dienstübergreifenden Tests übereinstimmen. [Offizielle Erläuterung](https://firebase.google.com/docs/emulator-suite/use_hosting).

Auth-/Functions-Anbindung und Admin-SDK-Umgebung sind separat einzurichten; ein Firestore-Emulator allein leitet nicht die gesamte App um. [Auth-Emulator](https://firebase.google.com/docs/emulator-suite/connect_auth), [Functions-Emulator](https://firebase.google.com/docs/emulator-suite/connect_functions), [lokale Functions](https://firebase.google.com/docs/functions/local-emulator). Diese Quellen wurden für die Empfehlung gelesen, nicht als Nachweis lokaler Einrichtung.

## 6. Risikobewertung

| Priorität | Risiko | Einordnung |
| --- | --- | --- |
| Kritisch | Normale lokale App startet gegen produktionsverdächtiges Projekt; schon Loginliste hat Server-Schreibwirkung | Quelltextpfad bestätigt; konkrete Livewirkung abhängig vom Deployment |
| Hoch | V1-Autosync sendet durch Eingabe, Timer oder Reconnect ohne Umgebungsprüfung | Lokaler Code bestätigt; keine Liveausführung |
| Hoch | PIN-Tests und GAS können echte Zugänge/E-Mails betreffen | Code bestätigt; GAS-Innenleben ungeprüft |
| Hoch | Teilweise emulierte Functions mit echtem Projekt/Credentials oder echter GAS-URL | Konkrete Fehlkonfiguration möglich; aktuelle Credentials/Prozesse ungeprüft |
| Hoch | CLI-Standardziel und bestehende Deployment-Anleitung begünstigen falsche Projektwahl | Konfiguration bestätigt; kein Deploy erfolgt |
| Hoch | V1 kann V2-Revisionsgarantien über direkte breite Rules umgehen | Lokale Rules und Schreibpfade bestätigt |
| Mittel | Puffer, Session und Service-Worker am wiederverwendeten Origin vermischen Umgebungen | Speicherformat/Cachepfad bestätigt; kein eingetretener Vorfall belegt |
| Mittel | Five Server bindet alle Interfaces; lokale App eventuell aus LAN bedienbar | Konfiguration bestätigt; Netzwerkfreigabe ungeprüft |

## 7. Empfohlene Zielarchitektur (noch nicht umgesetzt)

Drei ausdrücklich getrennte Modi mit Abbruch bei widersprüchlicher/fehlender Konfiguration:

| Modus | Identität und Daten | Netz / Berechtigung |
| --- | --- | --- |
| Lokal, Standard | `demo-lie-scorecards-local`, synthetische Fixtures; Auth, Firestore, Functions gemeinsam emuliert; GAS durch lokalen Stub ersetzt | Nur Loopback erlaubt; keine Produktions-Credentials; jeder fehlende Emulator führt zum Startabbruch, kein Cloud-Fallback |
| PreProd, bewusst ausgewählt | Neues separates Firebase-/GCP-Projekt, z. B. `<festzulegende-preprod-id>`; eigene Auth-User, Daten, Konfiguration und technische Identitäten | Eigene Domain/Origin und nur PreProd-Berechtigungen; Mailstub oder kontrollierte Testsink; Produktion aus diesem Workflow gesperrt |
| Produktion | Bestehendes Projekt und reale Daten | Eigener expliziter Releaseprozess mit geschützter Freigabe; keine Produktionsrechte im lokalen/PreProd-Deployjob |

Emulatoren sind das Standardwerkzeug für Entwicklung und automatisierte Integration. Das echte PreProd-Projekt dient anschließend SDK-/Deployment-/Gerätetests unter realistischen Cloudbedingungen. Ein separates Firebase-Projekt allein isoliert weder fest verdrahtetes GAS noch Browserpuffer oder versehentlich weiterverwendete Admin-Credentials.

Für Mobilgeräte: zunächst Loopback-Tests per Browseremulation; echte Geräte bevorzugt über getrennte HTTPS-PreProd-Domain. Falls Emulatorzugriff im LAN erforderlich wird, ist dies ein eigener kontrollierter Modus mit Firewall und synthetischen Daten. Unauthentifizierte Emulatoren nicht öffentlich zugänglich machen.

## 8. Konkrete Umsetzungsschritte und sicherer Migrationsplan

Alle folgenden Änderungen sind **Empfehlungen für einen später autorisierten Implementierungsauftrag** und wurden hier nicht ausgeführt.

1. **Arbeitsstand sichern und trennen.** Bestehende Dirty-Dateien unverändert lassen. Implementierung in eigenem Worktree; Status der Feature-/Hotfix-Integration separat entscheiden. Keine Produktions-App zur Bestandsprüfung starten. Bestehende Browserpuffer weder löschen noch in Testumgebungen importieren.
2. **Umgebungsvertrag festlegen.** Zentrale Konfiguration mit Modus, erwarteter Projekt-ID, Auth-Domain, Functions-Region, Emulatorhosts und Mailmodus. Im lokalen Modus Produktions-ID/-Domains explizit ablehnen; auch bereits initialisierte Firebase-Apps prüfen. Keine stillschweigende Defaultwahl aus alter Config. Öffentlich ausgelieferte Konfiguration enthält keine Server-Credentials.
3. **Lokalen Bootstrap implementieren.** Vor jedem Auth-/Firestore-/Callable-Zugriff alle drei Compat-SDK-Dienste auf dieselbe lokale Umgebung schalten. Vorgeschlagene Ports: Auth 9099, Firestore 8088, Functions 5001; App separat auf festem Loopback-Origin. Erreichbarkeit und Moduskonsistenz prüfen, bei Ausfall vor Loginlisten-Aufruf abbrechen. Direkte Functions-Aufrufe aller Adapter müssen dieselbe konfigurierte Instanz verwenden.
4. **Backend absichern.** Lokal nur Demo-Projekt und explizite Emulatorhosts akzeptieren; `FIRESTORE_EMULATOR_HOST` und `FIREBASE_AUTH_EMULATOR_HOST` für Admin SDK prüfen (Host:Port ohne Schema). Produktions-ADC/Service-Account-Zugriff im lokalen Testprozess ausschließen. Für echtes PreProd ausschließlich eigene Runtime-Identität und minimale Rechte. GAS-Abhängigkeit injizieren/konfigurieren, außerhalb Produktion standardmäßig deaktivieren bzw. Stub. Auch lokale Functions dürfen keine echte Mail-URL erreichen.
5. **Testdaten neu erzeugen.** Synthetische Spieler, PINs, Flights, Kurse und HCP-Szenarien seedbar machen. Keine Produktions-Exports, Auth-User, Namen, E-Mails, Avatare, PIN-Hashes, Tokens oder Browserdaten kopieren. Testmail an lokalen Sink; Logs ohne PINs/Tokens. Bereits öffentlich dokumentierte Beispiel-IDs nicht als Seed realer Spieler verwenden.
6. **Persistenz trennen.** Eigener Browser-Origin/Profil je Modus; zusätzlich Projekt-/Umgebungskennung in V1-Puffer und V2-Datenbanken/Schlüsseln prüfen. Alte nicht zuordenbare Pending-Daten nur lesbar/quarantänisiert behandeln und niemals automatisch in anderes Projekt senden. Übernahmeentscheidung explizit und ausschließlich innerhalb derselben belegten Umgebung. Neue Worker-/Cache-Namen pro Umgebung; Konfigurationsaktualität gezielt testen. Vorhandene Puffer nicht automatisch löschen.
7. **Start-/Testworkflow ergänzen.** Ein Wrapper startet Auth, Firestore und Functions mit `--project demo-lie-scorecards-local` und expliziter lokaler Config; erzeugt nur synthetische Fixtures; startet erst danach den lokalen App-Server. Keine Standard-Anmeldung an echte Spieler. Testprozesse mit Loopback-Allowlist einschließlich DNS/IP und überwachten Netzrequests; fehlende Dienste führen zum Fehler. Abbruch/Teardown darf nur eigene Testprozesse und synthetische Testdaten betreffen.
8. **PreProd separat provisionieren.** Nach eigenständiger Freigabe neues Projekt und eigene App/Domain einrichten. Keine Änderung der Produktionsressourcen im Zuge dieser Migration. Nur synthetische Daten und separate Testkonten verwenden. PreProd-Build auf Produktionsziele/GAS-URL prüfen, Tests durchlaufen lassen, erst dann kontrollierte Cloud-Integration testen.
9. **Deployment absichern.** `.firebaserc` nicht mehr mit Produktion als bequemem lokalen Default verwenden; Alias allein reicht nicht. Wrapper/CI müssen `--project <exakte-preprod-id>` plus erwartete Projekt-ID verlangen und Produktions-ID im PreProd-Job ablehnen. Rules und Functions gezielt deployen; Frontend-Artefakt enthält passende Umgebung. Eigene PreProd-Credentials ohne Produktionsrechte, eigener Hosting-Workflow und sichtbares PreProd-Banner. Bisherige README-Befehle entsprechend ersetzen. Produktion später separat mit eigenem Artefakt/Freigabeweg; keine implizite Promotion von Config/Puffern.
10. **Rückfall sicher gestalten.** Bei fehlgeschlagenen Gates lokalen/PreProd-Start oder Rollout stoppen; vorheriges isoliertes Artefakt wiederherstellen. Niemals zur Funktionsfähigkeit auf das Produktionsbackend zurückschalten. Ein fehlender Emulator darf keinen automatischen Cloud-Fallback auslösen. Ein Merge dieser Analyse führt keine Migration aus.

## 9. Erforderliche Tests vor Freigabe der Umsetzung

| Prüfgruppe | Konkrete Akzeptanzkriterien |
| --- | --- |
| Konfiguration / Negativtests | Produktions-ID auf localhost, fehlender Modus, gemischte IDs, bereits falsch initialisierte Default-App oder fremder Host führen vor jedem SDK-Request zum Abbruch. Kein Fallback. |
| Netzwerkbeweis | Normalen App-Start einschließlich Fehler-Fallback, Loginliste, Login/PIN-Fehler, Logout, Reload und Session-Restore prüfen; Browser und Functions-Prozess dürfen lokal ausschließlich erlaubte Loopback-Endpunkte kontaktieren. Kein Aufruf produktiver Firebase-/GAS-Endpunkte. Negativkontrolle muss unerlaubten Request erkennen. |
| Emulatorausfall | Jeweils Auth, Firestore oder Functions abschalten; App verweigert Start/Senden. Kein Token-/Datenabruf aus Cloud. |
| V1 | Eingabe, 1500-ms-Timer, 30-s-Timer, `online`-Event, gespeicherte Pending-Daten, Reload und Benutzerwechsel gegen Emulator testen. Fremde Umgebung/alte ungebundene Puffer senden nie. |
| V2 | Lokale Eingabe bleibt ohne Sender; expliziter Adapter-Read/Write erreicht nur erwartetes Ziel; Retry, Konflikt, Generation, Reload und Kontextwechsel mit synthetischen Daten testen. Bestehende Memory-/IndexedDB-Suites weiterführen. |
| Auth und Callables | Echter SDK-Transport über Auth-/Functions-Emulator mit Custom Token, Claims, Rollen, PIN-Sperre/Migration und Temp-PIN gegen synthetische Spieler; kein externes GAS. |
| Rules | Client-SDK-Tests für anonym/Spieler/Spielleiter/Admin, aktive/beendete Runden, fremde Flights, Sync-Metadaten und private Belege. Gewünschte V1/V2-Schreibpolitik vorab festlegen; Admin-SDK-Tests sind kein Ersatz. |
| HCP / Datenintegrität | Synthetische vollständige/unvollständige 9-/18-Loch-Runden, historische Overrides und Fehler zwischen Batches; Auswirkungen ausschließlich im erwarteten Demo-/PreProd-Projekt. |
| Cache / Umgebung | Service-Worker-Update, Offline/Online, alter V1-Puffer, V2-IndexedDB und bestehende Session bei Umgebungswechsel prüfen; keine automatische Übertragung oder Löschung alter Daten. |
| Deployment-Gates | PreProd-Job mit Produktions-ID, falscher Config oder fremden Credentials muss schon vor Deploy scheitern. Diese Negativprüfung ohne produktiven Deploy durchführen. Artefakt-/Projekt-ID und Rechte getrennt prüfen. |
| Echtes PreProd | Nach Freigabe Cloud-Auth, Functions, Rules, reale Geräte und Wiederanlauf ausschließlich mit synthetischen Konten prüfen. Logs, Projekt-ID und Netzbelege als Ergebnis archivieren. |

Freigabekriterium: Kein lokal/PreProd getesteter Ablauf darf Produktionsziele als erlaubten Ausweichpfad besitzen; erfolgreiche Kernlogiktests allein genügen nicht. Verbleibende externe CDNs/Avatar-/Wetterzugriffe sind ausdrücklich zu erlauben oder lokal zu ersetzen, ohne personenbezogene Testdaten nach außen zu senden.

## 10. Offene Entscheidungen und ungeprüfte Annahmen

- Exakte PreProd-Projekt-ID, Verantwortliche, Region, Kosten-/IAM-Vorgaben und eigene Domain sind noch festzulegen; Projekt wird in Phase 1 nicht angelegt.
- Der aktuelle Livezustand von `liescorecard-70c5e`, autorisierte Auth-Domains, API-Key-Beschränkungen, ausgerollte Rules/Functions und tatsächliche Produktionsdomain wurden nicht verifiziert. Solche Beschränkungen wären zusätzliche Hürden, kein Ersatz für Isolation.
- Lokale Credentials, Cloud-/CLI-Loginstatus, Umgebungsvariablen, laufende Emulatoren, offene App-Tabs und Firewallzustand wurden nicht aufgerufen/ausgelesen. Es wird weder ihre Existenz noch ihr Fehlen behauptet.
- GAS-Quellcode und angebundene Datenquelle/Empfänger sind nicht bekannt. Entscheidung: ausschließlich Stub/Sink für Tests oder eigene vollständig getrennte GAS-Instanz; produktives GAS ist kein zulässiges PreProd-Ziel.
- Ob und wann V1-Direktschreiber abgelöst werden, muss vor Verschärfung der Rules entschieden werden. V2-Revisionsschutz und Umgebungstrennung sind separate Freigabepunkte.
- Umgang mit vorhandenen ungebundenen Browser-Pending-Daten benötigt eine bewusste Entscheidung; automatisches Löschen oder Übertragen ist nicht vorgesehen.
- Java-/Firebase-CLI-Verfügbarkeit und Emulator-Kompatibilität wurden nicht ausgeführt geprüft. Toolversionen für die Umsetzung festlegen und reproduzierbar dokumentieren.
- Keine Aussage, dass bereits produktiv geschrieben wurde: festgestellt wurden erreichbare Codepfade und fehlende technische Schutzgrenzen, kein nachgewiesener Vorfall.

## Prüfprotokoll dieser Phase

Gelesen: `docs/PROJECT_STATUS.md`, Git-Branch/HEAD/Status/Worktrees, `.firebaserc`, `config.js`, `firebase.json`, relevante App-Initialisierungen/Schreibpfade, `functions/index.js`, `firestore.rules`, Emulator-Testkonfiguration, Test-Runner und zugehörige Testquellen/READMEs. Offizielle Firebase-Dokumentation wurde nur für die Zielarchitektur herangezogen. Keine App-, Emulator- oder Produktionsschreibtests ausgeführt. Für den Dokumentations-PR wird der Diff gegen `main` auf genau diese Datei und Whitespacefehler geprüft; der ursprüngliche Feature-HEAD und dessen bestehender Diff werden abschließend erneut verglichen.
