# Phase 2C: tatsächliche Offline-Hosting-Prüfungen

Stand: 08.11.2026, Europe/Berlin. Issue #8, Basis Draft-PR #7 `8668c9e817a3d9dc075d5c363382d5101f6fea9f`. Neuer Worktree `.codex-phase2c-worktree`, Branch `codex/preprod-hosting-plan`; PR gegen `codex/preprod-cloud-preparation`. Keine andere Branchintegration oder Änderung bisheriger PRs.

## Tatsächliche Befehle und Ergebnisse

Node `v22.21.0`. Keine Installation, kein Hosting-/Firebase-CLI-/SDK-Cloudaufruf, kein Emulator- oder App-Start. Nur synthetische öffentliche Reviewobjekte. Der gemeinsame Regressionstest enthält einen kurzlebigen Loopback-Server aus der unveränderten Phase-2A-Sicherheitssuite, außerhalb der Dateisandbox erlaubt ausgeführt. Kein Zugriff auf Firebase-Projektressourcen.

| Befehl / Prüfung | Beobachtetes Ergebnis |
| --- | --- |
| Erster `node --test tests/preprod-hosting.test.cjs` | 53 Tests: 52 bestanden, 1 fehlgeschlagen. Ursache: Der Test lud `.firebaserc` ohne JSON-Erweiterung irrtümlich per JavaScript-`require`. Test auf `JSON.parse(readFileSync(...))` korrigiert; aktive Datei unverändert. |
| `node --test tests/preprod-hosting.test.cjs` nach Testkorrektur und zusätzlichem Worker-Dateitest | Exit 0; 54 bestanden, 0 fehlgeschlagen, 0 übersprungen |
| `node --test tests/preprod-gates.test.cjs tests/preprod-hosting.test.cjs tests/local-environment.test.cjs` | Exit 0; **115 bestanden**: 54 Hosting + 48 bestehende Phase-2B-Gates + 13 bestehende lokale Sicherheitsprüfungen; 0 fehlgeschlagen, 0 übersprungen |
| `git diff --check` | Keine Whitespacefehler im bisherigen Diff; neue Dateien werden nach Vormerken zusätzlich geprüft |
| `git diff --exit-code 8668c9e -- tools/preprod/gate.cjs config/preprod/policy.json App_Environment.js config.js firebase.json .firebaserc functions firestore.rules tools/local App_Start.js` | Exit 0, keine Unterschiede an diesen geschützten Pfaden |

Der Zwischenfehler wird nicht als bestandener Test gezählt und führte zu keiner Cloud-/App-Konfigurationsänderung. Frühere Phase-2A-Browser-/SDK-/Emulator-Ergebnisse und Phase-2B-Berichte sind historische Nachweise, hier nicht erneut ausgeführte Liveprüfungen.

## Was die Tests bestätigen

- Öffentlicher Vorschlag setzt verbindlich Firebase Hosting im separaten künftigen PreProd-Projekt und ausschließlich Standardhosts; Aktivierungs-/Verifikations-/Custom-Domain-/DNS-/Freigabeflags bleiben false.
- Das nicht aktive Hosting-Beispiel passt zum reinen In-Memory-Hostingvertrag; auch der passende synthetische Fall liefert `cloudExecutionAuthorized:false` und `hostingActivated:false`.
- Phase-2B-Policy unverändert gesperrt: `cloudExecutionEnabled:false`, `approvedTargets:[]`. `execute()` verweigert ohne Bedingung, auch mit vermeintlich freigegebenen Eingaben. Aktive Root-`firebase.json` ohne Hosting und Demo-`.firebaserc` unverändert.
- Ablehnung: Produktions-ID/-CNAME/-GitHub-Pages-Origin, fremder Standardhost, Custom-Domain, HTTP, falsche Site-ID, behauptete Aktivierung/URLverifikation, DNS/Cloud an, fehlender Reviewmodus, falsche Auth-/authorized-domain-/Functions-Zuordnung.
- Ablehnung: Worker aktiv, Übernahme alter Puffer, GAS/Live-Mail, Root-/Parent-Public-Verzeichnis, fehlende Ausschlüsse, eingeschleuste Functions-Konfiguration, globale Catch-all-Rewrites, Functions-/Run-Rewrites, externe Redirects, sensitive Rewrite-Ziele, Worker-freundliche CSP und Langzeitcache.
- Public-Manifest erlaubt nur zehn exakt benannte Dateien, reguläre Datei-Descriptoren und passenden Inhaltsdigest. Nicht erlaubte Functions-/Test-/Dotenv-/Credential-/Worktree-/Runtime-/Source-Map-/Produktionsconfig-/Worker-/Parent-/reservierte Plattformpfade werden auch mit neu berechnetem Digest abgewiesen. Secret-Marker, Inline-Map-Verweise, Content-/Konfigurationsdrift und Symlink-Descriptoren werden abgewiesen.
- Ein eingeschränkter VM-Test erlaubt dem Hostingvertrag nur die vorhandene Read-only-Policy und den reinen Phase-2B-Digest: keine Dateisystem-, SDK-, Netzwerk- oder Subprozessfähigkeit im Validator.
- Bestehende Phase-2B-Negativfälle und die lokalen Phase-2A-Guards/Puffer-/Sessiongrenzen bestehen weiterhin.

