# Phase 2B: Offline-Gates und tatsächliche Testergebnisse

Stand: 08.11.2026, Europe/Berlin. Issue #6; Basis Draft-PR #5 (`06dbe619beb8494d7abd194cc76cace448e37a5e`). Neuer isolierter Worktree `.codex-phase2b-worktree`, Branch `codex/preprod-cloud-preparation`. Keine Änderung der bestehenden Entwicklungs-/Review-Worktrees, kein Merge.

## Ausgeführte Prüfungen

Node `v22.21.0`; keine Paketinstallation und kein SDK-/Emulatorstart für Phase 2B. Testdaten sind ausschließlich synthetische öffentliche Metadaten. Der einzige echte Socket-Test ist ein kurzlebiger Loopback-Server aus der unveränderten Phase-2A-Sicherheitssuite. Er lief mit gesondert erlaubtem lokalen Netzwerkzugriff außerhalb der Dateisandbox; keine Firebase-Projektressource wurde angesprochen.

| Tatsächlicher Befehl | Ergebnis |
| --- | --- |
| `node --test tests/preprod-gates.test.cjs` | Exit 0; 48 Tests bestanden, 0 fehlgeschlagen, 0 übersprungen |
| `node --test tests/preprod-gates.test.cjs tests/local-environment.test.cjs` | Exit 0; 61 Tests bestanden (48 Phase 2B + 13 unveränderte Phase-2A-Sicherheitsprüfungen), 0 fehlgeschlagen, 0 übersprungen |
| `node tools/preprod/review.cjs inspect` | Exit 0; `approvedTargetCount: 0`, `cloudExecutionAuthorized: false` |
| `node tools/preprod/review.cjs check --manifest config/preprod/proposal.json --project lie-scorecards-preprod --component functions` | **Erwarteter Exit 1**; `target-not-approved`, `cloudExecutionAuthorized: false`. Vorschlag wird nicht zur Freigabe umgedeutet. |
| `git diff --name-only 06dbe61` vor Vormerken der neuen Dateien | Keine geänderte bestehende Basisdatei; Status ausschließlich neue Phase-2B-Dateien |
| `git diff --check` | Keine gemeldeten Whitespacefehler; neue Dateien werden zusätzlich nach Vormerken geprüft |

Keine fehlgeschlagenen automatisierten Tests in diesen Läufen. Der abgelehnte CLI-Check ist eine erfolgreiche Negativprüfung, kein verschwiegenes Testergebnis.

## Abdeckung und Aussagekraft

- Eingecheckte Policy bleibt gesperrt und besitzt keine freigegebenen Zielprojekte.
- Vier positive **synthetische Strukturtests** für Rules, Functions, Frontend und Rollback liefern trotz passender Metadaten stets `cloudExecutionAuthorized: false`; die Ausführungsfunktion verweigert unbedingt.
- Negativfälle: Produktions-ID auch in verschachteltem Artefaktinhalt, fehlende explizite Auswahl, unbekanntes Projekt/Komponente, vermeintliches Einschalten der Policy, HTTP-/Produktions-/ungültige oder nicht passende Domain, unterschiedliche Frontend-/Server-/Hosting-/Identitätsprojekte, lokaler statt PreProd-Modus, fehlendes Banner, Pufferübernahme, aktivierter Worker, CLI-Default, reale GAS-Hostmuster, Live-Mail, fehlende/fremde/Default-Credentials, Schlüsselmodus, deklarierter Produktionszugriff und nicht geprüfte vererbte Rechte.
- Fehlende, implizite, abgelaufene oder für andere Komponente/anderen Artefakt-Digest geltende Freigaben werden abgelehnt. Manipulierte Dateiinhalte/Digests, unerlaubte Pfade und Credentialmaterial-Felder ebenfalls.
- Rollback verlangt eine eigene Auswahl und passenden alten Artefakt-Digest mit Kompatibilitätsreview.
- Der Argumentparser akzeptiert keine Deployoperation, Tokenoption, beliebigen Firebase-Befehl oder implizite Projektauswahl.
- Ein eingeschränkter VM-Test lädt das Gate ausschließlich mit `node:crypto` und `URL`, ohne Netzwerk-/SDK-/Datei-/Subprozessfähigkeiten. Auch darin kann ein passendes synthetisches Bundle keine Ausführung freischalten.
- Die unveränderten Phase-2A-Validatoren lehnen Cloudmodus/Cloudprojekt weiterhin ab. Alle 13 vorhandenen lokalen Sicherheitstests bestehen, einschließlich Readiness-/Service-Worker-/Puffer-/Besitzer-/ACK-/Netzwerk-Negativfällen.

