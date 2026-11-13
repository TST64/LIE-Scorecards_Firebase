# Übergabe: konsolidierter LIE-Scorecards-V2-Referenzstand

**NICHT PRODUKTIONSREIF · NICHT NACH MAIN MERGEN · KEINE DEPLOYMENT-FREIGABE.** Stand13.11.2026, Europe/Berlin. Zielbranch `consolidation/lie-scorecards-v2`, einmalig isoliert aus `d50c3d9e37d05a8edef2db9684da0a304a981733` erstellt. Die weitere Produktentwicklung soll ausdrücklich von der funktionierenden **main-Version** ausgehen und ihre Schwachstellen einzeln beheben. Dieser Branch ist eine vollständige technische Referenz, kein vorgesehener Gesamt-Merge.

## Einstieg für die nächste KI

1. Diese Übergabe, [CONSOLIDATION_MANIFEST.md](CONSOLIDATION_MANIFEST.md) und den tatsächlichen Git-Status lesen. Historische Dokumente enthalten zeitgebundene Aussagen, keine heutigen Freigaben.
2. Defaultstart nur lokal: Node22/Java21+, aus dem Root eines frischen Checkouts `npm ci --ignore-scripts --no-audit --no-fund`, `npm --prefix functions ci --ignore-scripts --no-audit --no-fund`, danach `npm run rc`. Keine Abhängigkeit von `.codex-rc-live-worktree` oder anderen Worktrees. Browser/Java müssen lokal installiert sein; generierte Laufzeitdateien sind absichtlich nicht versioniert.
3. Emulator-Demo hat zwölf synthetische Spieler und keine vorab aktive Runde. Erst als synthetischer Admin einen normalen Spieltag anlegen. Bekannte lokale Fixture-Zugänge sind ausschließlich Emulator-Testdaten, keine ausgegebenen Produktions-/PreProd-PINs.
4. Kein `firebase deploy`, kein Audit-/Export-/Migrationstool, keine Cloud-Anmeldung und kein Produktionsstart ohne gesonderte ausdrückliche Autorisierung. Insbesondere `tools/production-audit.cjs` ist **kein** Offline-Test, sondern würde den vorhandenen Firebase-Zugang lesend verwenden; nicht versehentlich ausführen.

## 1. Tatsächliche produktive Architektur

Quellen: main `f4dcbecf9c4c95ca30135f3f2a1458def82ca757`, alte Implementierung und bereits abgeschlossene lesende Inventur vom13.11.2026 in [PRODUCTION_INVENTORY_2026-11-13.json](PRODUCTION_INVENTORY_2026-11-13.json). **In der Konsolidierung wurden keine Firebase-/Produktionszugriffe wiederholt.**

- Statische JavaScript-SPA mit globalem `window.app`/`app.state`, `Views_*.js`, eigenem Router, Firebase-Web-SDK/Compat und früheren CDN-/PWA-Abhängigkeiten.
- Bestätigte ausgelieferte Adresse `https://app.lochihnein.de`, Server GitHub.com/GitHub Pages, Version `5.3.3-flight-preview`, Firebase-Projekt `liescorecard-70c5e`. Die öffentliche Versionskennung passt zu main; die exakte Identität **aller** ausgelieferten Dateien mit einem Git-Commit wurde nicht bewiesen.
- PIN-Login über Auth-Callables und Custom Tokens. Produktiv beobachtet: vier Auth-Functions in `europe-west1`; keine V2-/Abschluss-Callables. Temp-PIN-/GAS-Verfahren ist Teil der alten Architektur, kein freigegebener Bestandteil der neuen Cloud-Adapter.
- V1-Clientzugriff auf Firestore, lokale Livewerte, manuelles Sichern/alte Writer, klientseitige Ergebnisse/HCPs. Private/öffentliche Spielerprojektionen sind getrennt, aber Backend und Rules müssen jeweils mit der wirklich ausgelieferten Version abgeglichen werden.
- Firestore `(default)`, Native, `eur3`. Frühere Inventur: 15 private/öffentliche Spielerprofile, 42 Runden, 707 Scorecards, 70 Flights; 17 Rundendokumente mit Status `Aktiv`, 25 mit `Beendet`. Keine Aussage, dass alle17 heute tatsächlich bespielt oder nicht gelöscht sind.
- Die registrierte Firebase-Hosting-Site hat **keine Veröffentlichung**, ihre Standardadresse lieferte404. Sie ist nicht das bestehende Frontend-/Rollback-Ziel. Kein Domain-/DNS-Wechsel wurde durchgeführt.

