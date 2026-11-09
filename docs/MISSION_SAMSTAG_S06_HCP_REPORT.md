# Mission Samstag – S06 Gruppen-HCP und Rundenstart

Stand: 09.11.2026, Europe/Berlin. Auftrag: Issue #18. Basis: Draft-PR #17, Commit `437c76d4cadbba2bc6587acac2f60b5aa616b7f6`. Neuer isolierter Worktree `.codex-s06-worktree`, Branch `codex/s06-hcp-round-snapshots`. Kein Produktions-/GAS-Zugriff, keine Cloud-Projektänderung, kein Deploy und kein Merge.

## Bestätigte Ergebnisse

Die reproduzierenden Tests wurden vor dem Fix in Commit `508c788` festgehalten: **15 Tests, 15 Fehler** auf dem Ausgangsstand. Nach dem Fix sind die Rechner-, Snapshot-, bestehenden Sicherheits- und Browserprüfungen erfolgreich. Die echte lokale Auth-/Firestore-/Functions-Integration hat für `9-Front`, `9-Back` und `18` jeweils die normale Rundenanlage, zwölf autoritative Starts und anschließende normale V2-Neueingaben nachgewiesen. Die Snapshots wurden dabei nicht vorab als Testdaten eingesetzt.

Dies ist eine S06-Teilabnahme. Rundenschluss, persistierte Saisonfortschreibung, historische Schreibkorrekturen und die komplette Samstags-Generalprobe bleiben **NO-GO**. Ein erfolgreicher Rechnerplan ist keine ausgeführte historische Migration.

## Verbindlicher Gruppenvertrag

Keine WHS-Berechnung. Saisonstart-HCP 2026 ist 26.0, außer `config/saison.seasonStartHcpByPlayer[playerId]` enthält einen expliziten gültigen individuellen Start; **0 ist gültig**. Ein heutiger Wert aus `spieler.hcpLIE` ist keine historische Startquelle. Ein gültiger Saisonbeginn in `saisonStartDatum` ist erforderlich.

| Gegenstand | Regel |
| --- | --- |
| Runden | Front 1–9, Back 10–18, vollständig 1–18; generisch `9` wird ausdrücklich `9-Front` |
| Netto | Je gespieltem Loch `max(0, 2 + Par + Lochvorgabe − Schläge)` |
| Strich | Explizites `maxscore=true`: gespielt und Netto 0; Platzhalterschläge/Putts bestimmen keine Wertung |
| Fehlend/ungültig | Kein Ersatz durch 0; keine HCP-Fortschreibung. Duplikate, fremde Löcher, NaN, ungültige Schläge/Flags sind ungültig |
| Soll | 18 Netto bei 9 Loch; 36 bei 18 Loch |
| Verbesserung | 0.5 je Punkt über Soll abziehen |
| Verschlechterung | 0.1 je Punkt unter Soll addieren |
| Präzision | Eine Nachkommastelle; positive Halbwerte aufwärts, z. B. 26.05 → 26.1; Grenzen 0–54 |
| Spielvorgabe | Eindeutige exakte Tabellenzeile für das normalisierte Start-HCP, sonst ganzzahlig aufgerundeter Halbwert des Start-HCP als 18-Loch-Spielvorgabe |
| Neun Loch | Erst ganzzahlige 18-Loch-Spielvorgabe bestimmen, dann Hälfte auf ganze Vorgaben runden; HCP26 → 13 |
| Verteilung | Ganze Basis `floor(V/H)` für jedes gespielte Loch, Rest nach aufsteigendem SI innerhalb genau dieser gespielten Löcher |

Die Tabellen-/Fallbackkonvention und Halbwertregel sind explizite Implementierungsentscheidungen dieses Gruppenverfahrens. Sie sind getestet, aber keine Behauptung einer offiziellen Club-/WHS- oder Tabellenfreigabe. Gleiche Tabellen-HCPs mit mehreren Treffern, fehlende Löcher und doppelte gespielte SIs werden abgewiesen. Eine unvollständige frühere Runde blockiert auch nachfolgende Fortschreibungen.

