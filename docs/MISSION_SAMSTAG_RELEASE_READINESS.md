# Mission Samstag — Release-Readiness für zwölf Golfer

Stand 08.11.2026, Europe/Berlin. [Issue #10](https://github.com/TST64/LIE-Scorecards_Firebase/issues/10), Phase S0: Audit und Reparaturplan, **keine Implementierung oder Produktionsfreigabe**. Der vollständige Auftrag wurde gelesen; keine Issue-Kommentare vorhanden.

## Entscheidung in Kürze

**NO-GO für einen neuen Samstagsrelease aus dem untersuchten Stack.** Der versionierte Stand enthält solide isoliert getestete V2-Grundlagen und lokale Sicherheitsgrenzen, aber keinen durchgängigen normalen V2-Sendepfad. Zusätzlich sind ein V1-ACK-Datenverlustrisiko, eine defekte PIN-Änderung und unterschiedliche HCP-Ergebnisse reproduziert. Rundenschluss und historische Korrekturen haben weitere belegte Integritätslücken. Das ist kein Befund über tatsächlich verlorene Produktivdaten.

Erstes Reparaturpaket: **V1-ACK-/Pending-Sicherheit samt verlustfreier Feldbehandlung**, nicht weiterer Infrastrukturausbau. Danach PIN-Änderung, genau ein autoritativer Score-Schreibpfad, konsistenter Rundenschluss/HCP und Zwölf-Spieler-Abnahme. Keine Tests entfernen, keine schnelle Veröffentlichung am Samstag. Solange Gates fehlen: bekannten Bestand unverändert lassen und die Runde zusätzlich auf Papier führen; ungeprüfte App-Ergebnisse nicht als verbindliche HCP-Änderung übernehmen.

## Evidenz und untersuchte Stände

**F** = Quelltext/Git nachgelesen; **R** = in diesem Audit isoliert reproduziert; **T** = bestehende Suite hier ausgeführt; **U** = offen/nicht geprüft. Die Maßnahmen- und Zwölf-Spieler-Szenarien sind überwiegend **geplante** Abnahme, keine Behauptung einer bereits erfolgreichen kompletten Runde.

| Stand | Nachgewiesener Umfang / Einschränkung |
| --- | --- |
| Lokale `main` / gespeicherte `origin/main`: `f4dcbec` | Historische HCP-Korrektur, Performance-/Leaderboard-Features. Kein Fetch; tatsächlich deployter Code/Rules/Functions unbekannt. Normale App nicht gestartet. |
| Ursprünglicher Worktree `feature/score-autosync`: `cb4661f` plus Dirty-State | Sechs vorbestehende Änderungen: `App_Logic_Bridge.js`, `App_Logic_Scores.js`, `App_Logic_Spieltage.js`, `Views_ScoreSchnellerfassung.js`, `config.js`, `sw.js`. Nur gelesen; keine Übernahme neuer Arbeit und keine Veränderung dort. |
| Hotfix `hotfix/v1-score-safety`: `55c0db4` | Aus `f4dcbec`; Snapshot-/Flight-/Payloadhärtung, 30 eigene Memory-/VM-Tests erfolgreich. Kein V2-/Autosync-/Umgebungsstack. Kein Nachweis eines Deployments. |
| PR #3: `afadff8`, PR #1: `5eba4e6` | Sicherheitsanalyse und Projektstatus auf separaten Dokumentationszweigen; keine Anwendungsreparatur. Historische Produktivberichte dort wurden nicht erneut geprüft. |
| Draft-PR #5 / Phase 2A: `06dbe61` | Enthält genehmigte Kopien der Feature-/Dirty-Basis, lokale Demo-Guards und Speichertrennung. Keine Cloud-/Produktionsprofile. Der Name „6.0“ im älteren Commit ist kein Releasebeleg. |
| Draft-PR #7 / Phase 2B: `8668c9e` | Auf #5 gestapelt; nur Offline-Cloudplanung/-Gates, Allowlist leer, Ausführung gesperrt. |
| Draft-PR #9 / Phase 2C: `c2be311` | Auf #7 gestapelt; Firebase Hosting/Standardhost festgelegt, nur Plan und Hosting-Offlinetests. Kein aktives Hosting-/Cloudartefakt. |
| Neuer Auditbranch `codex/mission-samstag-audit` | Isolierter Worktree `.codex-mission-worktree` exakt auf `c2be311e2890423133df5c9a8cbe26264950f4db`; Diff ausschließlich diese beiden Missionsdokumente. |

Der Stack ist **Auditbasis, kein bereits freigegebener Releasekandidat**. Aktive lokale App/Functions sind bewusst Emulator-only; die geerbten Cloudpläne schalten kein produktionsfähiges Profil frei. Bestehende Worktrees/PRs bleiben unverändert.

Abschlusskontrolle: ursprünglicher binärer Git-Diff und vorherige Liste unversionierter Dateien gegen den zu Beginn im Arbeitsspeicher erfassten Snapshot unverändert (nur erwarteter neuer Worktree-Eintrag separat ausgenommen). Ursprünglicher Branch/HEAD weiterhin `feature/score-autosync`/`cb4661f`; bestehende Phase-2A-/2B-/2C-Worktrees sauber. Der abschließend lesend geprüfte Hotfix-Worktree steht bei `55c0db4` und enthält zusätzlich eine unversionierte `fiveserver.config.js`; sie wurde nicht angefasst. Der erste Statusaufruf dort war in der Sandbox verweigert und wurde danach mit erlaubtem lesendem Git-Aufruf wiederholt. Keine Behauptung eines Inhalts-Hashvergleichs sämtlicher unversionierter Dateien oder eines Vorher-/Nachher-Statusvergleichs des gesamten Hotfix-Worktrees.

### Hotfix-Integration

Die schreibfreie Drei-Baum-Vorschau `git merge-tree f4dcbec c2be311 55c0db4` zeigt „changed in both“ für Bridge, Scores und Scoreeingabe, einschließlich Konfliktmarkern in `App_Logic_Scores.js` und `Views_ScoreEingabe.js`. **Kein Merge ausgeführt.** Hotfix-Snapshotideen und Tests gezielt portieren, nicht die alte V1-View über die V2-View legen oder die lokalen Guards ersetzen. Die grünen Hotfixtests gelten für seinen eigenen Stand, nicht für eine erfolgreiche Integration.

## Schreibpfade und Vertrauenszustände

| Pfad | Persistenz / Bestätigung | Integritätsgrenze |
| --- | --- | --- |
| V1-Schnellerfassung | `updateRapidScoreState`, `markScorePending`, LocalStorage, 1,5-s-Timer / 30-s-Retry / `online`; `syncScoresWithServer` -> Bridge `saveLiveScores` -> Firestore-Batch-Merge | Vollständige Scorepayloads mit Defaultfeldern, keine Feldrevisionen. ACK löscht erfasste Pending-Schlüssel ohne Prüfung ihrer inzwischen neuen Version. Leeren eines Schnellfelds löscht nur RAM, ohne explizite Serverlöschung. |
| V2 normale Scoreeingabe | `Views_ScoreEingabe.js` -> Controller `action()` -> transaktionaler IndexedDB-Append; eigene Flight-Reads über Callable | Bestätigte lokale Eingabe, **kein eingebundener Sender/Scheduler**. „Eingegeben“ und Häkchen bedeuten nicht serverbestätigt. |
| V2 expliziter Adapter | `createFirebaseScoreSyncV2Adapter`, persistente Requests, Revisionen/Generationen, serverseitige Idempotenzbelege | Für ausschließlich versionierte Schreiber gut getestet. Kein produktiver View-Aufruf dieses Adapters gefunden; fehlende HCP-Metadateninitialisierung bleibt offen. |
| Admin-Korrektur / HCP / Abschluss | Direkte Firestore-Schreibvorgänge in `Views_AdminKorrektur.js`, `App_Logic_History.js`, Bridge `closeSpieltagServer` | Umgehen V2-Feldrevisionen; mehrere Commits, keine gemeinsame fachliche Transaktion. |
| Sonstige Bridge-/Adminaktionen | Runden/Flights anlegen, Saison-/Spieler-/Stammdaten ändern, generische Admin-Schreib-/Löschpfade | Müssen bei Score-Lifecycle-/HCP-Änderungen einbezogen oder während kritischer Abläufe gesperrt werden. |
| Rules | `scorecards` und Legacy-`scores`: angemeldete Nutzer dürfen nicht beendete Runden breit verändern; Admin auch beendete | Keine Flight-/Feldrevisionserzwingung; Admin SDK benötigt eigene Autorisierung. „Nur zwölf Bekannte“ beseitigt versehentliche konkurrierende Geräte nicht. |

V2 schützt lokale Reihenfolge, Generationen, Retries, exakte ACKs und explizite Konfliktauflösung. Diese Garantien gelten **nicht automatisch** für V1, direkte Adminwrites oder das gesamte Zusammenspiel mit Rundenschluss und HCP.

## P0 — Samstag und Vertrauen blockiert

### S01 — V1-ACK verliert neuere oder gar nicht gesendete Pending-Eingaben [F, R]

**Reproduktion:** 5 senden, ACK anhalten, währenddessen 6 eintippen, ACK der 5 liefern. Ergebnis mit echtem `App_Logic_Scores.js` und Fake-Transport: `sent=5`, `live=6`, `pending=[]`, `scoreCards=5`. Zweites Beispiel: Loch 1 gültig, Loch 2 nur Putts=3; Payload enthält nur Loch 1, ACK entfernt trotzdem beide Pending-Schlüssel. Außerdem sendet Loch 1 ohne Putteingabe automatisch `puts=2`.

**Quelle/Risiko:** `App_Logic_Scores.js:611` (`syncScoresWithServer`, besonders 691–792), Bridge `saveLiveScores`. Stille Nichtübertragung, falsches Grün und Überschreiben unabhängiger Felder. Das zeigt konkrete lokale Lösch-/Payloadfehler, keinen gemessenen Cloudverlust.

**Lösung:** Unveränderliche, feldbezogene Sendesnapshots mit Änderungs-ID/Sequenz; nur tatsächlich gesendete und bestätigte Versionen quittieren. Neue Änderung, 5→6→5-ABA, ungesendete/invalide Felder und Fehler behalten. Keine Anzeige-/Defaultwerte senden; explizites Löschen modellieren. Hotfixmechanismen selektiv portieren und um Pending-/Autosyncfälle erweitern.

**Test/Abnahme:** Matrix SY01–SY08; neue Eingabe nach altem ACK weiter pending, anschließend serverbestätigt 6; ungesendete Putts bleiben erhalten; unveränderte Serverfelder bleiben byte-/wertgleich. Bestehende Hotfix-, V2- und Sicherheitsprüfungen erhalten. **Indikativ 1–2 Entwicklungstage** inklusive Tests, kein Release allein nach dieser Reparatur.

### S02 — Kein durchgängiger, offline belastbarer normaler Scorepfad [F, T, U]

**Szenario:** In der normalen V2-View Scores erfassen, anderes Gerät/Leaderboard lesen: nur IndexedDB wurde geändert; der normale Viewpfad ruft keinen V2-Sender auf. Der Adapter wird nur explizit in Tests verwendet. Der tatsächliche Phase-2A-Start verlangt vor Auth lokale Readiness und hat Worker aus; ein kompletter kalter Offline-Appstart ist damit nicht bewiesen bzw. gezielt gesperrt.

**Quelle/Risiko:** `App_Logic_ScoreEntryV2.js:237–336`, `Views_ScoreEingabe.js:107`, `App_Logic_ScoreSyncV2.js:159`, `App_Start.js:58–78`; Controller-Offlinefähigkeit ist nicht komplette PWA-Verfügbarkeit. Daten nur auf einem Gerät, divergierendes Leaderboard, nach Reload scheinbar fehlende Runden. V2-Neuanlagen initialisieren laut `functions/score-operations-v2.js` keine berechneten HCP-Felder.

**Lösung:** Genau einen produktiven Scoringpfad auswählen; bevorzugt vorhandenes versioniertes V2 nutzen, mit expliziter dauerhafter Sende-/Retryintegration, autoritativem Runden-Start-HCP und getrennten lokalen/Serverzuständen. Unsichere alternative Schnellschreiber bis zur Parität nicht anbieten. Warm-/Kaltstart bei Netzverlust getrennt designen; lokale Guards nicht für Bequemlichkeit abschalten.

**Test/Abnahme:** E2E01–E2E06, OF01–OF05, SY09; zwölf Nutzer sehen nach ACK identische Serverwerte, Pending überlebt Offline/Reload, kein falsches Serverhäkchen. Gewählter Samstagspfad muss auf den vereinbarten Geräten bei Netzausfall benutzbar sein oder eine vorab ehrliche sichere Ersatzführung haben. **2–4 Tage plus Geräteabnahme**, ohne neuen Infrastrukturumfang.

### S03 — Mehrgeräte/V1/V2/Admin können Korrekturen still überschreiben [F; Gesamtsystemnachweis U]

**Szenario:** Gerät A lädt Score 5, Admin/anderes Gerät korrigiert 7, A sendet alte volle Karte wegen Puttsänderung. V1 prüft keine Serverrevision. Direkte Adminkorrektur verändert keine `_sync.fields`-Revision; ein wartender V2-Request kann deshalb eine solche Korrektur auf gleicher Revision ersetzen. Adminrechte erlauben auch nach Abschluss weitere Writes.

**Quelle/Risiko:** `App_Logic_Bridge.js:368`, `firestore.rules:91–125`, `Views_AdminKorrektur.js:183–205`, `functions/score-operations-v2.js:303–359`. Versionsschutz ist nur so stark wie der schwächste Schreiber; fachliche Korrektur wird rückgängig gemacht.

**Lösung:** Alle Scoremutationen einschließlich Admin-/Lifecyclekorrektur über denselben revisions-/generationsgebundenen Vertrag führen oder unversionierte Schreiber server-/rulesseitig ausschließen. Keine automatische Konflikt-Rebase; Nutzerentscheidung über angezeigte alte/neue Werte. Vor Abschluss mutierende Rundenbasis sperren/prüfen. Ein organisatorischer Hinweis „nur einer tippt“ ist Zusatzschutz, kein Ersatz für eine technische Negativprüfung.

**Test/Abnahme:** SY10–SY14, CL03, HC08; gleiche Feldrevision produziert genau einen Erfolg und einen sichtbaren Konflikt, andere Felder unabhängig; korrigierte 7 bleibt vor altem Request geschützt; gelöschte/neue Generation wird nicht wiederbelebt. **2–4 Tage**, abhängig von S02; keine vorschnelle Rulesverschärfung ohne Funktionsabnahme.

### S04 — PIN-Änderung ist nicht ausführbar [F, R]

**Reproduktion:** Autorisierter synthetischer Spieler, gültiges `newPin`, `updatePlayerPin` aufrufen: extrahierter unveränderter Callable-Body wirft `ReferenceError: tempPin is not defined`, noch vor `ref.set`. Der Parameter heißt `newPin`; gespeichert wird `hashPin(tempPin)`. Derselbe Ausdruck ist in lokaler `main` enthalten. Zusätzlich steht im Payload `mustChangePin:true`, während Claims danach false gesetzt werden sollen.

**Quelle/Risiko:** `functions/index.js:286–334`, `App_Logic_Spieler.js:103` (`changePin`). Nutzer mit Pflichtwechsel kommen nicht verlässlich in die Runde; Auth-/DB-Status kann inkonsistent werden. Kein echter PIN/Cloudaufruf getestet.

**Lösung:** Validierten neuen PIN korrekt hashen; DB-/Claim-Pflichtwechselstatus konsistent abschließen, Teilfehler und Clientfehler sichtbar behandeln. Own-/Admin-Autorisierung erhalten; Stub darf keinen scheinbar zugestellten PIN versprechen.

**Test/Abnahme:** AU01–AU04; echter synthetischer Emulator-Login nach PINwechsel funktioniert, alter PIN scheitert, Reload verlangt keinen erneuten Wechsel, fremder Spieler abgewiesen, Fehler produziert keinen Erfolg. **0,5–1 Tag**. Trotz Schwere bleibt S01 der erste datenbezogene Auftrag; S04 ist ein kleines nächstes Paket.

### S05 — Rundenschluss ist weder Pending-Barriere noch atomar/idempotent [F]

**Szenario:** Letzte Eingabe noch pending/ACK verzögert; `finishRoundWithWinners` lädt Firestorekarten und schließt ohne Queue-Barriere. Der `.get()`-Aufruf fordert weder explizit `source:'server'` noch prüft er Cachemetadaten; ein nachweislich serverbestätigter Abschlusssnapshot ist so nicht belegt. Oder zwischen Statusupdate und Spieler-HCP-Batch Fehler auslösen: Runde bereits `Beendet`, HCP noch alt. Zweiter Abschluss kann auf veränderten aktuellen HCPs erneut rechnen. Ein Spieler mit nur einem Loch kann nach Bruttoschlägen vor vollständigen Spielern gewinnen.

**Quelle/Risiko:** `App_Logic_Spieltage.js:482` und `:672–847`, `App_Logic_Bridge.js:404` (`closeSpieltagServer`: Statusupdate vor HCP-Batch). Fehlende Scores werden ausgesperrt oder nicht ausgewertet, Sieger/HCP passen nicht zur bestätigten Runde.

**Lösung:** Gemeinsamer serverseitiger Abschluss auf eindeutigem bestätigtem Rundensnapshot, Status-/Revisionserwartung und Idempotenz-ID. Pending/Konflikte aller Flights zuerst klären; Vollständigkeit/ggf. ausdrücklich gewähltes DNF fachlich prüfen; Gewinner nur nach freigegebener Regel. Scores/HCP-Maps/private+öffentliche HCPs logisch gemeinsam veröffentlichen, Wiederholung ohne zweite Fortschreibung.

**Test/Abnahme:** CL01–CL05; bei Pending/Fehler kein „erfolgreich beendet“, unverändertes oder eindeutig wiederaufnehmbares Ergebnis; Doppelabschluss identisch; kein Sieger aus unvollständiger Karte. **1,5–3 Tage** nach S02/S03/S06.

### S06 — HCP-Auswertung widerspricht sich [F, R]

**Reproduktionen:** HCP 0, vollständige Front-Nine, Netto 20: `closeActiveSpieltag` liefert Update 53, historische Rechnung Ende 0. Ursache `parseInt(hcpLIE) || 54`. Bei HCP 26 und 18 Kursbahnen erhält generisch `9` auf Loch 1–9 nur 9 Vorgabeschläge, `9-Front` korrekt 13. Sieger/Rundenschluss rechnen mit aktuellem Spieler-HCP, historische Anzeige bevorzugt Snapshots. Fehlende Snapshots fallen auf heutiges HCP zurück.

**Quelle/Risiko:** `App_Logic_Scores.js:322` (`calculateHoleVorgabe`), `App_Logic_Spieltage.js:553–585`, `App_Logic_History.js:18–112`, `Views_Leaderboard.js:260`. Falsche Netto-/HCP-/Siegerwerte und rückwirkend wechselnde Anzeigen.

**Bestätigte Gruppenregel:** Nutzerantwort „ja“ auf Saisonstart 26; Soll 18/36 für 9/18 Loch; Verbesserung 0,5 / Verschlechterung 0,1 pro Punkt; Rundung und Begrenzung 0–54. Details zu Strich-Bruttowertung, Putts bei Strich und unvollständigen Runden wurden nicht separat spezifiziert und bleiben Abnahmefragen; derzeitige sichere Planannahme: Strich=0 Netto, unvollständig kein automatisches HCP-Update/kein stiller Abschluss.

**Lösung:** Ein gemeinsamer reiner Rechner aus unveränderlichem Rundenstart, exakten gespielten Löchern und bestätigten Rohscores. 0 gültig; `9` explizit normalisieren oder bis zur Reparatur nicht anbieten; NaN, Duplikate und widersprüchliche Loch-/Flightdaten ablehnen. Historische Werte nicht mit heutigen Defaults erfinden.

**Test/Abnahme:** HC01–HC07, Golden-Tabelle in der Matrix; Abschluss, Leaderboard und historische Neuberechnung müssen unabhängig berechnete Sollwerte exakt teilen. **1–2 Tage** plus Fachabnahme.

### S07 — Historische Korrektur kann eine halbe Saison veröffentlichen [F, R im Fake-Batchmodell]

**Szenario:** Korrektur committen, danach Neuberechnung scheitert. Oder zwölf Spieler × (9+9+18 Loch)=432 Scorecards; mit drei Rundenmaps und 24 Spielerwrites etwa 459 Writes. Zweiten Batch scheitern lassen: erster Batch bereits dauerhaft, State wurde zuvor teilweise verändert.

**Quelle/Risiko:** `Views_AdminKorrektur.js:115–229`, `App_Logic_History.js:115–235` (400er-Batches, getrennte Commits). Score-/Start-/End-HCP-/Spielerstände auseinander, spätere Neuversuche auf unklarer Basis, keine atomare ganze Saison. Nachträgliche Löschung/Statuswechsel verändern die Kette.

Im Audit mit der echten Funktion und zwölf synthetischen IDs reproduziert: 432 Karten, Commits `[400,59]`, zweiter Commit absichtlich abgewiesen; 400 Dokumente im Fake-Store bestätigt, In-Memory-Spieler-HCP bereits28. Das belegt den Teilfortschritt der Funktion unter injiziertem Fehler, keinen realen Firestore-/Produktionsvorfall.

**Lösung:** Rechenplan/Vorschau auf versionierter Eingabebasis, kontrollierter Korrektur-/Runstatus, idempotenter Wiederanlauf und logische Veröffentlichung eines vollständig geprüften Ergebnisses; konkurrierende Writes erkennen. Für zwölf Nutzer keine neue Plattform nötig: erst bounded Fall/mehrere abgeschlossene Runden sauber absichern. Bis dahin historische Korrektur und Saisonreset für Samstagsbetrieb nicht freigeben; keine notwendige Korrektur durch unfertigen Sync überschreiben lassen.

**Test/Abnahme:** HC08–HC12; 459-Writes-Test mit Fehler im zweiten Commit, keine falsche Erfolgsmeldung/halb gültige sichtbare Kette; Wiederaufnahme liefert exakt die Referenz. **2–3 Tage**. Deaktivierung des unfertigen Features kann Releaseumfang verkleinern, vorhandene Daten-/Korrekturintegrität bleibt zwingend.

### S08 — „Lokal gespeichert“/„Synchronisiert“ kann falsch sein [F, R teilweise]

**Szenario:** `localStorage.setItem` wirft (Quota/gesperrter Speicher). `persistLocalScoreBuffer` warnt nur; danach kann UI weiter „Offline · lokal“ oder eine spätere generische Erfolgsnachricht zeigen. Bei S01 steht Pending=0 trotz neuerem Wert. In V2 steht ✓ „Eingegeben“ ohne Server-ACK. In der Schnellerfassung ist eine sichtbare DB-Karte nicht zwingend als vollständige Basis in `liveScores`; Putts-only/Leerung sind nicht verlässlich als Feldoperation modelliert.

**Quelle/Risiko:** `App_Logic_Scores.js:52–74`, `:199–242`, `App_Logic_Spieltage.js:1011`, `Views_ScoreSchnellerfassung.js:140–184`, `Views_ScoreEingabe.js:265`. Nutzer verlässt Seite im falschen Vertrauen; ungesicherte Daten verschwinden oder werden nicht gesendet.

**Lösung:** Eingangsbestätigung erst nach dauerhafter lokaler Transaktion; explizite Zustände „nur lokal“, „ausstehend n“, „serverbestätigt“, „Konflikt“, „Speicherfehler“. Fehler nicht wegfangen und Erfolg behaupten. Wiederherstellen/Export sicher und umgebungsgebunden anbieten; keine automatische Alt-Pufferlöschung. V2-Append-Fehlerbehandlung erhalten.

**Test/Abnahme:** UX01–UX04, OF03, SY02; Speicherfehler sichtbar, keine Bestätigungsmarke, nächste Aktion blockiert oder sauber wiederholbar; Pendingzahl passt zu unverarbeiteten Feldoperationen. **0,5–1,5 Tage** in S01/S02 integriert.

### S09 — Releaseidentität, Backup/Wiederherstellung und Rücknahme unbelegt [U, F für Grenzen]

**Szenario:** Unklarer tatsächlich ausgelieferter Code/Rules/Functions-Stand oder nicht getestetes Restore; neuer Release ändert Datenformat und nur Frontend wird zurückgesetzt. Die lokalen Planungszweige sind kein installierbares Produktionsprofil. „Grüne Unit-Tests“ würden einen unbekannten Bestand überlagern.

**Lösung/Abnahme:** Vor jeder später separat genehmigten Veröffentlichung tatsächliches Releaseinventar, Verantwortlichen und rücknehmbares Paket festlegen; Backup und isolierte Wiederherstellung verifizieren. In diesem Auftrag **keine** Cloudreads/Backups. Zuerst synthetische Backup-/Restoresimulation. Ein echter Produktions-Restoretest gehört ausschließlich in einen gesondert genehmigten, zugriffsgeschützten DR-Bereich unter Produktionsschutz, niemals als Produktivdatenimport in Entwickler-/Cloud-PreProd. Ohne belegten sicheren Prozess NO-GO.

**Test:** OP01–OP04; Daten-/Revision-/Generations-/Belegkonsistenz und Rollbackkompatibilität belegen, keine offene Queue durch Restore wiederbeleben. **0,5–1 Tag technische Vorbereitung plus separates Betriebsfreigabefenster**, Infrastruktur-/Zugangsverfügbarkeit nicht geschätzt.

## P1 — vor produktiver Freigabe

| ID | Reproduzierbarer Fall, Quelle und Schaden | Reparatur, Test und Abnahme | Indikativer Aufwand |
| --- | --- | --- | --- |
| S10 Runden-/Flightanlage | Bridge `createNewSpieltag` schreibt Runde vor Flightbatch; Batchfehler hinterlässt aktive Runde ohne Flights. Schnellerfassung kann bei fehlendem Flight auf Teilnehmerliste fallen; `.find` maskiert Mehrdeutigkeit. | Runde/Flights logisch atomar anlegen, eindeutige Mitgliedschaft/Sequenz erzwingen; kein „erster/alle“-Fallback. FL01–FL04: zwölf IDs exakt einmal in drei Viererflights; Fehler veröffentlicht keine bearbeitbare halbe Runde. | 0,5–1 Tag |
| S11 Rückkehr/Reihenfolge/Status | Reload/Benutzerwechsel/Flightumordnung mit alten Puffern oder Kontext; V1-Schlüssel zerlegen IDs per `_`; V2 lehnt mehrdeutigen eigenen Flight ab. | Explizite ID-/Statusvalidierung und Bindung überall, keine Anzeige über Sequenz als Identität. FL03, AU05, SY07, OF02: keine fremde Partition, kein Pendingverlust; verschobene Spieler nur nach autorisierter Kontextaktualisierung. | 0,5–1 Tag, teilweise S01/S02 |
| S12 Ablehnungs-/PIN-/Sitzungsfehler | Pflichtwechsel, fünf Fehlversuche, ausgeloggte Tokens, Admin-/Spielleiteränderungen; `changePin` hat keinen umfassenden Fehlerpfad, Rollen in DB/Token/Rules unterscheiden sich. | Negative Auth-/Claim-/Rollenfälle mit synthetischen Konten, klare Meldung und Wiederaufnahme, keine echte Mail. AU01–AU06: fremde/private/geschlossene Writes abgewiesen, keine Nutzer durch falschen Status festgesetzt. | 0,5–1 Tag, S04 separat P0 |
| S13 Fachliche Kanten | Leere/NaN-/doppelte Scores, Strich vs. fehlendes Loch, generisch `9`, Gleichstände; Historie nimmt ersten passenden Score, Abschluss kann unvollständige Sieger bilden. | Eingabevertrag und Rechner/Ranking referenzieren denselben freigegebenen Loch-/Vollständigkeitsstatus; Tie sichtbar statt erfunden. HC02/HC04/CL04/UX02: keine Default-Par-Scores als bestätigt; gleiche Eingabe liefert überall dasselbe Resultat. | 0,5–1 Tag zusätzlich zu S05/S06 |
| S14 Samstagstauglicher Betrieb | Kalt-Offline/Appcache, unbekanntes Clientartefakt, Wiederanlauf auf tatsächlichen Handys noch nicht freigegeben; lokale Guards sind bewusst streng. | Einen klaren Kandidaten, einen sicheren Origin und zwei/drei reale Gerätetypen mit synthetischer Probe; höchstens minimales eigenes PreProd nach Freigabe, kein weiterer Planungsstack als Ersatz für Reparaturen. OF01–05/OP03: gewählte Journeys nachweislich nutzbar, sichere Papierreserve. | 0,5–1 Tag Abnahme nach funktionalem Kandidaten |

Aufwände sind grobe Umsetzungseinheiten, keine additiv belastbare Termin-/Samstagszusage; Tests/Abhängigkeiten überlappen. Fehlende Cloudfreigaben oder Fachentscheidungen sind nicht als erledigte Entwicklungszeit eingeplant.

## P2 — nach verlässlichem Kern

Wetter/Minispiel, optische Verfeinerung, zusätzliche Statistik/Performancefeatures, umfassende Hosting-/CI-Komfortfunktionen, neue Authprovider, Custom-Domain und allgemeiner Enterprise-/SaaS-Ausbau. Bestehende umfassende Regressionstests bleiben erhalten. Status-/Fehlermeldungen und Datenrettung sind ausdrücklich **nicht P2**.

## Erste Reparaturaufträge und Integrationsfolge

1. **R1 / S01+S08:** ACK-/Pending-/Feldsicherheit im isolierten Kandidaten mit gezielt portierten Hotfixtests reparieren. Zuerst rote neue Race-/Partial-/Default-/Quota-Fälle festschreiben; danach Implementierung. Kein automatisches Weglöschen alter Daten und kein voller Hotfix-Merge. Ergebnis allein noch kein GO.
2. **R2 / S04:** PINwechsel und konsistente Claims/DB-Zustände separat reparieren; echten Demo-Callable-/Auth-Test hinzufügen.
3. **R3 / S02+S03+S10/S11:** genau einen versionierten Scorepfad verbinden, unversionierte konkurrierende Schreiber kontrolliert abstellen; serverseitige HCP-Startbasis, Retry/Konflikt-UX und Runden-/Flightidentitäten absichern. Vorhandene V2-Komponenten weiterverwenden; kein neuer Syncgrundbau.
4. **R4 / S05+S06/S13:** gemeinsamen Referenzrechner und abgesicherten idempotenten Abschluss integrieren, HCP 0 und 9-Loch-Varianten zuerst korrigieren. Leaderboard-/Abschluss-/Historiensollwerte gemeinsam testen.
5. **R5 / S07:** historische Korrektur/Batch-Wiederaufnahme absichern; unfertige historische Mutation notfalls aus Releaseumfang nehmen. Keine Nutzerdaten dadurch ändern, dass ein Feature deaktiviert wird.
6. **R6 / S09+S14:** vollständige lokale Zwölf-Spieler-Generalprobe, falls erforderlich minimal bereitgestelltes separates Firebase-PreProd mit bereits entschiedener Standard-Hosting-Subdomain und ausschließlich synthetischen Konten — erst nach gesonderter Freigabe. Kein Ausbau um weitere Infrastrukturfeatures. Sicherer Release-/Backup-/Rollbacknachweis und Geräteprobe.

Nach Reparaturen zuerst vorhandene Tests plus neue Regressionen, dann neue Matrixsequenz. Für den regulären Samstag gegebenenfalls nur ein klar sichtbarer erprobter Eingabebildschirm, drei benannte Hauptschreiber (einmal pro Flight) und expliziter Serverbestätigungsstatus; weitere Geräte als Leser. Technischer Konfliktschutz muss trotzdem den versehentlichen Zweitschreiber abfangen. Unfertige Schnellerfassung, historische Livekorrektur, neue Features ausblenden statt beide Engines gleichzeitig als gleichwertig darzustellen.

## GO / NO-GO für die geschlossene Zwölf-Personen-Gruppe

| Gate | GO nur wenn | Aktuell |
| --- | --- | --- |
| G1 Persistenz / Sync | Kein verlorener akzeptierter Schlag bei ACK-Race, Reload, Quota, Retry, Offline, Zweitgerät; Korrekturen bleiben geschützt; kein falscher Status | **NO-GO** S01–03/S08 |
| G2 Zugang / zwölf Nutzer | PINwechsel/Login/Claims funktionieren für synthetische zwölf Nutzer; nachvollziehbare Fehler | **NO-GO** S04 |
| G3 Fachlichkeit | Bestätigte HCP-Regel und Goldenwerte; HCP 0/9/18/Strich/Vollständigkeit konsistent | **NO-GO** S05–07, Restfachfragen |
| G4 Betriebsnachweis | Exakter Kandidat/Rules/Functions, getrennte Umgebung, belegte Backup-/Restore-/Rollbackfähigkeit, klare Zuständigkeit | **OFFEN => NO-GO** S09/S14 |
| G5 Generalprobe | Matrix mit zwölf synthetischen Spielern auf ausgewählten Geräten komplett, alle P0/P1 bestanden oder unsichere optionale Funktion wirksam ausgeschlossen | **NICHT AUSGEFÜHRT => NO-GO** |
| G6 Veröffentlichung | Separate ausdrückliche Freigabe; ausreichendes Beobachtungs-/Rücknahmefenster, keine ungeprüfte Umstellung am/unmittelbar vor Samstag | **NICHT ERTEILT** |

Pragmatischer Rollout nach allen Gates: zunächst kleine synthetische Geräteprobe, dann separate genehmigte Pilotphase mit zwei/drei bekannten Nutzern und klarer Unterstützung, anschließend zwölf Nutzer. Bei neuem Datenintegritätsfehler keine weitere Eingabe auf unklarem Stand erzwingen: Zustand sichern, Papierführung, wohldefinierte Rücknahme. Niemals Datenbanken/Puffer unkontrolliert bereinigen oder produktive Daten nach PreProd kopieren.

## In diesem Audit ausgeführte Tests und Grenzen

- `SCORE_SYNC_EMULATOR_TEST=0`: kombinierter Node-Lauf aus vorhandenen PreProd-/Hosting-/Local-Sicherheits-, Server-Memory- und Score-Screen-Suites: **180/180 bestanden**, 0 übersprungen. Nur Memory/VM sowie bekannter lokaler Loopback-Testserver.
- `node tests/run-score-sync-browser.cjs`: **38 Adapter-/Integrationstests**, **32 Phase-B-Tests**, Storage-Prüfungen erfolgreich; echte IndexedDB, injizierte Identitäten/Memory-DB, kein Firebase SDK.
- `node tests/run-score-screen-browser.cjs`: **75 Checks je 320/390/1024**, V1-/V2-Netzschreibaufrufe jeweils 0. Gerade diese 0 sind kein Nachweis automatischer Synchronisation.
- Read-only gestartete Hotfixsuite `node --test <Hotfix-Worktree>/tests/v1-score-safety.test.cjs`: **30/30 bestanden** auf **dessen** Code, nicht in den aktuellen Kandidaten integriert.
- Sechs zusätzliche flüchtige Node-/VM-Beobachtungen mit unverändertem Quelltext und Fake-Transport/-Batch: ACK-Race, ungesendete Pending-Löschung, 9-Loch-Vorgabe 9/13, HCP-0-Abschluss 53/0, PIN-`ReferenceError` und historischer Teilcommit 400+59. Diese reproduzieren Fehler; sie sind keine bestandenen fachlichen Abnahmetests. Sichere Reproduktion und genaue Befehle in der Testmatrix.
- Keine Emulator-Dreidienste-/Cloud-/Produktions-/GAS-/Backup-/Zwölf-Spieler-Liveprobe in S0. Die echte Emulatorintegration aus Phase 2A ist historischer Nachweis und enthält keinen vollständigen Zwölf-Spieler-/HCP-/PINwechselnachweis. Kein tatsächlicher Datenbestand, Verlust oder deployter Stand behauptet. Keine Cloudzugriffe oder Produktionscredentials importiert.

## Nur kritische offene Nutzer-/Betriebsinformationen

1. **HCP-Zahlenregel bestätigt** durch Nutzerantwort „ja“ im Audit. Vor fachlichem GO noch genaue Strich-/Brutto-/Puttsbehandlung und Entscheidung für unvollständige Runden/DNF festhalten; bis dahin keine automatische alternative Regel erfinden.
2. **Welches konkrete Releasepaket wird tatsächlich ausgeliefert, wer verantwortet Backup und geschützte Wiederherstellung, und welches getestete Rücknahmeverfahren existiert?** Zunächst reichen nicht geheime Release-/Verfahrensangaben. Keine Zugangsdaten, PINs oder Produktivdaten in Chat/Repo; Cloud-Bestandsprüfung nur nach eigener Autorisierung.

### Empfohlener erster Codex-Korrekturauftrag

> Repariere ausschließlich im neuen isolierten Kandidaten die V1-Sendesnapshot-/ACK-/Pending-Sicherheit: 5 senden, 6 während des Requests, ACK der 5 darf 6 nicht quittieren; 5→6→5 anhand Änderungs-ID unterscheiden; nur tatsächlich gesendete Felder bestätigen, ungesendete Putts/Fehler behalten, Default-/Fremdfelder nicht überschreiben, explizite Löschungen und lokale Speicherfehler korrekt melden. Übernimm geeignete Snapshot-/Validierungsideen und alle relevanten Regressionstests aus `55c0db4` gezielt, erhalte V2-View und lokale Sicherheitsgrenzen. Keine Produktions-/Cloudzugriffe, kein Deploy/Merge, keine Änderung vorhandener Worktrees. Liefere Tests gegen den integrierten Code und einen Review-PR; noch keine Produktionsfreigabe.