**Keine IAM-Verifikation behauptet:** `productionAccess: absent`, Evidence-Referenzen und Approvalfelder der Testfixtures sind selbst deklarierte synthetische Daten. Sie belegen keine tatsächlichen Rechte oder echte Freigabe. Genau deshalb besteht kein Cloud-Ausführungspfad. Der Digest ist ein Integritätsvergleich öffentlicher Reviewdateien, keine Signatur oder vertrauenswürdige Buildprovenienz.

## Nicht ausgeführt / nicht bewiesen

- Keine Firebase-/GCP-Projektanlage, Bestandsabfrage, IAM-/Billing-/DNS-Operation, Domainaufschaltung, Auth-Nutzeranlage, Cloud-Deploy, Datenmigration oder E-Mail. Keine echten Service-Account-Schlüssel, Tokens oder Credentials gelesen/erzeugt.
- Keine Prüfung der Verfügbarkeit des vorgeschlagenen Projektnamens oder einer echten Domain. `.invalid` im Plan ist absichtlicher Platzhalter.
- Kein PreProd-Cloud-Bootstrap und kein PreProd-Anwendungsartefakt erstellt. Phase 2A bleibt lokal-only. Keine Behauptung, dass der bestehende App-Code Cloud-PreProd bereits unterstützt.
- Die Browser-/Dreidienste-Integration aus Phase 2A und die fachlichen Score-/HCP-Suites wurden hier nicht erneut ausgeführt; ihr Code wurde nicht verändert. Die damaligen Ergebnisse stehen im geerbten Phase-2A-Bericht als historische Tests.
- Der neue GitHub-Workflow wurde lokal statisch gelesen, nicht als erfolgreicher GitHub-Run behauptet. Er führt nur Offline-Tests/Policyanzeige aus und besitzt keine OIDC-/Secret-/Deployschritte.
- Kein systemweiter Schutz gegen manuelle externe Firebase-CLI-Nutzung. Der zukünftige ausführbare CI-/IAM-Freigabepfad benötigt separate Implementierung, vertrauenswürdige Evidenz und ausdrückliche Autorisierung. Ein grüner Offline-Test oder Merge dieses PRs erteilt keine Cloudfreigabe.

## Dateiumfang dieser Phase

Gegenüber `06dbe61` ausschließlich acht neue Dateien:

1. `config/preprod/policy.json` — leere Allowlist, Ausführung gesperrt.
2. `config/preprod/proposal.json` — öffentliche ungeprüfte Vorschläge und offene Verantwortlichkeiten.
3. `tools/preprod/gate.cjs` — Offline-Strukturvertrag, Integritäts-/Negativprüfungen und unbedingte Ausführungssperre.
4. `tools/preprod/review.cjs` — reine lokale Policyanzeige/Review-CLI ohne Credential-/Netzwerk-/Deployfunktion.
5. `tests/preprod-gates.test.cjs` — synthetische positive/negative Prüfungen.
6. `.github/workflows/preprod-offline-review.yml` — ausschließlich lesender Offline-Testjob.
7. `docs/PREPROD_CLOUD_PLAN.md` — Architektur, Entscheidungen, getrennte Freigaben, Provisionierungs-/Deploycheckliste und Rollback.
8. `docs/PHASE2B_GATE_TEST_REPORT.md` — dieser Bericht.

Keine Änderung an aktiver `.firebaserc`, `config.js`, `firebase.json`, Rules, Functions, App-Logik, lokalem Startwrapper, bestehenden Tests oder bisherigen PRs. Der neue Draft-PR enthält gegenüber `main` außerdem die geerbten, noch nicht gemergten Phase-2A-/Feature-Commits; der zusätzliche Phase-2B-Umfang ist gegenüber seiner expliziten Basis `06dbe61` getrennt prüfbar.

## Offene Entscheidungsschranke

Projekt-ID und Region, tatsächlicher Domain-/Hostingplan, Budget-/Projektverantwortliche, komponentengetrenntes IAM-/WIF-Modell, Sicherheitsreviewer und Freigabeprozess bleiben offen. Die genaue Übersicht steht im Cloudplan. Nach Review ist eine separate, ausdrückliche Freigabe für definierte Cloud-Reads und jede spätere Mutation erforderlich. Bis dahin bleiben Allowlist und Ausführungsweg gesperrt.
