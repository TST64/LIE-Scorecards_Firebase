# Konsolidierungsmanifest – LIE Scorecards V2

13.11.2026. Branch `consolidation/lie-scorecards-v2`. **NICHT PRODUKTIONSREIF / NICHT MERGEN.** Genau ein neuer Worktree, keine Änderungen an bestehenden Worktrees, main, alten Branches/PRs oder Firebase. Künftige Entwicklung ausdrücklich iterativ von main; [HANDOVER_CURRENT_STATE.md](HANDOVER_CURRENT_STATE.md) ist der Einstieg.

## Vollständige Quellbasis und Abstammung

Basis `d50c3d9e37d05a8edef2db9684da0a304a981733`, unverändert übernommen, nicht durch Rebase/Squash neu zusammengesetzt. `git merge-base --is-ancestor` bestätigt folgende erforderlichen Stufen:

| Quelle | Commit | Enthalten |
| --- | --- | --- |
| Autorisierte lokale V1-Autosync-Vorschau | `8763d7b` | ja; alle sechs ursprünglichen Dirty-Dateien nach CRLF/LF-Normalisierung exakt identisch |
| S01 / PR#13 | `f862cf0c8f73ef610cdc711218e2a1dd84b8a839` | ja |
| S04 / PR#15 | `3d77af88318679d30896b9d611bbaf812af4d4a7` | ja |
| S02/S03 / PR#17 | `437c76d4cadbba2bc6587acac2f60b5aa616b7f6` | ja |
| S06 / PR#19 | `295d13b46762b9b42a45dec481f87cce6f960cb1` | ja |
| S05 / PR#21 | `2c32064a9850eeac10587d807f1d523d3bcafe8f` | ja |
| S07 / PR#23 | `9a29e2ea23d0f3306a96a5e352b11e30f0104352` | ja |
| S08.1 / PR#25 | `684c470b8c2411da82058b401df0b108fa0d4440` | ja |
| S08.2 / PR#27 | `3d55211fd82689fee761ce27d910a76a2f1a0ebb` | ja |
| RC/Diagnose/Performance/Start/Live-/Cloudadapter/Produktions-NO-GO | `5174064`, `9a8c71e`, `b3ee957`, `37afa5c`, `76df958`, `3f51d11`, `f7ef0a3`, `d50c3d9` | ja, einschließlich ihrer Regressionstest-Commits |
| Separater HCP-Featurebranch | `1f67ef5` | bereits Vorfahr der Basis |
| Frühe unabhängige Dokumentations-PRs | `5eba4e6`, `afadff8` | keine Vorfahren; Berichte separat archiviert |
| Paralleler V1-Hotfix | `55c0db4` | kein Vorfahr; nur als nicht angewendeter Referenzpatch archiviert |

Die36 Commits `main..d50c3d9` sind keine36 zusammenzuführenden Alternativen, sondern die erhaltene Entwicklungslinie. Vollständige lokale Branch- und tatsächliche Remote-HEAD-Inventur: [consolidation/GIT_SNAPSHOT.json](consolidation/GIT_SNAPSHOT.json). GitHub-PR-Zustände wurden über den Connector lesend abgefragt, nicht aus veralteten Remote-Tracking-Refs erraten.

## Einzelne Übernahmen / Konfliktentscheidungen

| Konsolidierungscommit | Fachliche Übernahme | Herkunft / bewusste Anpassung |
| --- | --- | --- |
| `48dcdfa` | `docs/PROJECT_STATUS.md` | Ursprüngliche lokale Datei; entspricht normalisiert PR#1/`5eba4e6`. Historischer Warnkopf, ein früher Initialwert redigiert. Kein aktueller Betriebsstatus daraus behauptet. |
| `a588479` | `docs/PREPROD_SAFETY_ANALYSIS.md` | PR#3/`afadff8`, bislang nicht in d50. Historischer Warnkopf; kein aktives Config-/Backend-Import. |
| `2262fd3` | `docs/history/V1_HOTFIX_55c0db4.patch` und Kontext | Exakter Diff des parallelen lokalen Hotfixes, einschließlich damaliger Tests. Nicht angewendet, nicht beim Start ausgeführt, keine Überschreibung der V2-Dateien. |
| `6055a4c` | Eingabe-/Git-/PR-/Testnachweise, Ausschlussregeln, portable RC-Startanleitung | Ausschließlich bereinigte Metadaten; ursprüngliche Dateien unangetastet. Keine Änderung an Anwendungs-/Rules-/Functionslogik. |
| Übergabeabschluss | Diese beiden geforderten Dokumente und Draft-PR-Entwurf | Kein weiterer Feature-/Architekturauftrag. Der konkrete End-Commit ergibt sich aus HEAD; kein rekursiver eigener SHA in einer Datei. |
| Publikationsabschluss | Tatsächlicher GitHub-/PR-Status und Integritätsbelege | Nach ausdrücklicher Freigabe: nur neuer Branch gepusht, Draft-PR#28 gegen main erstellt. Statusänderung ohne Anwendungsänderung; keine alten PRs/Branches oder Firebase-Ressourcen geändert. |

Eine erneute Übernahme alter Dirty-Appdateien wurde **bewusst nicht** vorgenommen: sie sind durch `8763d7b` bereits enthalten und durch spätere Sicherheitskorrekturen supersediert. Es gab keine versteckten Konfliktauflösungen, kein `merge -s ours` und kein Reset/Overwrite. Alle neun Autosync-Erweiterungsfunktionen sind im aktuellen Stand vorhanden; ihr sicherer neuer Vertrag hat Vorrang vor der alten Implementierung.