## Vereinheitlichung der Berechnungsstellen

`functions/hcp-rules.js` ist die reine gemeinsame Implementierung. `npm run build:hcp` erzeugt daraus bytegleich `Hcp_Rules.js`; ein Test prüft die Gleichheit. Das Browserasset ist kein unabhängiges Testorakel. `App_Logic_Scores.js`, `App_Logic_History.js` und der V2-Adapter verwenden diesen Vertrag. HCP-0-Fallbacks, Ganzzahltrunkierung und die fehlerhafte Verteilung von generisch neun Loch auf 18 Loch wurden entfernt.

Die normale V2-Eingabe zeigt eine gekennzeichnete HCP-Vorschau aus bestätigten Werten und eingefrorenen Rundenmetadaten. Bei offenen Eingaben, Syncproblemen oder unvollständigen Karten zeigt sie keine Fortschreibung. Das Netto-Leaderboard verwendet denselben Rechner, kennzeichnet Server-Lesestand und Vorschau und vergibt erst bei vollständigen gültigen Teilnehmerkarten Ränge; gleiche Nettozahlen teilen den Rang. Eine Siegerfreigabe oder Spieler-HCP-Schreibfortschreibung findet nicht statt. Legacy-Brutto-/Putts-Details und Performance-Veröffentlichungen sind ausdrücklich gesperrt, solange Strich-/S05-/S07-Abnahme fehlt.

## Autoritativer Rundenstart und V2

Der normale `saveZufallsFlights`-/Rundenanlage-Handler übergibt nur Rundenidentität, Teilnehmer und Flights an `createRoundStart`. `App_Logic_Bridge.js` schreibt keine Client-Snapshots. `functions/round-start.js` prüft Auth-UID/Claims, unveränderten PIN-Status sowie aktuelle privilegierte DB-Rolle, aktive Spieler, Runde, Kurs und exakte Flightpartition (höchstens zwölf Teilnehmer, höchstens vier pro Flight). Clientseitig gelieferte HCP-Starts und Vorgaben werden abgewiesen.

Eine Firestore-Transaktion liest Saisonbasis, Kurs/Lochdaten, Vorgabentabelle und gegebenenfalls frühere abgeschlossene Runden samt Rohscores. Nur vollständige, versionierte und zur reinen Berechnung passende historische Startketten sind zulässig. Aktive Überschneidungen, Legacy-/unvollständige Historie, historische Einfügungen, verwaiste Scorecards und belegte Flight-IDs blockieren den Start. Es gibt keine automatische Reparatur oder Übernahme aktueller Spieler-HCPs.

Atomar gespeichert werden Runde und Flights mit:

- `hcpSnapshotVersion: 1`, `hcpStart[playerId]` und `holeAllowances[playerId][hole]`;
- `hcpHoleData` mit gespieltem Par/SI und `hcpCourseTable` als eingefrorener Berechnungsbasis;
- `_roundStart` mit Version, Saisonbeginn, Quellenkennung und SHA-256-Anfragefingerprint.

Identisches Wiederholen der Anlage liefert die vorhandene Runde; ein abweichender Aufruf kann sie nicht überschreiben. Direkte Rundenanlage/-löschung und Flightwrites sind in Rules gesperrt. Rundenupdates dürfen weder Starts/Vorgaben/Kursbasis noch Teilnehmer, Datum, Rundenart oder Status verändern. Der bisherige Bearbeiten-Dialog ist deshalb gesperrt. Eine Flight-Reorganisation ist kein Bestandteil dieses Auftrags.

