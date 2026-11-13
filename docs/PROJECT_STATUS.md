> HISTORISCHE REFERENZ vom 08.11.2026. Lokale Quelle entspricht PR #1 / 5eba4e6. Kein aktueller Betriebsstatus; maßgeblich ist HANDOVER_CURRENT_STATE.md. Ein historischer Initialwert wurde nicht übernommen.

# Projektstatus LIE Scorecards Firebase

Stand: 08.11.2026 (Europe/Berlin). Analyse des lokalen Repositorys, ohne Deploy und ohne Zugriff auf produktive Daten.

## Prüfgrundlage und Abgrenzung

**Bestätigt** bedeutet hier: im Quelltext/Git-Verlauf nachgelesen oder im unten bezeichneten lokalen Testlauf beobachtet. Es bedeutet keine Bestätigung des ausgerollten Systems.

- Analysierter Ausgangsbranch: `feature/score-autosync`, HEAD `cb4661f`.
- Lokale Referenz `main` und gespeicherte Remote-Referenz `origin/main`: `f4dcbec`. Die Remote-Referenzen wurden bei der Analyse nicht durch Fetch aktualisiert.
- Bereits vor der Analyse verändert: `App_Logic_Bridge.js`, `App_Logic_Scores.js`, `App_Logic_Spieltage.js`, `Views_ScoreSchnellerfassung.js`, `config.js`, `sw.js`; außerdem unversioniert: `design-reference/`, `fiveserver.config.js`. Diese Änderungen gehören nicht zum Dokumentations-PR.
- Der Dokumentationsbranch basiert auf `main`, damit die beiden V2-Commits nicht mit diesem PR eingeführt werden. Die nachfolgend beschriebenen V2-Dateien sind im analysierten Ausgangsbranch vorhanden, nicht in dieser PR-Basis.
- In diesem Auftrag werden ausschließlich Dokumentation und Git-/PR-Metadaten geändert. Keine Anwendungslogik, kein Deploy, keine historische Neuberechnung.

## Architektur — durch Quelltext bestätigt

Die Anwendung ist eine statische JavaScript-SPA mit globalem `window.app` und gemeinsamem `app.state`. `index.html` lädt zuerst `config.js`, dann die Module in definierter Reihenfolge und zuletzt den Startablauf. Ein Frontend-Paketmanifest oder verpflichtender Build-Schritt ist im Repository nicht vorhanden.

| Schicht | Dateien und Aufgabe |
| --- | --- |
| Oberfläche | `index.html`, `Style.css`, `Views_*.js`: Login, Dashboard, Scoreeingabe, Schnellerfassung, Ranglisten, Performance, Spieltage, Spieler, Admin, Kalender, Wetter, Golfplätze |
| Zustand und Navigation | `App_Core.js` initialisiert Firebase und Zustand; `App_Start.js` steuert Start/Session; `App_Router.js` wechselt Views und Polling |
| Fachlogik | `App_Logic_Scores.js`, `App_Logic_Spieltage.js`, `App_Logic_History.js`, `App_Logic_Performance.js`, `App_Logic_Spieler.js`, `App_Logic_UI.js` |
| Datenzugriff V1 | `App_Logic_Bridge.js`: Firestore-Lesen, direkte Schreiboperationen, Callable-Aufrufe und Live-Polling |
| Lokaler V2-Pfad | `App_Storage_ScoreSync.js`, `App_Logic_ScoreSyncV2.js`, `App_Storage_ScoreEntryContext.js`, `App_Logic_ScoreEntryV2.js` (Ausgangsbranch) |
| Server | `functions/index.js`: Firebase Callable Functions, Admin SDK; `score-operations-v2.js` und `score-read-v2.js` als injizierbare V2-Kernlogik |
| Zugriffsschutz | `firestore.rules`: Rollen über Token-Claims; private/öffentliche Spieler getrennt; abgeschlossene Scores nur für Admin schreibbar |
| PWA | `manifest.json`, `sw.js`: App-Metadaten und Cache; externe SDK-/CSS-Abhängigkeiten bleiben relevant |