## 2. Architektur der konsolidierten V2-Linie

| Bereich | Implementierung / Vertrag |
| --- | --- |
| Oberfläche | Bestehende SPA; neue V2-Score-Eingabe bleibt optisch unverändert. `Views_LiveScoreboard.js` stellt Matrix/Liste/Flights bereit; `Views_RoundClose.js` verbessert die Abschlussansicht. |
| Eingabe/Persistenz | `App_Storage_ScoreSync.js`, `App_Storage_ScoreEntryContext.js`, `App_Logic_ScoreEntryV2.js`: dauerhafte Operationen, eigener Owner-/Flight-/Rundenkontext, bestätigter Cache und ausdrücklich getrennte Pending-/Konfliktzustände. |
| Automatischer Versand | `App_Logic_ScoreAutoSyncV2.js`, `App_Logic_ScoreSyncV2.js`: tatsächlicher normaler Sendepfad, stabile Request-/Mutation-IDs, sichere Wiederholung; Feld-CAS und Dokumentgeneration statt unversioniertem Überschreiben. |
| Server-Scorevertrag | `functions/score-operations-v2.js`, `score-read-v2.js`: Auth/Claims/Rolle/Flight/Bahnen prüfen, Generations-/Feldrevisionen, Receipts/Mutation-Belege und Firestore-Creation-Time-Bindings. Rules verbieten direkte alte Score-Schreibwege. Admin SDK umgeht Rules, muss daher dieselben fachlichen Schutzprüfungen serverseitig durchsetzen. |
| HCP/Rundenstart | Kanonische bytegleiche Gruppenregel in `functions/hcp-rules.js`/`Hcp_Rules.js`; autoritative `round-start.js`-Snapshots. HCP0 bleibt0, Vorgaben stammen aus eingefrorenen Bahnen-/Tabellendaten. |
| Live-Gesamtsicht | Atomarer Saisonleser `readPublishedSeasonV1` plus rein lesendes `roundClosureV1/inspect`. Der Browser bindet Rohkarten/Flights/Snapshots über denselben kanonischen Digest an die serverseitige V2-Prüfung. Kein lokales Pending und kein heutiger HCP als Ersatzwert. Sequenzielles Polling, kein F5 nötig. |
| Rundenschluss | `round-close.js`: geprüftes Abschlussfenster, lokale Pending-/Persistenz-Gates, persönliche Freigaben pro Flight, konsistenter Digest/Revision, idempotente Receipts und einmalige HCP-Veröffentlichung. Server kann fremde Offline-Queues nicht entdecken. |
| Historische Korrektur | S07: privates begrenztes Staging, vollständige HCP-Folgekette, sichere Wiederaufnahme nach Batchfehler und atomare Veröffentlichung mit Published-Control. Kein halb fertiger Saisonstand; keine alten Batch-Schreiber. |
| Restore | S08.1: synthetischer lokaler logischer Kaltstart mit Auth-/Claim-Zuständen und überprüften neu entstandenen Birth-Bindings. Kein Nachweis für nativen Cloud-Import/PITR. |
| Umgebung | Default ausschließlich `local`/Demo/Loopback. Separate PreProd- und Produktions-Buildadapter mit ausdrücklichem Projekt/Origin, eigenen Speichernamen und lazy Cloud-Runtime-Initialisierung. Root-Checkout startet nicht automatisch gegen Produktion. |

Die bestätigte Gruppenreferenz ist Saisonstart26, Soll18/36 Nettopunkte bei9/18 Löchern, Verbesserung−0,5 bzw. Verschlechterung+0,1 je Punkt, eine Nachkommastelle, Grenzen0–54. Die technische Strich-Regel zählt0 Punkte. DNF/unvollständige Runden und Brutto-/Putts-Veröffentlichung sind nicht zusätzlich fachlich abgenommen und bleiben entsprechend gesperrt.

## 3. Aus Produktion beibehalten