V2-Read und V2-Write validieren die eingefrorenen Starts und Vorgaben. Gelesene Par-/SI-Werte stammen aus dem Snapshot. Neue Scorecards erhalten `hcpStart` und `strokesGiven` vom Server. Alte aktive Runden ohne gültige Snapshots bleiben gesperrt; kein stilles Backfill. Die S02/S03-Revisionen, Receipts, Konflikte und lokalen Generationen bleiben bestehen.

## Unabhängiges Orakel und historische Korrektur

Die alte S0-Matrix hatte fälschlich ganzzahlig gerundet. `MISSION_SAMSTAG_TEST_MATRIX.md` wurde ausdrücklich korrigiert. `tests/fixtures/hcp-s06-golden.json` enthält unabhängig von der Appformel handberechnete Konstanten für zwölf Spieler, drei Runden und 432 Rohkarten. Beispiele: MS03 endet 26.4, MS04 27.0, MS05 25.0, MS07 31.4 und MS10 26.8.

Reine Planung der Korrektur MS02/Front/Loch6 von 7 auf 3 Schläge: Front Netto24/Ende23.0; feste Back-Rohscores ergeben Netto17/Ende23.1; feste 18-Loch-Rohscores ergeben Netto36/Ende23.1. Der alte Endwert23 war falsch. Rohdaten bleiben unverändert, wiederholte Planung ist deterministisch. Historische Schreibkorrekturen werden dadurch nicht freigegeben.

## Ausgeführte sichere Prüfungen

Alle Aufrufe liefen im neuen Worktree. Lokale Belege unter `.local-runtime/` sind ignorierte Laufartefakte, keine personenbezogenen Daten und kein Bestandteil des PR.

| Prüfung | Ergebnis und Aussage |
| --- | --- |
| Rote Regressionen vor Fix | 15/15 reproduzierbar fehlgeschlagen; `.local-runtime/s06-red.txt`, eigener Tests-Commit |
| Node-Gesamtsuite | 314 Tests erfolgreich, keine Fehler/Skips; HCP, Start, S01, S04, V2, Read/Writer-Safety, Screen sowie lokale/PreProd-Guards |
| Sync-Browser | 40 Adapterprüfungen erfolgreich; vorhandene weitere Queue-/Speicher-/Phase-B-Prüfungen erfolgreich, Exit0 |
| Screen-Browser | Je 75 Checks bei 320, 390 und 1024 Pixeln; jeweils V1/V2-Testtransportwrites0, Exit0 |
| Bestehender Hotfix | 30/30 V1-Sicherheitstests im unveränderten Hotfix-Worktree erfolgreich |
| Echte Emulatorintegration | Exit0; S01-Journal, S04-PIN-/Claims-/Recovery, S02 zwölf UI-Sender, S03 Konflikte/Admin/Replay/Offline weiterhin erfolgreich |
| S06 normale Anlage | Je Runde zwölf synthetische `GH01..GH12`, drei Viererflights; Front/Back/18 separat; HCP0 und Saison26 trotz abweichender heutiger Spieler-HCPs |
| S06 normale V2-Eingabe | Neue Karten nach echten UI-Klicks; unabhängig per AdminSDK gelesene HCP-/Vorgabenwerte stimmen; Strich0 und unvollständige Vorschau geprüft |
| Rules/Schreibsperren | Je Rundenfall direkte Änderungen von HCP, Vorgaben, Lochbasis, Status und Flightmitgliedern abgewiesen; Rundenschluss/History weiterhin blockiert |

Reproduktion der Node-Suite:

```powershell
$env:SCORE_SYNC_EMULATOR_TEST='0'
node --test tests/preprod-gates.test.cjs tests/preprod-hosting.test.cjs tests/local-environment.test.cjs functions/test/score-read-v2.test.js functions/test/score-operations-v2.test.js tests/score-screen.test.cjs tests/v1-s01-snapshot.test.cjs tests/v1-s01-bridge.test.cjs functions/test/pin-s04.test.js tests/pin-s04-client.test.cjs tests/score-auto-sync.test.cjs functions/test/score-writer-safety.test.js tests/hcp-s06.test.cjs functions/test/round-start-s06.test.js
node tests/run-score-sync-browser.cjs
node tests/run-score-screen-browser.cjs
```