`index.html` bindet Firebase Web SDK 10.8.0 im Compat-Modus, Tailwind Browser v4 und Font Awesome per CDN ein. Functions verwenden Node 22, `firebase-admin` ^13 und `firebase-functions` ^7; Region `europe-west1`, maximal zehn Instanzen laut `functions/index.js`.

Authentifizierung: Spielerliste über `getLoginPlayers`, PIN-Prüfung serverseitig über `verifyPlayerPin`, danach Firebase Custom Token. Weitere Callables: `updatePlayerPin`, `requestTempPin`; der temporäre PIN-Versand verwendet einen Google-Apps-Script-Endpunkt. Der aktuelle Servercode ist maßgeblich; die ältere Deployment-README beschreibt noch den früheren Initial-PIN `[historischer Initialwert redigiert]`, während Commit `33f8b29` den Club-Initial-PIN einführt.

Firestore-Daten: `spieler` (geschützt), `spieler_public`, `spieltage`, `scorecards`, Legacy-`scores`, `flights`, `kurse`, `golfplaetze`, `bahnen`, `handicaps`, `kalender_termine`, `config`, `settings`. V2 verwendet zusätzlich private `scoreSyncV2Requests`, `scoreSyncV2Mutations`, `scoreSyncV2Generations`; das Admin SDK prüft Berechtigungen selbst und umgeht die Client-Rules.

`firebase.json` konfiguriert Functions und Firestore Rules, kein Firebase Hosting. `CNAME` enthält `app.lochihnein.de`; die Deployment-Dokumentation nennt GitHub Pages. **Bestätigt ist nur diese Repository-Konfiguration.** `.firebaserc` und `config.js` zeigen auf `liescorecard-70c5e`; eine separate PreProd-Firebase-Instanz ist trotz Verzeichnisname nicht belegt.

## Dateistruktur

```text
/
  index.html, Style.css, config.js       Einstieg, Darstellung, Konfiguration
  App_Core.js, App_Start.js, App_Router.js
  App_Logic_*.js, App_Storage_*.js       Fachlogik und Persistenz (V2 nur Ausgangsbranch)
  Views_*.js, App_View_Help.js           Ansichten und Hilfe
  sw.js, manifest.json, img/, favicon.ico
  functions/                           Functions und package[-lock].json
    index.js, score-operations-v2.js, score-read-v2.js
    test/                              Servertests, Memory-Datenbank, Emulator-Konfiguration
  tests/                               Browserrunner, HTML-Testseiten, lokale Tests/READMEs
  firestore.rules, firebase.json, .firebaserc
  HCP-RECALCULATION-NOTES.md, README-DEPLOYMENT.md, RELEASE.txt
  docs/PROJECT_STATUS.md                Diese Bestandsaufnahme
  appsscript.json, Utils.js, *All.vbs    Weitere/ältere Hilfsartefakte
  impressum.html, datenschutz.html, CNAME
```

Die Hilfsartefakte wurden nicht als aktiv benötigter Produktionspfad validiert. Unversionierte lokale Dateien sind kein bestätigter Bestandteil des Releases.

## Entwicklungsstand — bestätigt

### Versionierter Stand

`main` enthält historische HCP-Korrekturen, Performance-Dashboard und Flight-Ansicht im Live-Leaderboard. Der Ausgangsbranch ergänzt mit `cd13440` die V2-Sync-Grundlage und mit `cb4661f` die lokale V2-Scoreeingabe.

V2 speichert Cache, Pending-Operationen, unveränderliche Requests, Receipts und Issues getrennt in IndexedDB `lie_score_sync_v2`, Version 3. Änderungen tragen Feldrevision und Dokumentgeneration; Wiederholungen sind durch persistente IDs und Serverbelege idempotent. Konfliktauflösung verlangt eine explizite, noch aktuelle Erwartung. Unbekannte Bearbeitungsbasen werden nicht automatisch ergänzt.