SPA-Struktur/Router, Login-Idee mit eigener Spieleridentität, Spieler-/Kurs-/Loch-/Flightmodelle, Rundentypen9-Front/9-Back/18, Rohfelder Schläge/Putts/Lady/Strich, vertraute Grün-Gestaltung sowie Matrix-/Listen-/Flightkonzept. Bestehende Runden-/Karten-/HCP-Felder sollen erhalten bleiben; die Datenkompatibilität wurde damit **nicht** automatisch hergestellt. Spieler-/Kurs-/Kalender-/Adminansichten bleiben als vorhandener Quellstand enthalten; ihre vollständige produktive Parität ist nicht neu abgenommen.

Die vollständige S01–S08.2-Historie bleibt erreichbar. Neun Funktionen der ursprünglichen lokalen Autosync-Vorschau sind bereits historisch enthalten und später ersetzt/abgesichert worden. Es wurde keine neuere Sicherheitsimplementierung durch eine ältere Dateikopie ersetzt.

## 4. Geändert, ersetzt oder bewusst gesperrt

- Snapshot-/ACK-/ABA-/Persistenzfehler wurden über S01-Journale repariert; normale Eingabe sendet inzwischen automatisch über V2.
- Direkte V1-/unversionierte Admin-/History-/Schnellerfassungs-Writer bleiben gesperrt. Der alte `leaderboardLegacyReference` bleibt **Designreferenz**, wird nicht als aktive Berechnung oder Fallback aufgerufen.
- Live-Netto ist ausdrücklich vorläufig; veröffentlichte Sieger/HCPs werden ausschließlich aus dem bestätigten Abschluss gezeigt. Brutto/Putts werden nicht zu offiziellen Gewinnern hochgerechnet.
- PIN-Wechsel wurde auf konsistente Firestore-/Auth-Claims und sichere Fehler-/Retrybehandlung umgestellt. Login gegen echte Produktion wurde nicht als Teil dieser Konsolidierung getestet.
- Rundentyp-Unklarheit: Performance zeigt fragliche historische Runden mit Rohwerten und Prüfhinweis; keine neuen/geschätzten HCPs und keine erfundene gültige Folgekette. Die geplante Admin-Rundentyp-Reparatur ist keine implementierte Schreibfunktion.
- Local/PreProd/Production haben explizite getrennte Startadapter und Speicher-Namensräume. Es gibt keinen Produktions-Fallback. Die Cloud-Pakete sind nicht bereitgestellt oder freigegeben.

## 5. Nachgewiesene alte Fehler und Evidenzgrenzen

Historische Regressionen belegen Verlust/Fehlbestätigung bei Eingaben während Requests, ABA, ungesendeten Feldern, Defaults und Persistenzfehlern; PIN-/Claims-Split; konkurrierende bestätigte Scores durch alte Schreiber; HCP0-/Vorgabenfehler; doppelte/konkurrierende Abschlüsse; Halbveröffentlichungs-/Wiederaufnahme-Risiken historischer Batches. Die konkrete Ausgangsbasis steht jeweils in den S01/S04/S02-S03/S06/S05/S07-Berichten. **Nicht jede Regression ist damit als heutiger unveränderter main-Fehler oder Live-Schaden bewiesen**; Teile stammen aus der damaligen lokalen Feature-Vorschau.

Quelltextlich belegt: ein Verzeichnisname „PreProd“ und lokales HTTP isolieren Firebase nicht; die ursprüngliche lokale Konfiguration zeigte auf Produktion und hatte keine Emulatorumleitung. Frühere Login-Discovery konnte Projektionen schreiben. Lesend aussehende Funktionsaufrufe sind daher nicht pauschal schreibfrei.

Spätere konkrete RC-Fixes: erneute Anmeldung desselben Owners ließ einen invalidierten V2-Controller scheinbar bereit; der Demo-Seed reservierte alle12 Spieler in einer aktiven Runde und verhinderte normale UI-Rundenstarts; die Performance blendete unvollständige18-Loch-Konfigurationen ganz aus. Diese Fixes sind Bestandteil von d50. Keine produktive Datenreparatur daraus ableiten.

## 6. Testnachweise und ihre Grenzen

**Neu in genau diesem isolierten Worktree ausgeführt:** [consolidation/VALIDATION.json](consolidation/VALIDATION.json), 147 gezielt ausgewählte vorhandene Node-Tests ohne Fehler/Skips; 27 echte IndexedDB-/Sync-Browserprüfungen; je75 Offline-DOM-/Sichtprüfungen der V2-Eingabe bei320/390/1024px. Root-/Functions-Abhängigkeiten ausschließlich per jeweiligem Lockfile neu installiert. Keine App-Quelle gegenüber d50 verändert, keine andere Worktree-Quelle/JAR/Datenbank benötigt. Kein Firebase-/Cloud-Aufruf, keine neue Emulator-Generalprobe.

