# Mission Samstag – drei Smartphones über Mobilfunk

Stand: 12.11.2026. **Vorbereitung, keine angelegte oder freigegebene Online-Umgebung.** Keine produktiven Zugriffe, Migrationen, Projektanlage, Deployments oder Merges. Die funktionierende V2-Score-Eingabe und ihr Synchronisationsvertrag bleiben erhalten. Android/iPhone gemischt sind vorgesehen; tatsächliche Geräte und Safari-Verhalten sind noch ungeprüft.

## Implementierter Startadapter und verbleibende Freigaben

Ziel ist das bereits vorgeschlagene, eigenständige Firebase-Projekt **`lie-scorecards-preprod`** mit Firebase Hosting unter **`https://lie-scorecards-preprod.web.app`**, Functions in `europe-west1`, eigener Auth, eigenem Firestore und ausschließlich synthetischen Spielern. Projekt-/Subdomain-Verfügbarkeit wurden nicht abgefragt. Die Standard-Subdomain ist verbindlich; kein Produktions-DNS, keine eigene Domain, kein Tunnel in lokale oder produktive Firebase-Dienste.

Die lokale Konfigurationsvorlage steht in [config/fieldtest/proposal.json](../config/fieldtest/proposal.json); das bestehende [Hosting-Konzept](../config/preprod/hosting/firebase.proposal.json) und die [PreProd-Policy](../config/preprod/policy.json) bleiben unverändert und gesperrt. Offline prüfen:

```powershell
node tools/preprod/fieldtest-review.cjs
```

Der Prüfer kann weder eine Cloud-Verbindung herstellen noch etwas bereitstellen. Sein Ergebnis muss `cloudExecutionAuthorized:false` und `onlineReady:false` enthalten. Die Vorlage enthält keine PINs, Tokens, privaten Schlüssel oder angeblich gültigen Firebase-Web-App-Werte.

**Implementiert und lokal geprüft:** Der Quell-Checkout und `npm run rc` bleiben **local-demo** (intern weiterhin `mode:local`), mit unverändertem `App_Environment.js`, `config.js`, Demo-Projekt und Loopback-Guard. Das gesondert erzeugte PreProd-Artefakt lädt dagegen `App_PreprodEnvironment.js` und `preprod-profile.js`. Dieser Adapter akzeptiert ausschließlich `mode:preprod`, das oben genannte Projekt, dessen exakte HTTPS-Origin und `europe-west1`. Unbekannte Projekte, HTTP, Emulator-Einstellungen, vorinitialisierte SDK-Instanzen und aktive alte Service Worker werden abgewiesen. Kein Produktions- oder Local-Fallback. Die gemeinsame Startdatei lehnt gleichzeitig gesetzte Profile ab; `/__local/ready` wird nur im lokalen Modus aufgerufen.

`App_PreprodBindings.js` gibt den bestehenden V2-Storage-/Context-Factories explizit `…__preprod:lie-scorecards-preprod` als Datenbanknamen. Die V2-Quelldateien bleiben unverändert. Die bisherige lokale Store-Instanz ist beim Laden noch ungeöffnet; keine Queue wird gelesen, migriert, gelöscht oder verworfen. V1-Schreiber bleiben gesperrt. Externe Spiel-Links werden nur im erzeugten PreProd-Artefakt deaktiviert; Score-Eingabe und Scoreboard werden unverändert kopiert.

`functions/runtime.js` wählt den Modus ausdrücklich vor der SDK-Nutzung. Lokal bleiben synthetische Credential und Loopback-Netzwerkschutz bestehen. PreProd validiert Projekt/Umgebungsvariablen, verweigert Credential-Dateien/Tokens und Emulatorvariablen und bindet jede Function an **`fieldtest-runtime@lie-scorecards-preprod.iam.gserviceaccount.com`**. Admin-SDK/ADC werden erst im tatsächlichen Cloud-Run-Request mit `K_SERVICE` und `K_REVISION` initialisiert, niemals beim lokalen Functions-Discovery. Es werden keine privaten Schlüssel erzeugt oder mitgeliefert. Cloud-SDK-Verkehr nutzt dessen regulären HTTPS/gRPC-Transport; die lokale Socket-Monkeypatch wird nicht in Cloud übernommen. Projektbindung und geprüfte Runtime-IAM verhindern einen Produktionszugriff; tatsächliche IAM-Vererbung muss vor Freigabe geprüft werden.