Emulatorlauf: Java21 in `JAVA_HOME`, Node22, lokale Abhängigkeiten via `npm ci` in Root/Functions; `LIE_AUTH_PORT=9299`, `LIE_FIRESTORE_PORT=8288`, `LIE_FUNCTIONS_PORT=5201`, `LIE_APP_PORT=5602`, dann `npm run test:integration`. Projekt ausschließlich `demo-lie-scorecards-local`; bestehende Credential-/Emulator-/Netzwerk-/CSP-Guards unverändert aktiv. Keine Cloud-Anmeldung nötig. Proof: `.local-runtime/s06-hcp-proof.json`; Log: `.local-runtime/s06-emulator-output.txt`. Keine PINs, Hashes oder Tokens als Testausgabe.

Die drei S06-Emulatorfälle sind **unabhängige Anlagefälle**. Zwischen ihnen werden ausschließlich ihre synthetischen lokalen Runden/Flights/Karten bereinigt. Es wurde kein Rundenschluss simuliert, um dieselben Teilnehmer freizuschalten; die drei chronologischen Goldenrunden sind ausschließlich reine Planungstests.

Zwei abschließende Node-Läufe innerhalb der Sandbox meldeten jeweils 313/314 mit `fetch failed` beim vorhandenen lokalen HTTP-Server-Test (Readiness/Secrets). Der vollständige Lauf wurde deshalb mit freigegebenem Loopback-Zugriff außerhalb der Sandbox wiederholt: **314/314 grün, Exit0**; dies ändert keine Emulator-/Produktionsguards. Der vorherige 312er-Lauf ohne die letzten beiden zusätzlichen Rechnerprüfungen war ebenfalls grün.

Die alten Branch-HEADs und Git-Status wurden abschließend lesend verglichen: alle bisherigen isolierten Worktrees weiterhin ohne getrackte Änderungen; Hotfix weiterhin nur seine vorhandene ungetrackte `fiveserver.config.js`. Der ursprüngliche Entwicklungsdiff und die vorhandenen ungetrackten Dateien sind unverändert; hinzugekommen ist ausschließlich das neue Worktree-Verzeichnis.

## Offene Entscheidungen, Annahmen und nächste Schritte

- **Ungeprüft:** echte Kurs-/Vorgabentabellen, reale Geräte, produktive Altbestände und Cloud-PreProd. Keine reale Datenmigration durchgeführt oder aus den synthetischen Tests abgeleitet.
- **S05 offen:** atomarer, wiederholbarer Rundenschluss mit Pending-/Konfliktbarriere und fachlicher Brutto-/Putts-/DNF-Entscheidung. Heute kann eine weitere Runde mit noch aktiven Teilnehmern bewusst nicht gestartet werden.
- **S07 offen:** freigegebene Migration/Validierung alter Starts, Wiederanlauf historischer Korrekturen und konsistente private/öffentliche HCP-Fortschreibung. Keine automatische Altbestandsannahme.
- **S08/Betriebsabnahme offen:** vollständige Zwölf-Spieler-Generalprobe, Geräte-/Offline-/Restore- und Betriebsablauf. Teilnachweise der vorigen Reparaturen ersetzen diese Abnahme nicht.
- **Review erforderlich:** positive Halbwertregel und explizite Tabellen-Fallbackkonvention sind transparent festgelegt; spätere fachliche Änderungen müssen Orakel, Rechner und Snapshotversion gemeinsam berücksichtigen.

V1-Autosync, unsichere Score-Upserts, direkte Admin-Scorewrites, alte Pufferübernahme, Masterreset sowie S05/S07 bleiben gesperrt. Keine Deployfreigabe; Mission Samstag bleibt bis zu den offenen P0-Abnahmen NO-GO.