Übernommene frühere Evidenz bleibt zeitgebunden:

- S08.2/PR#27: 381 Node-Tests und Zwölf-Profil-Generalprobe mit432 UI-Karten/3 Abschlüssen sowie Historien-/Restore-Szenarien. Matrix24 PASS/2 OFFEN, **keine** uneingeschränkte lokale Gesamtfreigabe.
- RC-Live-UI: drei Browserprofile,108 über normale UI bestätigte Karten, Offline/Wiederverbindung, automatisches Live-Update, gleicher Netto-/HCP-Abschlussstand. Keine physischen Smartphones.
- PreProd-Adapter: 58 gezielte Adapter-/Auth-/Startprüfungen; reales Functions-SDK-Discovery bei gesperrten Cloud-Sockets und ohne ADC-Initialisierung. Keine echte Cloud-Runtime-/IAM-Abnahme.
- Produktionspaket:33 gezielte lokale Prüfungen; tatsächlicher Legacy-Bestand inkompatibel, deshalb NO-GO. Ein gebautes ZIP oder Suite-Exit0 ist kein Rolloutbeleg.

## 7. Bekannte Probleme des V2-Referenzstands

- **G02:** neue Dokumentgeneration lässt die alte Operation sicher pending; vollständige UI-Recovery fehlt. **F02:** Flightwechsel kann sichere Pending-Reste behalten; keine automatische Löschung/Umwidmung. Drei gleichzeitige Schreiber beseitigen diese Zustandswechsel nicht.
- Reale Android-/iOS-Geräte, Browserhintergrund, OS-Suspend, Funk-/Speicherdruck und persönliche Geräteabnahme sind nicht durch Desktop-Headless-Simulation ersetzt.
- Cloud-Projekte/Runtime-IAM/Billing/echte Web-Konfiguration und Restore sind nicht aus Offline-Adapterprüfungen ableitbar. PreProd-Vorlage ist keine vorhandene Online-Umgebung.
- Fachlich offene DNF-/unvollständige Runden/Brutto-/Putts-Wertungen bleiben Sperren. Historische18-/9-Loch-Reparatur ist nur Diagnose/Vorschau/Plan, kein freigegebener Writer.
- Einige Dateien enthalten weiterhin alte Implementierungen als Referenz; die tatsächlich wirksamen Overrides/Guards und Rules prüfen, nicht den ersten gefundenen Funktionsblock allein.

## 8. Konkrete Produktionsinkompatibilität

Die bereits autorisiert erhobene Inventur vom13.11. belegt: **42 Runden ohne numerische V2-Start-Snapshots,707 Karten ohne Generationsbelege, keine Closure-/Published-Control-Belege.** Zwei Profile ohne Hash; individuelle Claim-/Hashformate nicht geprüft. PITR/Löschschutz damals deaktiviert. Benutzer bestätigte fehlende Backup-/DR-Ziele; Export/Restore wurden nicht gestartet.

Diese Daten dürfen nicht als autoritativ nachgerüstet, mit synthetischen Spielern vermischt oder durch neue Seeds ersetzt werden. Ein V2-Start-/Leser-/Abschluss gegen solche Bestände wird absichtlich abgewiesen. Es gibt keinen Nachweis, dass alle historischen Runden/HCP-Ketten unter V2 bereits produktiv kompatibel sind. Neue Origin-/Speicher-Namensräume und aktive alte Service Worker verlangen außerdem vorherigen persönlichen Pending-Abgleich, keine Speicherlöschung.

Maßgeblich: [PRODUCTION_RELEASE_2026-11-13.md](PRODUCTION_RELEASE_2026-11-13.md), [FIREBASE_BACKUP_ROLLBACK.md](FIREBASE_BACKUP_ROLLBACK.md). Ein unveränderter Altclient darf nach V2-Writes nicht blind als Rollback eingesetzt werden. GitHub Pages ist der tatsächliche Frontendhost; Firebase Hosting ist nicht der bestätigte Rückfallpunkt. Generierte ZIPs/Emulatorbestände/private Sicherungen sind nicht Bestandteil dieser Konsolidierung.