Die PreProd-Request-Grenze erlaubt nur die vorhandenen Auth-, Rundenstart-, V2-Schreib-/Leser-, Saisonlese- und Abschluss-Callables. Anmeldeliste und Zugänge sind auf MS01/MS05/MS09 begrenzt. Ohne Scrypt-Hash sowie mit vierstelligen oder bekannten einfachen PINs wird der Login schon vor dem bestehenden Handler abgewiesen; neue PINs müssen ebenfalls sechsstellige, nicht gesperrte Werte sein. Mail-/Temp-PIN- und historische Korrektur-Callables sind im Feldtest gesperrt. Die fachlichen Handler und HCP-/Rundenschlussmodule bleiben unverändert. Das bestehende offline-only `tools/preprod/gate.cjs.execute()` bleibt weiterhin grundsätzlich gesperrt: der neue Builder ist kein Deployment-Tool.

### Getrennte öffentliche Firebase-Konfiguration

`config/preprod/runtime.example.json` nach `config/preprod/runtime.local.json` kopieren. Die Kopie ist gitignoriert. **Erst nach Projektfreigabe** darin ausschließlich die öffentlichen Firebase-Web-App-Werte des neuen Testprojekts eintragen: `apiKey`, `appId`, `messagingSenderId`, gegebenenfalls dessen tatsächlichen neuen/alten Storage-Bucket-Namen. Projekt, Origin, Region und Auth-Domain sind fest gebunden. Keine Service-Account-JSONs, PINs, Passwörter oder Tokens eintragen. Die Beispielkonfiguration mit `null`-Werten wird absichtlich nicht gebaut. Offline ist die Eigentümerschaft eines Web-API-Keys nicht beweisbar; sie muss später in der Konfiguration des ausdrücklich genehmigten Testprojekts überprüft werden.

Lokal und ohne Firebase-/Cloud-Aufruf paketieren:

```powershell
# Arbeitsverzeichnis: .codex-rc-live-worktree, Node22, Lockfile-Abhängigkeiten installiert
if (Test-Path config/preprod/runtime.local.json) { throw 'Vorhandene Konfiguration unverändert lassen.' }
Copy-Item config/preprod/runtime.example.json config/preprod/runtime.local.json
# Öffentliche Web-App-Werte später privat in der Kopie ergänzen; keine Geheimnisse.
node tools/preprod/build.cjs config/preprod/runtime.local.json .local-runtime/preprod-release-01
node tools/preprod/check-artifact.cjs .local-runtime/preprod-release-01
```

Das Ausgabeziel muss ein frisches leeres Verzeichnis innerhalb dieses Worktrees unter `.local-runtime` sein. Bestehende Ausgaben werden nicht überschrieben. Das Paket enthält ausschließlich benötigte Web-/SDK-/Vendor-Assets, Functions ohne `node_modules` oder lokale `.env.local`, eine öffentliche `functions/.env.lie-scorecards-preprod` mit `LIE_MODE=preprod`, die **unveränderten** Firestore-Regeln, `firebase.json` und einen SHA256-Dateibeleg `ARTIFACT.json`. Keine `.firebaserc`, Quell-Worktrees, Tests, Backups oder privaten Konfigurationen werden veröffentlicht. `check-artifact` entdeckt veränderte oder zusätzliche Dateien; der Digest muss extern gegen den genehmigten Reviewstand verglichen werden, ist selbst keine signierte Freigabe.

Hosting bindet die eigene Standard-Site, `Cache-Control:no-store`, eigene Assets, erforderliche Firebase-Dienste und genau die PreProd-Functions-Origin. GAS, fremde Frames, externe Bilder und Worker bleiben durch CSP gesperrt. Die öffentliche Firebase-API-Domain ist projektübergreifend; erst die geprüfte Web-Konfiguration, Runtime-Projektbindung, Auth/Rules und IAM ergeben die Projekttrennung.

## Zugang für genau drei ausgegebene Test-Schreiber