Die V2-Eingabe liest ausschließlich den eigenen Flight über `readOwnFlightScoresV2`, speichert validierten Offline-Kontext separat in `lie_score_entry_context_v2` und zeigt erst lokal bestätigte Änderungen. `Views_ScoreEingabe.js` ist im Ausgangsbranch an diesen lokalen Pfad angebunden. **Netzwerk-Schreibtransport und automatischer V2-Sender sind dort nicht mit der View verbunden.** Der vorhandene Adapter und exportierte Schreib-Callable sind daher keine abgeschlossene produktive Synchronisation.

### Vorhandene uncommittete Vorschau

Die lokalen Änderungen ergänzen am V1-Pfad unter anderem `pendingScoreKeys`, lokale Sicherung und Sync-Status; die Schnellerfassung markiert Änderungen als pending, und Polling berücksichtigt pending statt aller angezeigten Werte. `config.js` nennt lokal `5.4.0-auto-sync-preview`, die HEAD-Version dagegen `5.3.3-flight-preview`; `RELEASE.txt` nennt weiterhin `5.2.9` vom 11.10.2026, während der jüngste Commit von „LIE 6.0“ spricht. Diese Bezeichnungen bilden keinen einheitlich bestätigten Release-Stand.

Die V1-Vorschau wurde im Auftrag gelesen, aber nicht als vollständig sicherer oder produktionsreifer Autosync bestätigt. Der separate lokale Hotfix-Branch `hotfix/v1-score-safety` zeigt auf `55c0db4` und einen anderen Worktree; seine Integration in den Ausgangsbranch ist nicht belegt.

## HCP-Fortschreibung — im Code bestätigt

Quellen: `App_Logic_History.js`, `App_Logic_Scores.js`, `App_Logic_Spieltage.js`, `Views_AdminKorrektur.js` und die Bridge.

1. Historische Anzeige bevorzugt `scorecard.hcpStart`, danach `spieltag.hcpStart[playerId]`, erst danach das aktuelle `spieler.hcpLIE`. Fehlende Snapshots können deshalb weiterhin heutige HCPs anzeigen.
2. Die Lochvorgabe verwendet die zum Kurs passende Handicap-Tabelle, ersatzweise das gerundete HCP. Bei neun Löchern wird die Spielvorgabe halbiert und gerundet; Front-/Back-Nine filtern die gespielten Bahnen. Verteilung erfolgt nach SI-Rang der ausgewählten Bahnen, mit Grund- und Restschlägen.
3. `recalculateSeasonFromStart()` ist auf Admin beschränkt, verlangt Saisonstart und berücksichtigt ausschließlich nicht gelöschte Runden mit Status `Beendet` ab Saisonstart. Sortierung: Datum, bei Gleichstand ID.
4. Die Kette beginnt für alle geladenen Spieler mit HCP 26. Ein explizites `hcpStartOverrides[playerId]` überschreibt die Kette für die betreffende Teilnahme; andernfalls gilt das vorherige Ende, ersatzweise 26.
5. Nur vollständige Spielergebnisse ändern das HCP. Soll: 18 Netto-Stablefordpunkte bei neun, 36 bei 18 Löchern. Oberhalb Soll: `max(0, round(start - (netto - soll) * 0.5))`; unterhalb: `min(54, round(start + (soll - netto) * 0.1))`; am Soll unverändert. Unvollständige Ergebnisse behalten das Start-HCP.
6. Geschrieben werden je Runde `hcpStart`, `hcpEnd`, Sieger und `recalculatedAt`, je ausgewerteter Scorecard `hcpStart`/`strokesGiven`, abschließend `hcpLIE` in `spieler` und `spieler_public`. Auch Spieler ohne Saisonteilnahme erhalten aus dieser Implementierung den Initialwert 26.

Die normale Rundenschließung ermittelt separat Sieger/HCP-Updates und schreibt über `closeSpieltagServer` in der Bridge. Eine vollständige Gleichheit dieses Pfades mit der historischen Saisonberechnung wurde nicht getestet. Beim generischen Rundentyp `9` filtert die Legacy-Lochvorgabe anders als bei `9-Front`/`9-Back` nicht ausdrücklich auf neun Kursbahnen; die V2-Servervalidierung behandelt `9` als Loch 1–9. Die fachliche Konsistenz bei Kursen mit 18 Bahnen ist offen.