## Was ausdrücklich nicht bewiesen ist

Keine Existenz/Verfügbarkeit der Projekt-ID `lie-scorecards-preprod` oder der daraus abgeleiteten Standard-URLs geprüft. Keine URL angefragt, kein DNS aufgelöst, keine Firebase-Site aktiviert. Keine reale Auth-Domain, IAM-Wirksamkeit, Billing-/Quoten-/Kostenkonfiguration oder Runtimeverfügbarkeit geprüft.

Das Public-Artefakt ist nur ein virtuelles Manifest mit synthetischen Inhalten. Kein Builder, keine realen Bundles, kein physischer Symlink-/Dateisystemscan, keine vollständige Geheimniserkennung oder Buildprovenienz. Exakte Public-Allowlist/Content-Marker sind ein Offline-Prüfvertrag, kein Schutz gegen absichtlich verschleierte Geheimnisse in künftigen Builds. Der spätere Builder benötigt gesondertes Review und echte Artefaktprüfung.

Keine reale Hosting-/CDN-/Browserwirkung der CSP-, Cache- oder Rewrite-Regeln getestet. Das vorhandene in-memory SPA-Routing ist kein fertig gebauter `/app/...`-Cloud-Deep-Link-Pfad. Absolute Assetpfade/Cloud-Bootstrap bleiben spätere Arbeit; aktive App und Lokalprofil wurden nicht verändert. Keine Hosting-Preview, kein Deploy, keine echte E-Mail, kein Produktionsdatentransfer und kein Merge.

Der Offline-CI-Workflow ist lediglich um diesen Test ergänzt; ein erfolgreicher GitHub-Run wird hier nicht behauptet. Er behält `contents:read`, gepinnten Checkout, keine persistierten Credentials, kein OIDC/Secrets/Deploy. Ein grüner Test erteilt keine Cloudfreigabe.

## Isolierter Dateiumfang

Gegenüber `8668c9e` genau acht Pfade:

1. `docs/PREPROD_CLOUD_PLAN.md` — verbindliche Hosting-/Standardhost-Entscheidung, keine erneute Hostwahl.
2. `config/preprod/proposal.json` — abgeleitete, ungeprüfte Standardhost-Vorschläge und explizite Nichtaktivierung.
3. `config/preprod/hosting/firebase.proposal.json` — nicht aktive Hosting-Vorschlagskonfiguration; kein erzeugtes Public-Verzeichnis.
4. `tools/preprod/hosting-contract.cjs` — ausschließlich In-Memory-Hosting-/Public-Manifest-Prüfung.
5. `tests/preprod-hosting.test.cjs` — 54 synthetische Struktur-/Negativtests.
6. `.github/workflows/preprod-offline-review.yml` — nur Offline-Tests/Trigger ergänzt.
7. `docs/PHASE2C_HOSTING_PLAN.md` — Architektur, Public-Allowlist, Freigaben, manuelle Checkliste, Kosten/IAM und Rollback.
8. `docs/PHASE2C_HOSTING_TEST_REPORT.md` — dieser Bericht.

Bestehende Worktrees behalten ihre Branches, Commits und lokalen Änderungen. Der ursprüngliche Entwicklungs-Diff und die vorher vorhandene unversionierte Dateiliste wurden gegen den zu Beginn im Arbeitsspeicher erfassten Git-Snapshot verglichen: unverändert, abgesehen vom erwarteten neuen Worktree-Eintrag. Phase-2A-/2B-Worktrees waren weiterhin sauber bei `06dbe61`/`8668c9e`; der ursprüngliche Feature-HEAD bleibt `cb4661f`. Keine Behauptung eines Inhalts-Hashvergleichs aller unversionierten Dateien.

## Offene Entscheidungen und Freigabeschranke

Nur tatsächliche Projekt-ID, Datenschutz-/Firestore-Standort, Billing-/Kostenrahmen/Budgetverantwortung, technischer Owner und IAM-/Approver-Modell bleiben offen. Firebase Hosting und Standard-Subdomain sind entschieden. Eigene ausdrückliche Freigaben bleiben erforderlich für Cloud-Reads, Projekt-/Billing-/IAM-/Hostinganlage, Rules, Functions, Hosting/Frontend und synthetische Cloudtests — jeweils mit exakter Projekt-ID, Umfang, Identität und Rollback. **Keine Cloud-Mutation und kein produktiver Zugriff in Phase 2C.**
