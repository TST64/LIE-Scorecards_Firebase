# Phase 2C: Firebase Hosting mit eigener Standard-Subdomain

Stand: 08.11.2026, Europe/Berlin. [Issue #8](https://github.com/TST64/LIE-Scorecards_Firebase/issues/8), aufbauend auf [Draft-PR #7](https://github.com/TST64/LIE-Scorecards_Firebase/pull/7) (`8668c9e`), Phase 2A aus [Draft-PR #5](https://github.com/TST64/LIE-Scorecards_Firebase/pull/5) (`06dbe61`) und Sicherheitsbericht aus PR #3. Der vollständige Issue-Text wurde gelesen; es lagen keine Kommentare vor. Vorgänger-Issues und deren Sicherheitsgrenzen gelten weiter.

## Verbindliche Architekturentscheidung und Evidenz

**Firebase Hosting im separaten künftigen PreProd-Projekt, zunächst ausschließlich mit Firebase-Standard-Subdomain.** Keine Custom-Domain, kein DNS-Eingriff, keine Wiederverwendung von Produktions-`CNAME`, GitHub Pages oder produktivem Browser-Origin. Hosting und Domainstrategie sind entschieden, nicht erneut zur Auswahl gestellt.

`lie-scorecards-preprod` ist weiterhin ein **ungeprüfter, nicht reservierter Namensvorschlag**. Daraus abgeleitete Planwerte:

- Primärer Origin: `https://lie-scorecards-preprod.web.app`.
- Möglicher weiterer Standardhost: `https://lie-scorecards-preprod.firebaseapp.com`.
- Vorgeschlagene Default-Site-ID gleich Projekt-ID; tatsächliche Site-/Projekt-/Hostzuordnung erst nach gesondert genehmigter Anlage verifizieren. Abweichung bedeutet erneutes Vertragsreview, kein automatisches Ausweichen auf fremde Hosts.

**Keine dieser URLs wurde angefragt oder als existent/aktiv bestätigt.** Es wurden keine Firebase-Projekte/Hosting-Sites gelesen, angelegt oder aktiviert und keine Auth-, IAM-, Billing- oder DNS-Einstellungen verändert. Öffentliche Firebase-Dokumentation zu Hosting/Budgetregeln wurde gelesen; dies ist keine Cloud-Bestandsprüfung.

## Basis, Worktrees und Diffgrenze

Neuer Worktree `.codex-phase2c-worktree`, Branch `codex/preprod-hosting-plan`, exakt von `8668c9e817a3d9dc075d5c363382d5101f6fea9f`. Kein anderer Branch wird integriert. Der Draft-PR richtet sich gegen `codex/preprod-cloud-preparation`, damit ausschließlich Phase 2C sichtbar ist.

Unveränderte Ausgangsstände: ursprünglicher Feature-Worktree `feature/score-autosync` bei `cb4661f` mit sechs bereits geänderten Anwendungsdateien (`App_Logic_Bridge.js`, `App_Logic_Scores.js`, `App_Logic_Spieltage.js`, `Views_ScoreSchnellerfassung.js`, `config.js`, `sw.js`); Phase-2A-Worktree `06dbe61`; Phase-2B-Worktree `8668c9e`; Sicherheitsbericht `afadff8`, Statusbericht `5eba4e6`, Hotfix `55c0db4`. Vorhandene unversionierte Dateien/Worktrees bleiben erhalten. Kein Checkout/Reset/Clean/Stash in bestehenden Worktrees, keine Änderung vorheriger PRs.

Geändert werden nur öffentliche Vorschlagsdokumente, ein nicht aktives Hosting-Beispiel, ein reiner In-Memory-Prüfvertrag, Tests und der bestehende Offline-Prüfworkflow im **neuen** Branch. Aktive App-Dateien, `firebase.json`, `.firebaserc`, Functions, Rules und Phase-2A-Start-/Speicher-/Netzwerkguards bleiben unverändert. `tools/preprod/gate.cjs::execute()` bleibt unbedingte Sperre; Policy weiterhin `cloudExecutionEnabled:false`, `approvedTargets:[]`.

## Zielarchitektur und Integration

```text
Frisches PreProd-Browserprofil
  -> HTTPS: tatsächlicher, später verifizierter eigener SITE_ID.web.app
     -> Firebase Hosting: ausschließlich geprüfter statischer Public-Build
        Banner: PREPROD — SYNTHETIC TEST DATA
        keine Worker, keine Alt-Puffer-/Cachemigration
     -> eigene Firebase Web App / Authentication desselben Projekts
     -> eigene Firestore-Datenbank + geprüfte Rules
     -> eigene Callable Functions in europe-west1
        eigene Runtimeidentität, serverseitige Projektprüfung
        nur synthetische Daten, GAS/Mail deaktiviert

Offline-Review -> geprüfte Artefakt-Allowlist / Digest / Projekt-Host-Vertrag
  X keine Cloud-Freigabe, keine Deployfunktion, keine CLI-Aktivierung

Produktion liescorecard-70c5e / produktives GAS / CNAME
  X kein Testziel, kein Daten-/Account-/Credentialtransfer
```

Späteres Cloud-Frontend benötigt einen eigenen, separat reviewten Bootstrap; Phase 2A ist weiterhin lokal-only und wird hier nicht erweitert. Die SDK-Konfiguration muss aus der später tatsächlich registrierten PreProd-Web-App stammen; Projekt-ID, Auth-Domain, API-Key/App-ID, Functions-Region und serverseitiges Runtimeprojekt müssen übereinstimmen. Keine produktiven Werte kopieren. Firebase-Webkonfiguration ist öffentlich, aber kein Ersatz für Rules/Auth/Serverautorisierung.

Die vorgeschlagene Auth-Domain ist `<projekt-id>.firebaseapp.com`; vorgeschlagene authorized domains sind exakt die eigenen verifizierten Standardhosts ohne Schema. Ein Eintrag wird erst nach wirklicher Hostprüfung und separater Freigabe gesetzt. Keine fremden Hosts, Produktionsdomains oder pauschalen Wildcards. Custom-Token-Login, PIN-Fehler und Session-Restore später ausschließlich mit eigenen synthetischen Testkonten prüfen.

Functions bleiben explizit `europe-west1`. Im Beispiel werden keine Hosting-Rewrites auf Functions oder Cloud Run verwendet; spätere Callables nutzen ausschließlich den überprüften eigenen Backendvertrag. `getLoginPlayers` schreibt Daten und darf nicht als harmloser Cloud-Read verwendet werden. Admin SDK umgeht Rules. Breite V1-Schreibrechte und V2-Revisions-/Generationsschutz sind vor einer Cloudfreigabe getrennt zu bewerten.

V1-/V2-Puffer erhalten zukünftig `preprod:<exakte-projekt-id>` plus Benutzer-/Flightpartitionen; frisches Profil und neuer Origin. Keine Übernahme produktiver oder lokaler Pending-Daten, Token, Browserdatenbanken oder Worker. Worker/PWA-Offline-Installationen zunächst aus. Synthetische Spieler/PINs/Flights/Scores/HCP-Beispiele neu erzeugen; keine Produktionskopien, auch nicht als scheinbar anonymisierte Fixtures.

## Public-Artifact und Hosting-Konfiguration

Nicht aktiver Vorschlag: `config/preprod/hosting/firebase.proposal.json`. **Nicht** die aktive Root-`firebase.json`; kein Public-Verzeichnis wird erzeugt und kein Build oder Hosting-Deploy konfiguriert/ausgeführt. Der Vorschlag ist kein fertiges Anwendungsartefakt und darf nicht als freigegebene CLI-Konfiguration verwendet werden.

Der künftige Builder muss ein neues, leeres `hosting-public` ausschließlich aus explizit erlaubten Dateien erzeugen. Niemals Repository-Root oder Worktree rekursiv kopieren. Exakte vorgesehene Allowlist:

```text
index.html
404.html
assets/app.bundle.js
assets/app.css
assets/environment.json
assets/logo.png
assets/vendor/firebase-app-compat.js
assets/vendor/firebase-auth-compat.js
assets/vendor/firebase-firestore-compat.js
assets/vendor/firebase-functions-compat.js
```

Diese Namen beschreiben einen **künftigen** separaten Cloud-Build. Sie werden jetzt nur als synthetisches Reviewmanifest geprüft. Die bestehenden dynamischen App-/lokalen SDK-Pfade entsprechen noch keinem solchen Cloud-Build. Ein späterer Builder muss echte Dateien, `lstat`/Realpfade, Symlinks/Junctions, Hashes, Quell-/Buildprovenienz und das gesamte Auslieferungsinventar prüfen; die aktuellen Descriptoren `kind: regular-file` sind kein physischer Dateisystemnachweis.

Ausgeschlossen sind alle anderen Pfade, insbesondere `functions/`, `tests/`, `.env*`, Git-/Worktree-Verzeichnisse, Runtime-/Debugartefakte, Schlüssel-/Credentialdateien, Source Maps (auch Inline-Map-Verweise), altes `config.js`, Produktions-`CNAME` und `sw.js`. Hosting-`ignore` ist zusätzliche Absicherung; die **positive Build-Allowlist ist maßgeblich**. Public-Konfiguration muss neu erzeugt werden und Projekt/Origin/Region, Banner, Namespace, Worker aus, Altbestände quarantänisiert und Mail/GAS aus bestätigen. Keine Geheimnisse oder sensiblen Daten in HTML/JS/JSON, einschließlich Buildkommentaren oder Quellmaps.

Firebase-eigene reservierte `/__/`-Routen gehören nicht zum eigenen Public-Artefakt; hier werden keine eigenen Dateien/Rewrites dafür definiert. Bei später genehmigter Prüfung muss auch die Plattform-/Web-App-Zuordnung stimmen. [Hosting-Konfiguration](https://firebase.google.com/docs/hosting/full-config).

### SPA-Routing

Die bestehende SPA navigiert über JavaScript-Views im Speicher; rootbasierter Appstart erfordert keinen globalen URL-Fallback. Der Vorschlag erlaubt deshalb nur `/app` und `/app/**` nach `/index.html`, keinen Catch-all `**`, keinen Rewrite von `/functions`, `/tests`, `/api` oder `/__/`, keine externen Redirects, Functions-/Run-Proxies oder Zielpfade außerhalb `index.html`. Unbekannte Pfade erhalten später die statische 404-Seite.

Damit Deep-Link-Aliase tatsächlich funktionieren, muss der zukünftige Cloud-Build absolute Assetpfade bzw. eine geprüfte Root-Basis liefern. Relative Skriptpfade der jetzigen SPA dürfen nicht ungeprüft unter `/app/...` kopiert werden. Dieser App-/Buildumbau ist **nicht** Bestandteil von Phase 2C. Firebase-Rewrite-Semantik/HTTP-Verhalten werden jetzt nicht live getestet; geprüft wird nur der exakte Offline-Vertrag.

### CSP, Cache und Worker

Vorschlag: eigene Skripte/Styles/Fonts/Bilder, kein CDN; für die vorhandenen Inline-Handler zunächst `unsafe-inline` als sichtbar reviewbarer Kompromiss. CSP erlaubt nur eigene Ressourcen plus die notwendigen Auth-/Token-/Firestore-APIhosts und den projektgebundenen Functions-Host. Globale Google-APIhosts enthalten selbst keine Projektisolation: App-/Serverprojektbindung bleibt zwingend. `worker-src 'none'`, `frame-src 'none'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`. Zusätzliche Authprovider/Helperframes benötigen später eine eigene Änderung, keinen pauschalen Wildcard-Fallback.

`Cache-Control: no-store` zunächst für alle eigenen Dateien, dazu `nosniff` und `no-referrer`. Kein Worker, keine Übernahme bestehender Cache-Registrierungen. Performance-/Langzeitcache mit gehashten Assets erst nach eigenem Review. Die Header sind Planwerte; tatsächliche CDN-/Browserwirkung wird nach späterer Genehmigung geprüft. Firebase verwaltet Teile der HTTPS-/Standardhost-Header selbst; keine nicht geprüfte HSTS-Wirkung behaupten.

## Reproduzierbare manuelle Provisionierungsreihenfolge — jetzt nicht ausführen

Jeder Schritt erfordert vor Cloudwirkung eine passende gesonderte Freigabe. **Keine Cloud-CLI wird in Phase 2C aufgerufen.**

1. Offene Verantwortliche, tatsächliche Projekt-ID und Kostenrahmen festlegen. ID noch nicht reserviert/verfügbar; eine Verfügbarkeits-/Bestandsprüfung erst mit Freigabe A.
2. Datenschutz, benötigte Regionen und insbesondere Firestore-Datenbankstandort bewusst bestimmen. Functions `europe-west1` ist ein Vorschlag; keine Standortwahl aus Produktion kopieren. Vor möglicherweise schwer änderbaren Standortentscheidungen fachlich freigeben.
3. Neues PreProd-Projekt, Billing-Verknüpfung, Budgetverantwortung und Alarmschwellen unter Freigabe B anlegen; benötigte APIs und Ressourcen inventarisieren. Keine Produktionsressource verändern.
4. Dienstbezogene Runtime-/CI-/Deployidentitäten mit minimalen Rechten unter Freigabe B einrichten. Getrennte Rules-, Functions-, Hosting- und Rollbackidentitäten; kurzlebige WIF/OIDC-Bindung an geprüften Repo-/Branch-/Environmentkontext. Benötigte Cloud-Build-/Artifact-Registry-/Functions-/Run-/`actAs`-Rechte exakt prüfen, keine pauschalen Owner/Editor-Deployrollen und keine Produktions-/übergeordneten Cross-Project-Rechte. Keine echten Schlüssel exportieren.
5. Eigene Auth-/Web-App-Konfiguration, Firestore-Datenbank und benötigte Node-Functions-Runtime planen/unter genehmigtem Umfang einrichten. Node 22 entspricht der lokalen Basis; zum tatsächlichen Provisionierungszeitpunkt unterstützte Runtime und APIs neu prüfen. Synthetische Konten nicht aus Produktion importieren.
6. Eigene Firebase-Hosting-Site aktivieren und ihre Standardhosts tatsächlich nachweisen — ebenfalls Cloudmutation unter Freigabe B, nicht von der Architekturentscheidung gedeckt. Site-/Projekt-/Standardhostzuordnung dokumentieren. Bei anderer Site-ID kein stillschweigender fremder Origin.
7. Tatsächliche Standardhosts, HTTPS und Auth authorized domains unter passend begrenzter Freigabe bestätigen/eintragen. Kein Custom-Domain-Menü, keine DNS-Konfiguration, keine Produktions-CNAME- oder GitHub-Pages-Änderung.
8. Eigenständigen zukünftigen Cloud-Bootstrap/Build und vertrauenswürdigen Preflight in separatem Code-Review erstellen; leere Allowlist nicht aus diesem Plan heraus füllen. Public-Artefakt physisch prüfen und Digest plus echte Identität/IAM-Evidenz binden.
9. Rules (C), Functions (D), Hosting/Frontend (E) jeweils separat reviewen/freigeben und nur im genehmigten eigenen Projekt bereitstellen. Vor **jeder** Mutation exaktes Projekt, Umfang, Identität, unverändertes Artefakt und Rollback neu prüfen. Keine kombinierten Default-Deploys.
10. Unter Freigabe F ausschließlich synthetische Cloud-Integration prüfen: normaler Start, Loginliste/PIN/Logout/Reload, Auth/Rules, V1/explicit V2, HCP, erlaubte Hosts/Headers, Deep Links/404 und Worker aus. Kein Test gegen Produktion als Negativkontrolle, keine echte E-Mail.

### Getrennte spätere Freigaben

| Freigabe | Umfang | Zwingender Inhalt jeder Freigabe |
| --- | --- | --- |
| A | Lesende Cloud-Bestands-/Namensprüfung | Exaktes Projekt bzw. zu prüfender Namensbereich, erlaubte Reads, Identität, Protokoll und Abbruch-/Rollbackplan; keine Mutation |
| B | Projekt-/Billing-/IAM-/API-/Auth-/Datenbank-/Hostinganlage | Exakte Projekt-ID und einzeln erlaubte Ressourcen/Änderungen, technische Identität, Kostenverantwortung, Rücknahmeplan; keine Produktionsrechte |
| C | PreProd-Rules | Exakte Projekt-ID, Rules-Digest, Identität, Reviewer, Ablauf und kompatible Rücknahme |
| D | PreProd-Functions | Exakte Projekt-ID/Region, Artefakt-Digest, Deploy-/Runtimeidentität, Umfang und Rücknahme |
| E | Hosting/Frontend | Exakte Projekt-/Site-ID und verifizierte Standardhosts, Public-Digest, Identität, Umfang und vorheriges kompatibles Hostingartefakt |
| F | Synthetische Cloud-Integrationstests | Exaktes Projekt, erlaubte Testschreiboperationen/Fixtures, Identität, Zeitfenster und genehmigter Fixture-Aufräum-/Rollbackumfang |

Keine Freigabe hier erteilt; kein grünes Offline-Gate, PR-Review oder Merge ersetzt diese Entscheidungen.

## Kosten und begrenzte offene Entscheidungen

**Budgetalarme sind keine automatische Kostensperre.** Sie informieren, stoppen aber nicht verlässlich Dienste oder Abrechnung. Quoten, Maximalinstanzen, Testlaufgrenzen, Retention und ein verantworteter manueller Stopp-/Rücknahmeprozess sind zusätzlich zu planen; auch sie dürfen nicht pauschal als garantierter Euro-Hardcap bezeichnet werden. Keine Preise oder konkrete Billingkonfiguration hier geprüft. [Google Cloud Budgetalarme](https://docs.cloud.google.com/billing/docs/how-to/budgets), [Firebase Kostenkontrolle](https://firebase.google.com/docs/projects/billing/avoid-surprise-bills).

Für den Nutzer offen bleiben genau diese Entscheidungskomplexe:

1. Tatsächliche Projekt-ID nach später erlaubter Verfügbarkeitsprüfung.
2. Datenschutz-/Firestore-Datenbankstandort; Functions-Region entsprechend bestätigen.
3. Billing/Kostenrahmen, Alarmschwellen, Budgetverantwortung und Stoppbefugnis.
4. Technischer Projekt-Owner.
5. Minimales IAM-/WIF-/Reviewer-/Approver-Modell mit komponentengetrennten Freigaben.

Hostingtyp und Standard-Subdomain-Strategie sind bereits verbindlich; Custom-Domain/DNS stehen nicht zur Diskussion.

## Risiken, Rollback und Grenzen

| Risiko | Vorgesehene Grenze |
| --- | --- |
| Namensvorschlag wird als aktiver Host ausgegeben | Aktivierungs-/Verifikationsflags false, keine URL-Anfrage, tatsächliche Prüfung erst nach Freigabe |
| Repository oder Geheimnisse öffentlich | Neues isoliertes Buildverzeichnis, exakte File-Allowlist, später physische Symlink-/Inventarprüfung, keine Source Maps |
| Rewrite umgeht Grenzen / Cloudproxy | Exakt zwei statische SPA-Aliase, keine Functions-/Run-/externen Rewrites, reservierte Pfade unverändert |
| CSP oder Namespace wird mit Projektisolation verwechselt | Explizite App-/Server-/Auth-/Hostbindung und unabhängige IAM-/Rulesprüfung |
| Alte Puffer, Worker oder echte Nutzer gelangen nach PreProd | Neuer Origin/Profil/Namespace, keine Migration/Produktionskopie, Worker zunächst aus |
| Grünes Gate oder Hostingentscheidung wird Deployrecht | `execute()` bleibt immer gesperrt, Allowlist leer, nur Offline-Datenvertrag |

Jetzt gibt es keine Cloudressource zurückzunehmen. Lokale Vorschlagsänderungen bleiben im neuen Branch; bestehende Worktrees werden nicht bereinigt oder zurückgesetzt.

Späterer Rollback unter eigener Freigabe: vorheriges **PreProd**-Frontendartefakt samt Header-/Rewritekonfiguration über den genehmigten Hostingpfad wiederherstellen; Functions/Rules-Kompatibilität vorher prüfen und separat rücknehmen, wenn nötig. Nie auf Produktion umschalten, kein DNS-Rollback nötig, keine automatische Datenlöschung. Synthetische Testdaten nur unter eigenem genehmigtem Aufräumumfang behandeln. Hostingrücknahme restauriert keine geänderten Daten.

Nicht implementiert: Cloud-Bootstrap, physischer Builder, echtes Hostingartefakt, live IAM/Auth-Domain-/Header-/Kosten-/Rewriteprüfung, Deployjob. Aktive lokale App bleibt unverändert. Tatsächliche lokale Testbefehle, Zwischenfehler und Grenzen stehen in [PHASE2C_HOSTING_TEST_REPORT.md](PHASE2C_HOSTING_TEST_REPORT.md).