## Historische Korrekturen

**Im Code bestätigt:** Der Admin-Dialog erlaubt Datum, Kurs, Rundentyp, Start-HCP-Overrides, Schläge, Putts und Lady zu ändern. Leeres Override-Feld entfernt den Override und ermöglicht automatische Fortschreibung. „Speichern“ ändert die Runde ohne Saison-Neuberechnung; „Speichern & Saison neu berechnen“ verlangt Bestätigung, speichert, lädt Daten neu und berechnet anschließend die Saison. Die Vorschau stellt Start-HCP, Netto, Ende und Vollständigkeit dar. Gelöschte und nicht beendete Runden sind von der Kette ausgeschlossen.

**Nur historisch dokumentiert, hier nicht erneut geprüft:** `HCP-RECALCULATION-NOTES.md` berichtet nach einer Produktionskorrektur der Runde vom 03.10.2026 für Spieler 105/107/112 Start-HCP 26/26/26 und Ende 26/25/26. Es erfolgte in diesem Auftrag kein Datenbankabgleich. Diese Werte sind keine neue Produktionsbestätigung.

## Offene Probleme und Freigabeschranken

| Befund | Evidenz / noch erforderliche Prüfung |
| --- | --- |
| V1 umgeht V2-Konfliktgarantien | Rules erlauben angemeldeten Spielern breite direkte Änderungen an nicht beendeten Scores, ohne Flight-/Feldrevisionsprüfung. V1 und weitere Schreiber müssen vor V2-Freigabe kontrolliert versioniert oder ausgeschlossen und Rules angepasst werden. Siehe beide Sync-READMEs. |
| V2-Eingaben senden noch nicht | Lokale V2-View hat keinen Schreibtransport/Scheduler; fachliche Initialisierung von `hcpStart` vor künftigen Writes bleibt offen. |
| Keine atomare Saisonkorrektur | Korrektur wird vor Neuberechnung separat committed; Neuberechnung schreibt in Batches ab 400 Operationen und verändert lokalen State schon währenddessen. Teilfortschritt bei Fehlern ist möglich; Wiederanlauf/Parallelzugriff nicht nachgewiesen. |
| Historische Datenqualität | Fehlende HCP-Snapshots, Overrides, Vollständigkeit und generische Neun-Loch-Runden benötigen fachliche Prüfung; ein Regressionstest der gesamten HCP-Kette wurde nicht gefunden. |
| Firebase-Integration ungeprüft | Lokale Memory-DB-Tests belegen keine Firestore-Locks, echten Transaktions-Retries, Callable/Auth-Integration oder ausgerollten Rules. |
| Geräte-/Offline-Freigabe offen | Echte Firebase-Session ohne Netz, Service-Worker-Auslieferung, SDK-Verfügbarkeit und mobile Geräte wurden nicht live getestet. Offline-Kontext-Refresh ist kein atomarer Snapshot des ganzen Flights. |
| Dokumentation/Versionen uneinheitlich | Deployment-README und isolierte Sync-README beschreiben ältere Phasen; für aktuelle View-Anbindung ist die Entry-README zusammen mit dem Code maßgeblich. Releasebezeichnungen unterscheiden sich. |
| Umgebungsgrenze unbewiesen | Lokale Konfiguration verweist auf dasselbe benannte Firebase-Projekt; isolierte PreProd-Ressourcen, aktuelle Hosting-/Functions-Versionen und Remote-Branchstände ungeprüft. |

## Letzte Commits des analysierten Ausgangsbranches

Datum gemäß Git, ohne Aussage über Deployment oder Merge auf dem aktuellen Server.