Eine frische synthetische Saison mit zwölf Spielern, synthetischem 18-Loch-Kurs samt gültigen Vorgabentabellen und einer über die normale UI angelegten **9-Front-Runde** verwenden. Keine Scorecard-/Auth-Exporte aus Produktion oder aus fremden Emulatoren importieren. Die Start-Snapshots entstehen durch `createRoundStart`; keine vorab aktive Demo-Runde erzeugen.

| Smartphone | Ausgegebener Zugang | Flight | Rolle |
| --- | --- | --- | --- |
| A | MS01 | MS01–MS04 | Admin / Abschluss |
| B | MS05 | MS05–MS08 | Spielleiter |
| C | MS09 | MS09–MS12 | Spieler |

Diese Aufteilung bei der Rundenerstellung **manuell** setzen und prüfen; eine Zufallsauslosung garantiert sie nicht. Jedes Gerät schreibt nur seinen Flight. Drei Schreiber sind die Betriebsvereinbarung, keine vorhandene serverseitige Drei-Geräte-Quote.

Notwendige Zugangsvorbereitung nach Freigabe:

1. Für **alle zwölf Spieler** unabhängige zufällige sechsstellige PINs mit kryptographischer Zufallsquelle erzeugen. Nur Salt/Scrypt-Hash im privaten `spieler`-Dokument speichern; keine Klartext- oder bekannten Demo-/Initial-PINs verwenden. Ohne Hash kann der bestehende Login eine bekannte Legacy-Initial-PIN akzeptieren; deshalb darf **kein** synthetischer Spieler ohne privaten Hash online gehen.
2. Nur die drei individuellen Schreiber-PINs persönlich über einen getrennten privaten Kanal aushändigen. Keine PIN in Repository, Manifest, Screenshot, URL, Cloud-Log oder öffentlicher Anleitung. Die übrigen neun Zugänge nicht ausgeben. Niemals `rc-fixture.seed()` mit seiner bekannten lokalen Fixture-PIN für Cloud-Daten verwenden.
3. Eigene Auth-UIDs/Custom-Claims nur im Testprojekt: `uid === playerId`, korrekte Rolle, konsistenter PIN-Wechselstatus in Firestore und Claims. Public-Projektion ohne Hash oder PIN. Rollenwechsel oder Sperren müssen auch über Claims wirksam werden; echte produktive Accounts oder Identitäten nicht übernehmen.
4. Vor Hosting-Freigabe gezielt nachweisen: falsche PIN abgewiesen, bestehende Login-Fehlversuchssperre greift, bekannte Demo-/Initial-PINs scheitern bei allen zwölf Spielern, kein Zugriff ohne gültige Anmeldung, keine direkten Score-Schreibrechte, kein fremder Flight im normalen V2-Pfad. Die vorhandene Fehlversuchssperre ist kein nachgewiesener Schutz gegen alle verteilten Angriffe; die Freigabe muss die öffentliche PIN-Oberfläche bewerten.
5. Die URL ist kein Zugangsschutz, eine erlaubte Auth-Domain ebenso wenig. Firebase-Web-Konfiguration ist öffentlich; Schutz erfolgt über Auth, serverseitige Prüfungen und Rules. App Check, soweit für die gewählte Web-/Callable-Konfiguration passend, gesondert konfigurieren und gezielt prüfen; keine Debug-Tokens veröffentlichen. [Firebase zu API-Keys und Schutzgrenzen](https://firebase.google.com/docs/projects/api-keys).

Mail und Google Apps Script bleiben abgeschaltet. Keine öffentliche Selbstregistrierung, kein SMS-Versand, keine PIN-Ausgabe über E-Mail/GAS. Der Betreiber behält ein ausschließlich für dieses Testprojekt gültiges Recovery-Verfahren und widerruft nach Testende die drei Test-Sitzungen. Keine automatischen Geräte-/Pending-Löschungen.

## Bereitstellung – erst nach gesonderten Freigaben

1. **Projekt-/Kostenfreigabe:** konkrete Projekt-ID, Region, Testzeitraum, Eigentümer und Billing-Verantwortlichen bestätigen. Erst danach eigenes Cloud-/Firebase-Projekt und Billing anlegen. IAM-Vererbung prüfen: Runtime- und Bereitstellungsidentitäten erhalten keinerlei Zugriff auf Produktion. Keine produktiven Service-Account-Dateien oder Default-Credentials verwenden.
2. **Konfigurationsfreigabe:** Web-App-Werte ausschließlich aus dem neuen Testprojekt, genehmigte Origin, Auth-Domain, HTTPS-Callable-URLs, Projekt, Region und Service-Account müssen übereinstimmen. Kein Standard-Projekt-Alias. Dauerhaft sichtbarer Banner **PREPROD — SYNTHETIC TEST DATA**, eigener Storage-Namespace `preprod:<projectId>`, neue Origin und eigener Browserkontext. Legacy-Buffer nicht übernehmen, Service Worker weiterhin aus; keine Produktions-Caches migrieren.
3. **Artefaktfreigabe:** mit dem implementierten Builder und den geprüften echten öffentlichen Web-Werten ein eigenes Paket erstellen und dessen SHA256-Beleg prüfen. Es enthält `/__vendor/…` und `/__sdk/…` tatsächlich; der alte Hosting-Vorschlag bleibt historische Planungsreferenz. Keine PIN-Hashes oder privaten Daten im Hosting-Artefakt. Die öffentliche Functions-`.env.<projekt>` enthält nur den Modus, keine Geheimnisse.
4. **Explizite Deployment-Freigabe:** Regeln, Functions und Hosting getrennt gegen den konkreten Artefakt-Digest und das Testprojekt prüfen und genehmigen. Regeln zuerst, sichere Functions mit dedizierter Runtime-Identität danach, Hosting zuletzt. Erst nach diesen Freigaben bereitstellen. Die hier vorhandenen Offline-Gates werden nicht zur Cloud-Ausführung umfunktioniert.
5. **Synthetische Initialisierung:** nur leeres Testprojekt befüllen, Hashes/Claims wie oben prüfen, keine alte Runde/Scorecards importieren. Gezielt genau einen Anmelde-/Rundenstart-/Score-/Live-Aufruf prüfen und dann die drei Geräte einladen. Bei fehlender Gerätefreigabe oder unsicheren Claims bleibt der Feldtest gesperrt.

## Einfacher Feldablauf – neun Löcher

Vor dem Losgehen alle drei Geräte über Mobilfunk auf der **genehmigten Test-URL** anmelden. Sichtbaren Testbanner, richtigen Spieler und richtigen Flight prüfen. Normale Browser-Tabs mit beständigem Speicher verwenden, keinen privaten Modus und keine Produktions-Tabs. Eine neue Seite kann offline derzeit nicht zuverlässig gestartet werden: den vorbereiteten Tab offen lassen, während Offline-Eingabe weder neu laden noch abmelden oder Browserdaten löschen.

| Zeitpunkt | Aufgabe | Erwartung |
| --- | --- | --- |
| Start | MS01 legt 9-Front an, manuelle Flights wie oben. Alle öffnen „Mein Flight“. | Zwölf Start-Snapshots, drei richtige Flights. |
| Loch1–2 | Jeder Schreiber erfasst vier synthetische Spieler. Einer betrachtet danach das Live-Scoreboard. | Bestätigte Rohscores/Netto entsprechen der Eingabe; neue Bestätigungen erscheinen ohne F5. Laufende Rangfolge ausdrücklich vorläufig. |
| Loch3 | Nur Gerät B: Flugmodus, Schläge/Putts für seine vier synthetischen Spieler ändern. | „Lokal gespeichert/offline“, keine Serverbestätigung. Andere Geräte zeigen diese Änderungen noch nicht. |
| Wieder online | Mobilfunk B aktivieren, Tab geöffnet lassen und Synchronisation abwarten. | „Serverbestätigt“, nichts ausstehend. Die Rangliste übernimmt dieselben Werte automatisch. |
| Loch4–8 | Normal fortsetzen. Bei Konflikt sofort Pause, aktuellen Serverstand vergleichen. | Kein stilles Überschreiben, keine lokale Pending-Löschung. |
| Loch9 | Alle neun Löcher für alle zwölf Spieler bestätigen. Auf jedem Gerät ausstehend0, keine Konflikte, keine unklaren Requests prüfen. | 108 Spieler-Loch-Scorecards. Gleiches Netto in Score-Eingabe, Rangliste und Rundenschluss. |
| Abschluss | MS01 öffnet Abschlussfenster. Jeder Flight prüft persönlich alle verwendeten Geräte und gibt den aktuellen Stand frei. MS01 bestätigt erst nach drei Freigaben. | Genau ein offizieller Netto-Abschluss, einmalige HCP-Fortschreibung; Brutto/Putts nicht veröffentlicht. |

Wenn Mobilfunk fehlt: Eingaben im offenen Tab belassen und später online synchronisieren. Bei Datenabweichung, unklarem Status, falschem Projektbanner, fehlendem Geräteabgleich oder Loginproblem **keinen Abschluss bestätigen**. Falls bereits ein Abschlussfenster geöffnet ist, durch die Spielleitung abbrechen, dann synchronisieren. Nicht mehrfach blind bestätigen, nicht in Produktion ausweichen, keine App-Daten löschen. Ein zweiter Schreiber desselben Flights wird nicht absichtlich für diesen einfachen Feldtest eingesetzt.

Ein einziges kurzes Protokoll genügt: Gerät/Browser, Flight, Loch, lokaler Status, bestätigter Serverwert, Live-Netto, Abschluss-Netto; Screenshots nur synthetisch und ohne PINs/Tokens. Physische Geräte, iOS-Speicherverhalten, reale Mobilfunklatenz und Hintergrundverhalten sind erst bei diesem Feldtest bestätigt.

## Kosten und Ende des Tests

Cloud Functions erfordern einen **Blaze-/Billing-Zugang**. Hosting, Firestore, Function-Aufrufe/Rechenzeit, Build-/Artefaktspeicher und ausgehender Traffic können Kosten verursachen; auch kleine Tests sind nicht pauschal kostenlos. [Firebase-Tarife](https://firebase.google.com/docs/projects/billing/firebase-pricing-plans), [aktuelle Preisliste](https://firebase.google.com/pricing/).

Die Live-Ansicht lädt derzeit zwei bestehende autoritative Leseverträge im Abstand von fünf Sekunden nach Abschluss des vorherigen Abrufs. Bei drei dauerhaft offenen Ranglisten und 30Minuten sind höchstens ungefähr **2160 Callable-Aufrufe** aus diesem Polling zu erwarten (ohne Retries, Login, Score-Sync und Abschluss). Nahe vollständiger Runde lesen diese Verträge Größenordnung 350 Dokumente pro Aktualisierung inklusive Generation-Bindings: im ungünstigen Rechenbeispiel rund **378000 Dokumentlesungen**. Das ist eine konservative Volumenrechnung, keine gemessene Cloud-Nutzung oder Kostenprognose; tatsächlich hängt es von Sichtdauer, Latenz, Datenumfang und Retries ab. Die Rangliste nur zum Beobachten offen halten und nach dem Vergleich schließen; keine unbegrenzte Test-Saison aufbauen.

Vor Freigabe Budgetverantwortlichen und beispielsweise **5€ Planungsbudget** mit Warnungen bei50/80/100% bestimmen; dies ist ein Vorschlag, keine eingerichtete Obergrenze. Alerts-only-Budgets unterbrechen Dienste nicht. Nach aktueller Firebase-Dokumentation sind servicebezogene Spend Caps unter anderem für Cloud Functions verfügbar, aber keine allgemeine Kostengarantie für Firestore/Firebase Hosting. Verfügbarkeit/Abdeckung im neuen Projekt vor Freigabe prüfen. [Budgetwarnungen und Grenzen](https://firebase.google.com/docs/projects/billing/budget-alerts).

Nach dem Feldtest zuerst alle drei Geräte online synchronisieren und protokollieren; anschließend Testzugänge widerrufen, Testhosting offline nehmen oder auf eine geschlossene Hinweisseite zurücksetzen und Functions/IAM des Testprojekts nach genehmigtem Betriebsplan sperren. Kein Rollback durch Löschen lokaler Eingaben. Synthetische Daten nur nach abgeschlossener Auswertung und gesonderter Löschentscheidung entfernen. Kein Rückfall oder Datenimport in Produktion.

## Noch ausdrücklich offen

Projekt-/Subdomain-Verfügbarkeit, Cloud-Projektanlage, echte öffentliche Web-Konfiguration, Budget/IAM, private Erzeugung/Verteilung der PINs, Cloud-Claims, Zugriffsprüfung, Artefakt-/Bereitstellungsfreigabe sowie tatsächliche drei Smartphones. Der Adapter und die lokale Paketierung sind implementiert; ein mit echten Werten genehmigtes Release-Artefakt ist noch offen. **Es existiert aus diesem Auftrag noch keine online nutzbare Test-URL.** Öffentliche Firebase-Dokumentation wurde gelesen; keine Projektkonsole und keine Firebase-Projektdaten wurden aufgerufen.

## Konkrete Freigabe-Checkliste

- [ ] **Eigenständiges Projekt:** `lie-scorecards-preprod`, noch ungeprüfte Verfügbarkeit; Firestore Native/(default) in der genehmigten Region (Vorschlag `europe-west1`), Auth und eigene Web-App, Firebase Hosting Standard-Site, Functions2ndgen/Node22. Keine produktiven Daten, Aliase oder Identitäten.
- [ ] **Dienste/Billing:** Blaze/Billing und Testbudget genehmigt; Cloud Functions, Cloud Run, Cloud Build, Artifact Registry, Firestore, Identity Toolkit/Firebase Auth und IAM Service Account Credentials API aktiviert. Kein SMS-/Mailversand, kein GAS. Aktivierung/Regionseinstellungen erfolgen erst nach gesonderter Ressourcenfreigabe.
- [ ] **Runtime-Identität:** dedizierten Account `fieldtest-runtime@lie-scorecards-preprod.iam.gserviceaccount.com` anlegen; Datastore User und Firebase Authentication Admin ausschließlich am Testprojekt; `iam.serviceAccounts.signBlob` über Service Account Token Creator ausschließlich auf dem eigenen Signierkonto. Keine Produktions-/Organisation-Rechte, keine privaten Schlüssel. [Firebase: Custom-Token-Signierung und erforderliche Rechte](https://firebase.google.com/docs/auth/admin/create-custom-tokens).
- [ ] **Bereitsteller:** eigene nur für dieses Projekt genehmigte Identität; Funktionen/Cloud-Run-Bereitstellung, Hosting-Admin und Firebase-Rules-Bereitstellung sowie `iam.serviceAccounts.actAs` auf genau den Runtime-Account. Cloud-Build-/Artifact-Registry-Service-Agents und geerbte Rollen mit prüfen. Kein pauschaler Produktions-Owner-Zugang, keine Credential-Datei im Worktree. Firebase CLI darf erst nach Freigabe mit dieser Identität authentifiziert werden.
- [ ] **HTTP/Auth:** Login-Callables müssen auf Plattformebene erreichbar sein; Authentifizierung/Berechtigungen der übrigen Aufrufe bleiben anwendungsseitig erzwungen. Auth-Authorized-Domains nur eigene `.web.app`/`.firebaseapp.com`; anonyme, E-Mail-/Passwort- und öffentliche Selbstregistrierung nicht aktivieren. Kein App-Check-Debugtoken veröffentlichen; gewünschte Enforcement-Konfiguration vor Freigabe separat abstimmen.
- [ ] **Synthetische Konten:** zwölf private Spieler-/Public-Projektionen, ausschließlich synthetische Namen/Kurs/Vorgaben/Saison; pro Spieler neuer Scrypt-Salt und zufällige sechsstellige PIN, bekannte einfache Werte ausschließen. Nur drei PINs privat ausgeben: MS01/Admin, MS05/Spielleiter, MS09/Spieler. Andere neun bekommen keine ausgegebenen Zugänge; PreProd-Callables lehnen diese UIDs zusätzlich ab. Auth-UID/`playerId`, Rolle und `mustChangePin` müssen konsistent sein. Keine `rc-fixture.seed()`-PIN übernehmen. Kontoanlage und Claim-Prüfung sind noch nicht ausgeführt und benötigen eine eigene Freigabe für synthetische Schreibzugriffe im Testprojekt.
- [ ] **Kosten:** Funktions-Billing/Blaze erforderlich; Runtime `maxInstances:1` gilt **je Function**, nicht für das ganze Projekt. Derzeit elf exportierte Callables; die beiden gesperrten Fachfunktionen nehmen keine Arbeit auf. Keine Mindestinstanzen angefordert. Hosting/Firestore/CPU/Aufrufe/Build-/Artefaktspeicher können Kosten verursachen. Das oben genannte5€-Budget ist nur ein genehmigungspflichtiger Planungswert, keine Kostenprognose oder harte Gesamtgrenze. Tatsächliche Rate/Free-Quotas und Budget-/Spend-Cap-Abdeckung im neuen Projekt prüfen. [Functions-Runtime-Optionen](https://firebase.google.com/docs/functions/manage-functions?gen=2nd).
- [ ] **Release:** echte öffentliche Web-Werte zu genau diesem Projekt belegt; `ARTIFACT.json`-Digest und Datei-Inventar geprüft; Rules unverändert; neue Bootstrap-/Zugangsgrenzen geprüft; keine Secrets/PII im Hosting. Die nachstehenden drei Bereitstellungsschritte je Komponente ausdrücklich genehmigt.

### Genaue Deployment-Befehle – vorbereitet, NICHT ausgeführt

Diese Befehle ändern Cloud-Ressourcen. Sie dürfen erst nach ausdrücklicher Freigabe von Projekt, Identität, Artefakt-Digest und jeweiliger Komponente ausgeführt werden. Kein `firebase use`, kein Standard-Alias, kein `--force`.

```powershell
# Im Worktree, nachdem ein mit echten Web-Werten geprüftes Paket vorliegt:
$fieldProject = 'lie-scorecards-preprod'
$fieldDeployer = 'HIER_FREIGEGEBENES_TESTKONTO_EINTRAGEN'
if ($fieldDeployer -notmatch '@') { throw 'Freigegebene, in Firebase CLI angemeldete Test-Identitaet explizit setzen.' }
$fieldArtifact = (Resolve-Path '.local-runtime/preprod-release-01').Path
$fieldCli = (Resolve-Path 'node_modules/firebase-tools/lib/bin/firebase.js').Path
node tools/preprod/check-artifact.cjs $fieldArtifact

# Nur lokale Installation der festgeschriebenen Functions-Abhängigkeiten:
npm --prefix "$fieldArtifact/functions" ci --ignore-scripts --no-audit --no-fund

# Erst mit freigegebener Bereitsteller-Identität, nach Einzelgenehmigungen:
node $fieldCli deploy --account $fieldDeployer --project $fieldProject --config "$fieldArtifact/firebase.json" --only firestore:rules
node $fieldCli deploy --account $fieldDeployer --project $fieldProject --config "$fieldArtifact/firebase.json" --only functions:preprod-fieldtest
# Sichere synthetische Konten/Claims wie oben separat genehmigen und prüfen.
node $fieldCli deploy --account $fieldDeployer --project $fieldProject --config "$fieldArtifact/firebase.json" --only hosting
```

Die Reihenfolge ist Rules → Functions → geprüfte private synthetische Initialisierung → Hosting. Falls der angeforderte Projekt-/Site-Name nicht verfügbar ist, **nicht auf einen anderen Alias ausweichen**: Guard, Konfiguration und Review müssen für den neuen konkreten Namen angepasst werden. App-Start oder Cloud-Anmeldung wurden nicht gegen echte Dienste getestet. Der erste genehmigte Online-Check beschränkt sich auf Login, Rundenstart, einen Score und dessen Live-Anzeige; danach der oben beschriebene Neun-Loch-Feldablauf.

### Abschaltung / Rückfall – ebenfalls nur nach Freigabe

Zuerst alle drei Geräte online abgleichen und Pending0 protokollieren. Dann die Test-Auth-Konten über einen genehmigten Admin-Zugang deaktivieren und Refresh-Tokens widerrufen. Sperrwirkung bereits ausgegebener ID-Tokens beachten; Functions und Hosting anschließend gezielt abschalten. Keine lokalen Queues löschen und keine Daten nach Produktion übertragen.

```powershell
# Nach ausdrücklich genehmigter Abschaltung; Variablen wie oben:
node $fieldCli hosting:disable --account $fieldDeployer --project $fieldProject --site $fieldProject --config "$fieldArtifact/firebase.json"
node $fieldCli functions:delete getLoginPlayers verifyPlayerPin getPlayerSessionState updatePlayerPin requestTempPin readOwnFlightScoresV2 saveScoreOperationsV2 readPublishedSeasonV1 roundClosureV1 createRoundStart historyCorrectionV1 --account $fieldDeployer --project $fieldProject --region europe-west1 --config "$fieldArtifact/firebase.json"
```

Ein Hosting-Abschalten allein stoppt keine gespeicherten Tabs oder API-Aufrufe. Runtime-Berechtigungen/Custom-Token-Signierrechte des Testprojekts nach Freigabe entziehen; Regeln und synthetische Daten zunächst für die Auswertung erhalten. Vorheriges **freigegebenes PreProd-Artefakt** kann nach Kompatibilitätsprüfung mit denselben expliziten Projekt-/Config-Argumenten erneut bereitgestellt werden; kein Produktions-Rollback. Projekt-, Firestore- oder Artefaktlöschung ist nicht Bestandteil dieses Plans und benötigt eine gesonderte Entscheidung. Auch bei abgeschalteter App können Speicher-/Artefaktkosten verbleiben.

## Lokal bestätigter Adapter-Nachweis

Basis `76df958`, derselbe Worktree/Branch, keine andere Checkout-Änderung. Zuerst sechs neue Adaptertests reproduzierbar rot; anschließend **58/58 gezielte Prüfungen grün**:

```powershell
node --test tests/preprod-start-adapter.test.cjs tests/local-environment.test.cjs functions/test/pin-s04.test.js tests/fieldtest-proposal.test.cjs
```

Davon zwölf neue Adapterprüfungen, dreizehn vorhandene Local-Start-/Guard-Prüfungen, einunddreißig bestehende Auth-/PIN-Prüfungen wegen der geänderten Start-/Callable-Verdrahtung und zwei Offline-Vorlagenprüfungen. Keine allgemeine UI-/Saison-Testkampagne. Der neue Paket-Test wurde nach der Beschränkung auf das tatsächlich benötigte Logo erneut erfolgreich ausgeführt.

Bestätigt: PreProd-Browserstart bis Login mit SDK-Stubs, alle benötigten Callable-Namen/Regionen, keine Emulatoraufrufe oder Local-Probes im PreProd-Adapter, getrennte V2-Datenbanknamen ohne Quelländerung, Ablehnung falscher Projekt-/Origin-/Credential-/Emulator-Konfigurationen, drei erlaubte Schreiber und Hash-/PIN-Gates, unveränderte lokale Startfähigkeit und Auth-Verträge. Echte Firebase-Functions-SDK-Discovery wurde in einem separaten lokalen Prozess mit blockierten Cloud-Sockets und verbotener Admin-/ADC-Initialisierung geprüft; sie liefert die vorgesehene Runtime-Service-Account-Bindung, ohne einen Cloud-Aufruf auszuführen. Paketierung verwendet synthetische öffentliche Konfigurationswerte; fehlende Werte, falsche Ausgabeziele und manipulierte Paketdateien werden abgewiesen. Die Kopie der Rules und der V2-Senderdatei ist bytegleich.

Ein abschließender Git-/Hash-Abgleich bestätigt unveränderte Score-Eingabe, Synchronisations-/Storage-/Controller-Quellen, Live-Ansichten, HCP-/Rundenschluss-/Score-Vertragsmodule, Firestore-Regeln und lokale Guards gegenüber `76df958`. Alle20 anderen Worktrees blieben in HEAD, Status und ursprünglichen Dirty-Datei-Hashes unverändert. Kein Push, Merge, Deployment, Projektanlage oder produktiver Zugriff.

**Ungeprüft:** echtes PreProd-Projekt, Web-API-Key-Eigentümerschaft, tatsächliche Runtime-/Deployer-IAM, Cloud-Token-Signierung, Cloud-Netzwerk/Quotas, Daten-/Claims-Initialisierung und physische Smartphones. Diese Punkte werden nicht aus SDK-Stubs oder Discovery abgeleitet. Das Offline-Review meldet weiterhin `onlineReady:false` und `cloudExecutionAuthorized:false`.
