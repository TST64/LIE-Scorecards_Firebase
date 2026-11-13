# Phase 2B/2C: eigenständiges Firebase-PreProd vorbereiten

Stand: 08.11.2026, Europe/Berlin. Auftrag: [Issue #6](https://github.com/TST64/LIE-Scorecards_Firebase/issues/6); Abhängigkeiten: Sicherheitsanalyse [PR #3](https://github.com/TST64/LIE-Scorecards_Firebase/pull/3), lokaler Reviewstand [Draft-PR #5](https://github.com/TST64/LIE-Scorecards_Firebase/pull/5). Ausschließlich lokale Vorbereitung. **Keine Projektanlage, Cloud-Bestandsprüfung, IAM-/Billing-/DNS-Änderung, Datenmigration, Deployment oder Merge autorisiert oder ausgeführt.**

Phase-2C-Ergänzung zu [Issue #8](https://github.com/TST64/LIE-Scorecards_Firebase/issues/8): **Firebase Hosting im eigenen künftigen PreProd-Projekt mit Standard-Subdomain ist entschieden.** Kein anderer Host, keine Custom-Domain und keine DNS-Änderung. Die abgeleitete Plan-URL `https://lie-scorecards-preprod.web.app` ist nicht als existent oder aktiv bestätigt. Vollständiger Hosting-Vertrag und spätere Freigaben: [PHASE2C_HOSTING_PLAN.md](PHASE2C_HOSTING_PLAN.md).

## 1. Bestätigte Basis und Abgrenzung

- Neuer Worktree `.codex-phase2b-worktree`, Branch `codex/preprod-cloud-preparation`, basiert exakt auf Phase 2A `06dbe619beb8494d7abd194cc76cace448e37a5e`.
- Der unveränderte ursprüngliche Entwicklungs-Worktree steht auf `feature/score-autosync` bei `cb4661f5194147fa0ef0f40fe44838ce3d0aa19e`. Dort bereits geändert: `App_Logic_Bridge.js`, `App_Logic_Scores.js`, `App_Logic_Spieltage.js`, `Views_ScoreSchnellerfassung.js`, `config.js`, `sw.js`. Vorhandene unversionierte Einträge: `design-reference/`, `docs/`, `fiveserver.config.js` und die Worktree-Verzeichnisse für Statusbericht, Sicherheitsanalyse und Phase 2A. Der neue Phase-2B-Worktree kommt als eigener Eintrag hinzu; es wird dort nichts eingecheckt, gestasht, überschrieben oder zurückgesetzt.
- Weitere Worktree-Stände zu Beginn: Phase 2A `06dbe61`, Sicherheitsbericht `afadff8`, Projektstatus `5eba4e6`, Hotfix `55c0db4`. Diese bisherigen Branchs/PRs werden nicht verändert.
- Lokale `main`-Basis `f4dcbec`; kein Fetch und keine Behauptung, dass dieser Stand identisch mit Produktion ist. PR #5 enthält bereits die zuvor ausdrücklich genehmigten V2-/V1-Autosync-Abhängigkeiten. Phase 2B übernimmt diesen Stand als Vorbereitungsbasis, ohne ihn in `main` zu mergen.
- Sicherheitsbericht aus PR #3 wurde gelesen. Dessen Quelltextbefunde und die Tests aus Phase 2A sind historische Nachweise; sie sind keine in Phase 2B erneut ausgeführten Liveprüfungen.

Phase 2B fügt ausschließlich Planung, öffentliche Vorschlagskonfiguration, einen nicht ausführenden Offline-Prüfvertrag, Tests und einen reinen Prüfworkflow hinzu. **Kein bestehender Phase-2A-App-/Server-/Speicher-/Wrapper-Code wird verändert.** Die lokale Demo-Umgebung bleibt der einzige startbare Modus.

## 2. Repository-Inventar: Fakten gegenüber offenen Livezuständen

| Dienst / Bereitstellung | Im Repository bestätigt | Livezustand nicht geprüft |
| --- | --- | --- |
| Firebase-Projekt | `main`-`.firebaserc` und frühere `config.js` nennen `liescorecard-70c5e`; Phase 2A verwendet nur `demo-lie-scorecards-local` | Eigentümer, Projektressourcen, aktuelles Deployment, Abrechnung und IAM |
| Authentication | Custom-Token-Login, Claims `playerId`/`role`, PIN-Functions; Phase 2A bindet Auth-Emulator | Reale Auth-Domains, Nutzer, Provider, API-Key-Beschränkungen, Policies |
| Firestore | Spieler privat/öffentlich, Runden, Flights, Scorecards, Legacy-Scores, Stammdaten, Kalender, Konfiguration; Rules in `firestore.rules` | Datenbestand, Region/DB-Einstellungen, deployte Rules/Indizes/Backups |
| Cloud Functions | Node 22, `europe-west1`, Loginliste, PIN-Funktionen, V2-Read/Write; Admin SDK | Tatsächlich deployte Versionen, Runtime-Identität, Zugriffs-/Invokerrechte |
| Google Apps Script | Historische Main-Functions enthalten reale Mail-Web-App-URL; Phase 2A hat diese entfernt und den Versand deaktiviert | GAS-Code, angebundene Datenquellen und Mail-Empfänger wurden nicht gelesen |
| Frontend/Domain | Statische SPA, `main:CNAME` nennt `app.lochihnein.de`; ältere README nennt GitHub Pages | Aktiver Pages-Branch, DNS, Zertifikate, tatsächlich liefernder Host und Buildstand |
| Firebase Hosting | Bestehendes `firebase.json` enthält nur Functions/Rules, keinen Hosting-Block | Keine bestehende Hosting-Site behauptet |
| Storage / weitere Dienste | Historische Config nennt Bucket; im analysierten aktiven App-Pfad keine Storage-SDK-Nutzung bestätigt | Bucket, IAM und tatsächliche externe Integrationen unbekannt |
| Deploykette | Historische README enthält manuelle Firebase-Deploybefehle; in lokaler `main`-Baumliste kein `.github`-Workflow gefunden | Manuelle/außerhalb des Repos konfigurierte Deployments und GitHub-Settings unbekannt |

`liescorecard-70c5e` ist ein hart verbotenes PreProd-Ziel, unabhängig davon, ob der Produktionsstatus später erneut bestätigt wird. Ein zweites Frontend, Hosting-Preview oder anderer Branch mit demselben Firebase-Backend wäre keine Datenumgebungstrennung. Firebase empfiehlt getrennte Projekte je Umgebung. [Umgebungsübersicht](https://firebase.google.com/docs/projects/dev-workflows/overview-environments).

## 3. Zielarchitektur — vorgeschlagen, nicht provisioniert

```text
Lokale Entwicklung (unverändert aus Phase 2A)
  frisches Browserprofil / Loopback-Origin
    -> demo-lie-scorecards-local: Auth + Firestore + Functions Emulator
    -> Mail deaktiviert, synthetischer Seed, lokale Namespace-Puffer

Cloud-PreProd (erst nach getrennten Entscheidungen)
  eigene Firebase-Hosting-Standard-Subdomain (Plan: <projekt-id>.web.app)
    + sichtbares PREPROD-Banner + eigenes Browserprofil
    -> eigene Firebase-Web-App / Auth-Konfiguration
    -> eigenes Firebase/GCP-Projekt, eigene Firestore-Datenbank und Rules
    -> eigene Functions in europe-west1 mit eigener Runtime-Identität
    -> Mail deaktiviert (später optional kontrollierter Sink nach extra Review)
    -> nur synthetische Konten, Runden, Scores und HCP-Beispiele

Prüf-/Freigabekette (hier nur Offline-Vertrag)
  reviewed Ziel-Allowlist + unveränderlicher Artefakt-Digest
    + explizites Projekt + komponentenspezifische Freigabe
    + künftig vertrauenswürdig geprüfte CI-/IAM-Identität
      -> getrennte spätere Rules-/Functions-/Frontend-/Rollback-Jobs

Produktion
  liescorecard-70c5e und produktiver Origin/GAS
  X keine Verbindung, keine Identitätsdelegation, kein Datenimport aus PreProd
```

| Grenze | Lokal | Vorgeschlagenes Cloud-PreProd | Produktion |
| --- | --- | --- | --- |
| Projekt | Demo, keine echten Ressourcen | Eigene noch nicht registrierte ID | Für diesen Auftrag strikt verboten |
| Identität | Synthetischer Schlüssel nur im Speicher | Eigene Runtime-/Deployidentitäten, bevorzugt kurzlebige Workload Identity | Keine Rechte/Impersonation für PreProd-Identitäten |
| Daten | Synthetische Fixtures | Neu erzeugte synthetische Fixtures | Keine Übernahme in Tests |
| Browser | Frisches Profil, Loopback | Separater HTTPS-Origin/Profil, eigener Namespace | Bestehende Puffer/Worker unangetastet |
| Mail | Deaktiviert | Zunächst deaktiviert, kein reales GAS | Kein Testziel |
| Ausführung | Bestehender lokaler Wrapper | Noch nicht implementiert oder freigegeben | Kein implizites Profil |

### Entscheidungsübersicht

| Entscheidung | Vorschlag | Status / Verantwortlichkeit |
| --- | --- | --- |
| Projekt-ID | `lie-scorecards-preprod` | **Nur Namensvorschlag; nicht registriert, Verfügbarkeit nicht geprüft** |
| Region | Functions `europe-west1`; passende EU-Firestore-Standortwahl separat festlegen | Standort ist später bewusst zu bestätigen; keine Ressource erstellt |
| Domainstrategie | Ausschließlich Firebase-Standardhosts; Plan `https://lie-scorecards-preprod.web.app`, ggf. weiterer Standardhost `firebaseapp.com` | Entschieden; konkrete Hosts erst nach separat freigegebener Anlage verifizieren; keine Custom-Domain/DNS |
| Hosting | Firebase Hosting im separaten künftigen PreProd-Projekt | Verbindlich entschieden; weder Hosting aktiviert noch Produktions-CNAME/Pages verändert |
| Kosten/Billing | Eigene Kostenverantwortung, Budget-/Alarmgrenzen und benötigte Functions-Abrechnung prüfen | Owner/Budget noch nicht benannt; keine Billing-Änderung |
| Projektverantwortung | Benannter technischer Owner plus Sicherheitsreviewer | Namen fehlen, deshalb keine Ziel-Allowlist-Freigabe |
| IAM | Getrennte Runtime-, Rules-, Functions-, Frontend- und Rollback-Identitäten | Exakte minimale Rollen/Delegationen nach Ressourcenauswahl prüfen; keine pauschalen Owner/Editor-Rollen |
| Testmail | Phase 2B-Vertrag ausschließlich `disabled`, Endpoint `null` | Sink erfordert eigenes späteres Review; produktives GAS bleibt verboten |
| Testdaten | Neu generierte, eindeutig synthetische IDs, `.invalid`-E-Mail-Adressen; keine echten PIN-/HCP-Daten | Schema/Seedumfang fachlich bestätigen; keine Datenkopie |
| Freigabe | Benannte unabhängige Prüfer; je Komponente projekt-/digestgebundene, zeitlich begrenzte Freigabe | Personen/Verfahren und vertrauenswürdiger Evidenzkanal offen |

Diese offenen Entscheidungen werden nicht durch produktive Defaults überbrückt. Öffentliche Vorschläge stehen in `config/preprod/proposal.json`, nicht in der aktiven App-Konfiguration.

## 4. Daten- und Zugriffsgrenzen

- Kein Export/Import von Produktionsspielern, Auth-Usern, E-Mails, PINs/PIN-Hashes, Tokens, Scores, HCP-Verläufen, Avataren oder Browserprofilen. Auch „nur pseudonymisierte“ Kopien sind in diesem Plan nicht vorgesehen. Synthetische HCPs bilden fachliche Grenzfälle neu ab.
- Eigene Auth-User und Claims gehören ausschließlich zum neuen Projekt. Keine Produktions-PINs zum Funktionstest. Login-/PIN-Tests schreiben bewusst in synthetische Datensätze; falsche PINs dürfen keine echten Nutzer sperren.
- `getLoginPlayers` ist kein reiner Read: Es schreibt die öffentliche Spielerliste. Spätere PreProd-Bootstraps müssen deshalb schon vor dieser Function das Ziel prüfen. Ein Cloud-Read-Review darf die normale App nicht versehentlich starten.
- V1-Direktschreiber und Autosync benötigen getrennte Projekt-/Besitzerpartitionen und überprüfte Zielbindung. Vorhandene aktive Score-Rules sind breit; ein separates Projekt löst diese Autorisierungsfrage nicht.
- V2-Revisionen/Generationen schützen vor definierten Schreibkonflikten, nicht vor einem falschen Backend oder parallelen unversionierten V1-Schreibern. Vor späterer Freigabe alle Schreiber inventarisieren; Rules-/V2-Migrationsentscheidung separat reviewen.
- Eigener Speicher-Namespace `preprod:<exakte-projekt-id>`, kein Import ungebundener V1-Puffer oder lokaler V2-Datenbanken, keine Übernahme vorhandener Service Worker. Zunächst Worker deaktiviert; später nur eigener Cache-/Versionsvertrag und Offline-Abnahme.
- Sichtbares Banner `PREPROD — SYNTHETIC TEST DATA`, separate URLs/Profile und Umgebungshinweis in Diagnose ohne personenbezogene Daten. Keine PINs, Tokens, vollständigen Callable-Payloads oder Mailinhalte loggen. Retention, Zugriff auf Logs, Fehlerberichte und Kosten müssen getrennt festgelegt werden.
- PreProd-Runtimeidentität darf nicht auf Produktion, produktive Service-Accounts, Secrets, Storage oder reale GAS-Endpunkte zugreifen. Cross-Project-, Gruppen-, Ordner-/Organisationsrechte und `actAs`-/Impersonationpfade müssen später nachweislich ausgeschlossen werden. Eine lokale JSON-Behauptung kann dies nicht belegen.

## 5. Implementierte sichere Vorbereitung

### Offline-Prüfvertrag

`tools/preprod/gate.cjs` prüft ausschließlich Daten im Speicher. `review.cjs` liest ein lokales Review-Bundle und die eingecheckte Policy. Es gibt keinen Firebase-SDK-/CLI-Aufruf, kein Netzwerk, keine Credentialdatei, keinen Subprozess und keinen Deploybefehl. Die eingecheckte Ziel-Allowlist ist leer. `execute()` bricht **immer** mit `phase2b-cloud-execution-disabled` ab, unabhängig von Policydateien oder Eingaben.

Ein Review-Bundle ist ein **virtuelles, nicht deploybares** Paket öffentlicher Dateien (`artifact.files`) plus SHA-256-Digest und Review-Metadaten. Es ersetzt keinen vollständigen Cloud-Build. Erwartete öffentliche Kontrakte:

```text
artifact.files
  frontend/environment.json   mode/project/region/origin/authDomain/banner/namespace
  functions/environment.json  mode/project/region/disabled mail/null GAS/synthetic policy
  deployment/target.json      exact project/origin/hosting/credential project/no defaults
artifact.digest              SHA-256 über kanonisch nach Pfad sortierten Dateiinhalt
identity                     nur öffentliche Identitäts-/Reviewmetadaten, nie Schlüssel
approval                     project/component/digest/reviewer/reference/expiry
rollback                     zusätzlich altes Artefakt und Kompatibilitätsreview
```

Geprüft werden explizite Projekt-/Komponentenwahl, Ziel-Allowlist, Projektgleichheit zwischen Bundle/Frontend/Server/Hosting/Identität, HTTPS-Origin, Region, Demo-/Produktionsverbote, GAS-/Credentialmaterial, Artefaktmanipulation, fehlende Freigaben, unbekannte Identität, behaupteter Produktionszugriff und Rollback-Zuordnung. Die positive Test-Allowlist existiert nur im synthetischen Testobjekt und wird nicht eingecheckt aktiviert.

**Auch ein strukturell gültiges Testobjekt liefert stets `cloudExecutionAuthorized: false`.** Deklarationen wie `productionAccess: absent`, Evidence-Referenzen und Reviewerfelder sind offline nicht vertrauenswürdig verifiziert. Vor einem später ausführbaren Job müssen reale IAM-Evidenz, OIDC-Claims, Reviewerberechtigung, Ablauf/Replay-Schutz und Artefaktprovenienz über einen getrennt geprüften Kanal gebunden werden. Das Ändern von `cloudExecutionEnabled` oder Eintragen einer ID entsperrt diesen Code nicht.

Sichere Befehle im neuen Worktree:

```powershell
node --test tests/preprod-gates.test.cjs
node tools/preprod/review.cjs inspect
# Prüft ein selbst erstelltes öffentliches Review-Bundle, kein Deploy:
node tools/preprod/review.cjs check --manifest <lokale-json-datei> --project <exakte-id> --component rules
```

Der letzte Befehl muss mit der aktuellen leeren Allowlist ablehnen. Keine echten Credentials/Cloud-Artefakte als Testeingabe verwenden. Parserfehler werden ohne Manifestinhalt, Schlüssel oder Tokens ausgegeben. `deploy`, `--token`, implizite Defaultziele und beliebige CLI-Befehle werden nicht unterstützt.

### CI-Prüfung

`.github/workflows/preprod-offline-review.yml` führt ausschließlich die dependencyfreien Offline-Tests und `inspect` aus. `contents: read`, keine OIDC-Berechtigung, keine Secrets, keine authentifizierte Google-/Firebase-Action, keine Installations-/Deployschritte. Checkout ist auf einen Commit gepinnt und persistiert keine Credentials. Ein grüner Workflow ist **kein Cloud-Freigabesignal**. GitHub-Ausführung dieses neuen Workflows wurde lokal nicht behauptet.

Die Phase-2A-Dateien `App_Environment.js`, `config.js`, `.firebaserc`, Functions-Guards, Speicher und Startwrapper bleiben byteidentisch zur Basis. Kein Cloud-Profil ist anwendbar/startbar. Späterer Cloud-Bootstrap, Server-WIF-Integration, echte Frontendartefakte und Ausführung werden hier bewusst nicht implementiert.

## 6. Konkrete Reihenfolge mit separaten Freigaben

Alle Schritte mit Cloudwirkung sind **zukünftige Checkliste**, keine Ausführungsanweisung für diesen Auftrag.

1. **Review:** Issue #6, PR #3 und Draft-PR #5/Phase-2B-Diff prüfen. Breite Feature-Abhängigkeiten nicht blind in `main` übernehmen. Owner, echte Projekt-ID, Firestore-Standort, Budget und Freigabeverfahren entscheiden. Hostingtyp und Standard-Domainstrategie sind bereits durch Issue #8 festgelegt. Weiterhin keine Cloudzugriffe.
2. **Gesonderte Freigabe für Bestands-Reads:** Erst falls erforderlich, Art und Umfang der lesenden Cloudprüfung ausdrücklich genehmigen lassen. Gegenwärtiger Bericht enthält keine Firebase-Projekt-Ressourcenreads. Erkenntnisse mit Datum/Identität/Quelle belegen, keine PII in Berichte kopieren.
3. **Gesonderte Provisionierungsfreigabe:** Exakte neue Projekt-ID und Ressourcenliste freigeben. Danach ausschließlich neues Projekt, eigene Auth/Web-App, Firestore-Standort, benötigte APIs/Functions-/Buildressourcen und die Firebase-Hosting-Site mit Standard-Subdomain anlegen (alles erst nach eigener Freigabe). Keine Produktionskonfiguration als Default übernehmen. Jede IAM-/Billing-/DNS-Mutation benötigt ihren eigenen autorisierten Umfang.
4. **Identitätsgrenze:** Runtime und komponentenspezifische Deployidentitäten neu einrichten, keine langfristigen Schlüssel exportieren. WIF/OIDC auf Repository, geschützten Branch/Environment und ggf. konkreten Ref binden. Dienstbezogene minimale Rollen, enges `actAs` und keine Produktions-/übergeordneten Rechte nachweisen. [Firebase IAM-Berechtigungen](https://firebase.google.com/docs/projects/iam/permissions) beschreiben besondere Functions-Anforderungen; genaue Rollen erst anhand des gewählten Ressourcenplans festlegen.
5. **Cloud-Build-/Runtimeprofil in eigenem Implementierungsreview:** Explizite echte Allowlist, Konfigurationsschema, unabhängige PreProd-App-/Serverguards und vollständige Artefaktinventare erstellen. Lokale Guards nicht aufweichen. Backend-Modus darf nie aus einem Benutzerpayload stammen. Banner, Origin, CSP, Namespace, deaktiviertes GAS, Firestore-/Auth-/Callable-Zielgleichheit und Secrets-Verzicht am fertigen Artefakt prüfen. Kein Wechsel per URL-Parameter oder produktivem Fallback.
6. **Rules-Freigabe separat:** Rules-Clientmatrix lokal grün; bestehende V1/V2-Schreibpolitik bewusst entscheiden. Eigenes Review und projekt-/digestgebundene Freigabe für ausschließlich PreProd-Rules. Ausführung erst nach gesonderter Autorisierung und erneuter Ziel-/Identitäts-/Artefaktprüfung unmittelbar davor. Keine kombinierte Default-Deploymentoperation.
7. **Functions-Freigabe separat:** Eigene Runtimeidentität, explizites Projekt/Region, Bindung von Auth/Firestore und Mailstub nachweisen; nur synthetische Fixtures. Eigenes Functions-Review, eigener Digest, eigene kurzlebige Freigabe und Preflight vor Ausführung. Admin SDK umgeht Rules, daher serverseitige Prüfungen zwingend.
8. **Frontend-/Hosting-Freigabe separat:** Erst nach unabhängig geprüfter Backendbereitschaft Artefakt bauen. Vor Veröffentlichung Hosting-Projekt/Site, Firebase-App, Auth-Domain, Browser-Origin und Server-Projekt auf exakte Gleichheit prüfen. Eigenes Hosting-/Frontend-Review, unveränderliches Artefakt und Freigabe. Produktions-`CNAME` nicht kopieren.
9. **Standardhosts verifizieren, kein DNS:** Erst nach gesondert freigegebener Hostinganlage tatsächliche Site-ID und Firebase-Standardhosts nachweisen, anschließend passende Auth authorized domains separat autorisieren. Kein produktiver Origin, keine Custom-Domain, keine Wiederverwendung von GitHub Pages/CNAME und keine DNS-Arbeit. Vorschlags-URLs sind jetzt keine aktiven Ressourcen. Hosting ersetzt nicht die gesonderte Backend-Projektprüfung. [Hosting-Testworkflow](https://firebase.google.com/docs/hosting/test-preview-deploy).
10. **Spätere Live-PreProd-Tests separat:** Nur nach Erlaubnis synthetische Auth-/Rules-/Callable-/Score-/HCP-/Rollback-Szenarien im neuen Projekt durchführen; Mail weiterhin deaktiviert. Nachweise ohne PII/Token archivieren. Kein Test der Produktion als Negativkontrolle.

Vor **jeder** späteren CLI-/CI-Cloudoperation: explizites exaktes Projekt, Komponente, freigegebener Artefakt-Digest, Frontend-/Server-/Hosting-ID, tatsächliche kurzlebige Identität und aktuelle IAM-Evidenz erneut prüfen. Keine Wiederverwendung eines früheren Checks für geänderte Artefakte oder andere Komponenten. Dieser PR kann manuelle externe Firebase-CLI-Nutzung technisch nicht verbieten; die zukünftige organisatorische/CI-Rechtegrenze ist deshalb Teil der separaten Freigabe. Hier existiert überhaupt kein Cloud-Ausführungspfad.

## 7. Risikomatrix und Rollback

| Risiko | Grenze / erforderlicher Nachweis | Status |
| --- | --- | --- |
| Falsches Projekt / kopierte Produktionskonfiguration | Harte Produktionssperre, leere Allowlist, ID-Gleichheit und später fertiges Artefakt prüfen | Offline-Gates implementiert; echtes Projekt offen |
| Versteckte Produktionsrechte durch Gruppen/Impersonation | Unabhängige aktuelle IAM-/OIDC-Evidenz, getrennte Identitäten ohne Owner/Editor-Default | Offline nicht beweisbar, Cloudausführung gesperrt |
| GAS oder reale E-Mails aus Tests | Nur deaktivierter Versand, `gasUrl: null`, keine echten Empfänger | Offline-Vertrag plus unveränderte lokale Stub-Implementierung |
| V1/V2-Konfliktgarantien verwechselt | Schreiberinventar und Rules-Entscheidung vor Freigabe | Fachlicher Review offen |
| Alte Puffer/Worker/Session gelangen nach PreProd | Eigenes Profil/Origin/Namespace, kein Import, Worker zunächst deaktiviert | Vertrag/Plan; kein aktives Cloudprofil |
| Grünes Gate als Deployfreigabe missverstanden | Ergebnis immer `cloudExecutionAuthorized: false`, kein Executor, keine Secrets/OIDC im Workflow | Implementiert |
| Drift zwischen Approval und Veröffentlichung | Immutable vollständige Artefakte, komponenten-/zeitgebundene Freigaben, Preflight unmittelbar vor Mutation | Nur struktureller Vertragsentwurf; vertrauenswürdige Bindung später |
| Kostenausweitung / Runtime-/Standortbindung | Vorab Budget, Quoten, Region und Verantwortliche bestätigen | Offen, keine Cloudanlage |

**Lokaler Rollback:** Wrapper nicht starten bzw. stoppen, neuen Reviewbranch stehen lassen; ursprüngliche Worktrees bleiben erhalten. Es gibt keine Cloudressource zurückzunehmen und keinen Grund für einen Reset vorhandener Arbeit.

**Späterer Cloud-Rollback:** Eigene Freigabe für PreProd-Projekt, Rollbackidentität und alten Artefakt-Digest. Rules, Functions und Frontend getrennt zurücknehmen; Schema-/Revision-/Generation-/Auth-Kompatibilität vorab mit synthetischen Daten prüfen. Frontend zunächst auf bekannte kompatible PreProd-Version zurück, keinesfalls auf Produktion umschalten. Funktionen/Rules nicht pauschal lockern; ggf. PreProd-Nutzung stoppen. Keine automatische Datenlöschung oder Produktionsrestore. In Phase 2C sind keine DNS-Änderungen geplant; eine spätere Änderung der verbindlichen Domainstrategie benötigte einen neuen Auftrag. Ein vorheriger Code-Digest stellt veränderte Daten nicht automatisch wieder her.

## 8. Offene Grenzen und nächste Entscheidung

Keine reale Projekt-/Domainverfügbarkeit, IAM-Wirksamkeit, Cloud-Buildfähigkeit, deployte Rules/Functions, Kosten oder Zertifikate geprüft. Der Bundledigest ist ein reproduzierbarer Hash öffentlicher Reviewdateien, keine Signatur/Buildprovenienz und kein Scanner sämtlicher ausführbarer Quelltexte. Produktions-/GAS-Stringprüfungen sind zusätzliche Negativgates, keine Absicherung gegen absichtlich verschleierten Code. Aktuelle Apps bleiben lokal-only; ein Cloudstart wird weiterhin abgelehnt.

Nächster zulässiger Schritt: Review dieses Draft-PRs und Entscheidung über tatsächliche Projekt-ID, Firestore-Standort, Verantwortliche, Budget, IAM-Modell und komponentengetrennten Freigabeprozess. Firebase Hosting und die Standard-Subdomain werden nicht erneut zur Wahl gestellt. **Erst eine gesonderte ausdrückliche Freigabe erlaubt später definierte Cloud-Reads, Provisionierung oder Deployments.** Der Merge eines Planungs-/Prüf-PRs allein ist keine solche Freigabe.