Vollständige Einzelfile-Tabelle, Größen und Roh-SHA256: [consolidation/LOCAL_INPUT_DECISIONS.md](consolidation/LOCAL_INPUT_DECISIONS.md), [consolidation/SOURCE_INPUTS.json](consolidation/SOURCE_INPUTS.json).

## Ausgelassen und weiterhin lokal erhalten

- Die sechs alten App-/Config-/Worker-Dateiversionen werden nicht nochmals über neueren Code kopiert. Original bleibt im ursprünglichen Dirty-Worktree; vollständige historische Fassung bereits im enthaltenen Commit8763d7b.
- `fiveserver.config.js`: offene LAN-Konfiguration, nicht Teil des geprüften lokalen Wrappers. Kein neuer Servermodus eingeführt.
- Drei `design-reference/`-Bilder: Personen-/Score-Bezug beziehungsweise nicht bestätigte synthetische Herkunft. Nicht veröffentlicht, keine Bildinhalte in Dokumentation kopiert; nur Herkunftshashes und nicht identifizierende Gestaltungsabsicht dokumentiert.
- Alle verschachtelten Worktrees, `node_modules`, `.local-runtime`, Browserprofile, Emulator-/Restore-Daten, private Sicherungen, OAuth-/CLI-Caches, `.env`-Dateien mit Laufzeitdaten und generierte ZIPs/Hostingpakete. Kein benötigtes Runtime-Artefakt wird aus einem anderen Worktree gelinkt/kopiert.
- Keine zusätzlichen Änderungen am separaten HCP-/Hotfix-Branch, keine PR-Schließungen oder Branch-Löschungen. Keine produktiven PINs, Tokens oder privaten Schlüssel übernommen. Öffentliche vorhandene Firebase-Web-IDs sind keine geheimen Admin-Credentials; bereits enthaltene synthetische Testkonstanten bleiben als Tests erkennbar.

## Reproduzierbare gezielte Zusammenführungsprüfung

Aus dem Root des neuen Worktrees, nach separatem `npm ci` und `npm --prefix functions ci` mit den vorhandenen Lockfiles:

```powershell
node --test tests/v1-s01-snapshot.test.cjs tests/v1-s01-bridge.test.cjs tests/score-auto-sync.test.cjs tests/score-screen.test.cjs tests/rc-live-scoreboard.test.cjs tests/round-close-s05-client.test.cjs tests/local-environment.test.cjs tests/preprod-start-adapter.test.cjs tests/production-release.test.cjs tests/rc-round-start.test.cjs tests/rc-compatibility.test.cjs tests/fieldtest-proposal.test.cjs
node tests/run-score-sync-browser.cjs
node tests/run-score-screen-browser.cjs
```

Ergebnis **147/147 Node-Tests**, keine Fehler/Skips; **27/27** IndexedDB-/Sync-Browsertests; **75 Checks je320/390/1024px**, dabei jeweils V1-/V2-Transportwrites0. [VALIDATION.json](consolidation/VALIDATION.json) enthält bereinigte Zähler und SHA256 der eigenen lokalen Testlogs. Isolierte neue Browserprofile und Loopback-/Offline-Prüfungen, kein produktiver Zugriff und keine neue allgemeine Emulator-/Cloud-Testkampagne. Vorhandene S08.2-/RC-UI-/Restore-Nachweise werden unverändert mit ihren NO-GO-Grenzen referenziert.

Die aktive Anwendungs-, V2-, HCP-, Live-/Abschluss-, Rules-, Functions- und Konfigurationsquellen müssen gegenüber d50 **ohne Diff** bleiben. Die Konsolidierung fügt ausschließlich Dokumentation/Archivmaterial, eine klarere portable README und Ignore-Schutz hinzu. Dateisystem-/Git-Scans prüfen neue Inhalte und Abhängigkeiten; Browser-/Java-Installationen sind externe Werkzeuge, keine Abhängigkeit von einem alten Worktree.

## Veröffentlichungs- und Integritätsstatus

`main` und `origin/main`/tatsächlicher Remote-main bei `f4dcbecf9c4c95ca30135f3f2a1458def82ca757`. Die21 bisherigen Worktrees bleiben in HEAD, Status und ursprünglichen Dirty-Hashes erhalten; der neue Worktree ist die einzige beauftragte Ergänzung. Der ursprüngliche Root sieht erwartungsgemäß einen zusätzlichen unversionierten Worktree-Ordner; gegenüber der **nach Erstellung** erfassten Baseline darf sonst kein Unterschied entstehen.

Push und neuer Draft-PR gegen main wurden **nach ausdrücklicher Benutzerfreigabe** ausgeführt: erster veröffentlichter HEAD `12ee52ea0a9bdbcbd35cff43fddfdaaabbefb826`, [Draft-PR#28](https://github.com/TST64/LIE-Scorecards_Firebase/pull/28). Danach ausschließlich Publikationsstatus und abschließende Integritätsbelege dokumentiert. Titel/Body: [consolidation/DRAFT_PR.md](consolidation/DRAFT_PR.md). Ziel ausschließlich main, Draft, **NICHT PRODUKTIONSREIF / NICHT MERGEN**. Alte PRs/Branches bleiben bestehen; nur `consolidation/lie-scorecards-v2` wurde gepusht, niemals main oder die alte PR-Kette. Keine Freigabe für Merge oder Deployment.