| Commit | Datum | Inhalt |
| --- | --- | --- |
| `cb4661f` | 28.10.2026 | Add LIE 6.0 local V2 score entry |
| `cd13440` | 25.10.2026 | Add tested score sync v2 foundation |
| `f4dcbec` | 18.10.2026 | Add flight view to live leaderboard (lokale main-Basis) |
| `c9cce61` | 11.10.2026 | Add personal performance dashboard |
| `696a8c2` | 11.10.2026 | Refresh service worker cache |
| `45309a1` | 11.10.2026 | Fix automatic historical handicap propagation |
| `1f67ef5` | 11.10.2026 | Add historical handicap recalculation and admin corrections |
| `e229587` | 10.10.2026 | WIP: Correct 9-hole handicap stroke allocation |
| `12b804d` | 09.10.2026 | Polish header icons and role indicators for 5.2.4 |
| `9218fdf` | 09.10.2026 | Fix 9-hole handicap calculations and improve round closing |
| `629b6f0` | 08.10.2026 | Rollback temporary PIN when email delivery fails |
| `33f8b29` | 08.10.2026 | Use club initial PIN for players without a PIN |

## Testergebnisse — in diesem Auftrag bestätigt

Ausgeführt am 08.11.2026 mit Node `v22.21.0` im Ausgangsbranch `cb4661f` einschließlich der oben genannten vorhandenen lokalen Änderungen, vor Erstellung des Dokumentationsbranches. Keine Pakete installiert, keine produktiven Requests oder Deploys ausgelöst. Die Ergebnisse gelten nicht als erneuter Test von `main` und bestätigen nicht umfassend die uncommittete V1-Vorschau.

| Ausführung | Beobachtetes Ergebnis |
| --- | --- |
| `$env:SCORE_SYNC_EMULATOR_TEST='0'; node --test functions/test/score-read-v2.test.js functions/test/score-operations-v2.test.js tests/score-screen.test.cjs` | Exit 0; 65 Tests bestanden, 0 fehlgeschlagen, 0 übersprungen |
| `node tests/run-score-sync-browser.cjs` | Exit 0; Adapter/Integration 38 bestanden, 0 Fehler; Phase B 32 bestanden, 0 Fehler; Storage-Seite meldet alle Tests bestanden |
| `node tests/run-score-screen-browser.cjs` | Exit 0; je 75 Checks bei 320/390/1024 Pixeln; jeweils beobachtete Schreibaufrufe V1=0 und V2=0; Reload/Offline-Kontext eingeschlossen |

Browserläufe nutzen echte IndexedDB, lokale Testserver und injizierte Identitäten/Antworten; serverseitige Kernlogik wird mit Memory-Datenbank getestet. Geprüft werden unter anderem Revisionen, Generationen, Idempotenz, Konflikte, Queue-Erhaltung, Sessionwechsel und lokale UI-Persistenz. Das sind keine Firestore-Emulatortests. Ein Screenshot des 390-Pixel-Laufs wurde vom Runner temporär erzeugt; eine zusätzliche visuelle Prüfung ist hier nicht behauptet.

## Ungeprüfte Annahmen und noch fehlende Nachweise

- Dass der Ordner „PreProd“ eine technisch getrennte Umgebung bezeichnet, ist unbewiesen.
- Dass lokale `origin/*`-Referenzen den aktuellen GitHub-Stand wiedergeben, ist ohne Fetch unbewiesen.
- Dass V2-Functions oder aktuelle Rules bereits ausgerollt sind, lässt sich aus Exporten/README-Aussagen nicht ableiten.
- Dass die in den HCP-Notizen genannten Produktionswerte heute unverändert sind, wurde nicht geprüft.
- Dass die vorhandene V1-Autosync-Vorschau alle Eingabe-/Speicher-Rennen sicher behandelt, ist durch die hier ausgeführten V2-Suites nicht nachgewiesen.
- Fachliche Richtigkeit der HCP-Regel gegenüber externen Verbandsregeln wurde nicht bewertet; dokumentiert ist die lokale LIE-Implementierung.

Für spätere Aktualisierungen: Commit und Dirty-State erfassen, lokale Suites erneut ausführen und echte Integrations-/Datenprüfungen ausdrücklich als eigene Evidenz ergänzen. Frühere README-Aussagen nicht ohne neue Prüfung als aktuelle Live-Ergebnisse übernehmen.