## 9. Empfehlungen: iterativ von main aus weiterentwickeln

**Nicht diese Draft-PR-Kette nach main durchmergen.** Für jede konkret gewünschte Verbesserung den dann aktuellen main-HEAD als Basis und die funktionierende Produktion als Vergleich nehmen. Einen kleinen Fehler reproduzieren, eng korrigieren und gezielt abnehmen. Den Konsolidierungsbranch nur für Quell-/Vertrags-/Testreferenzen heranziehen.

Zuerst nachgewiesene Datenverlust-/Bestätigungs-/Persistenz- und PIN-/Claims-Probleme im **wirklichen main-Stand** priorisieren; der historische V1-Hotfix im Archiv kann Vergleichsmaterial sein, kein automatischer Patchauftrag. Keine neue Writer-Generation ohne Datenvertrag/Backup/Cutover in den Altbestand schieben. Darstellung getrennt von fachlicher Veröffentlichung behandeln; HCP-/Historienänderungen nur mit expliziten Gruppenregeln und erhaltener Rohdatenkette. Produktionsreads, Konto-/Datenreparaturen, Exporte, Projekte und Deployments jeweils nur im ausdrücklich genehmigten Umfang.

## 10. Exakter GitHub-/Branch-/PR-/Worktree-Status

- Repository: `TST64/LIE-Scorecards_Firebase`. Lesende `git ls-remote --heads origin`-Abfrage bestätigt16 Remote-Branches, darunter main `f4dcbecf9c4c95ca30135f3f2a1458def82ca757` und neuester veröffentlichter V2-Stand `3d55211fd82689fee761ce27d910a76a2f1a0ebb`. RC-Commits nach3d55211 sind vor Veröffentlichung nur lokal vorhanden.
- Baseline aller lokalen/gespeicherten Remote-Referenzen und21 anderen Worktrees mit HEAD/Branch/Status/Dirty-Hashes: [consolidation/GIT_SNAPSHOT.json](consolidation/GIT_SNAPSHOT.json). Erfassungszeitpunkt ist ausdrücklich vor den Dokumentationsimporten; die dortige Konsolidierungsreferenz d50 ist die Erstellungsbasis, nicht der spätere End-HEAD.
- Der ursprüngliche Worktree bleibt `feature/score-autosync`/`cb4661f`, mit seinen sechs unveränderten Dirty-Dateien und unversionierten lokalen Dateien. Kein vorhandener Branch wurde umgehängt, zurückgesetzt oder gelöscht; main bleibt unverändert.
- Neuer einziger Worktree: `C:\Users\thoma\source\repos\DEV_Google\LIE Scorecards_Firebase PreProd\.codex-consolidation-worktree`; Branch `consolidation/lie-scorecards-v2`. Quellbasis d50 ist vollständig enthalten. Den endgültigen selbstreferenziellen Dokumentations-HEAD mit `git rev-parse HEAD` bestimmen; konkrete Übernahme-Commits stehen im Manifest und `git log d50c3d9..HEAD`.
- GitHub-PRs#1/#3 offen und nicht Draft, #5/#7/#9/#11/#13/#15/#17/#19/#21/#23/#25/#27 offen/Draft; alle ungemergt. Vollständige HEAD-/Basis-IDs: [consolidation/PR_SNAPSHOT.json](consolidation/PR_SNAPSHOT.json). Die S01–S08.2-Stufen sind lokal nachweislich Vorfahren von d50; die frühen Berichte und der parallele Hotfix wurden nur als separate Referenzen archiviert.
- **Veröffentlichungsstatus: lokal fertiggestellt, Push/Draft-PR noch nicht ausdrücklich freigegeben.** Kein Remote-Konsolidierungsbranch und kein neuer PR angelegt. Vorgesehenes PR-Ziel ausschließlich main, Draft, Titel **NICHT PRODUKTIONSREIF / NICHT MERGEN**. Die bestehenden PRs bleiben bestehen. Eine neue KI darf die bedingte Phase5-Anweisung nicht als bereits erteilte Veröffentlichungsfreigabe interpretieren.

Ein Git-Commit in einer versionierten Datei kann seinen eigenen endgültigen Hash nicht vorab enthalten. Maßgeblich sind die tatsächliche Branch-Referenz und das abschließende Übergabeergebnis; alle historischen Quellen, main-/Remote-/PR-Basen sind hier vollständig gepinnt.
