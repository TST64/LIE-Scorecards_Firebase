# Mission Samstag – S05 autoritativer Rundenschluss

Stand: 09.11.2026, Europe/Berlin. Issue #20. Basis: Draft-PR #19, `295d13b46762b9b42a45dec481f87cce6f960cb1`. Neuer Worktree `.codex-s05-worktree`, Branch `codex/s05-authoritative-round-close`, PR-Ziel `codex/s06-hcp-round-snapshots`. Keine Cloud-/Firebase-Produktions-/GAS-Zugriffe, Deployments, Merges oder realen Personen-/PIN-/Score-/HCP-Daten.

## Vertrag und Grenzen

Der neue Abschluss verwendet unverändert `functions/hcp-rules.js` aus S06: Saisonstart26 oder expliziter individueller Start, Soll18/36, −0.5/+0.1 pro Punkt, eine Nachkommastelle, Grenzen0–54. Positive .05-Halbwerte aufwärts. Expliziter Strich zählt als gespielt mit Netto0; fehlend, ungültig, doppelt oder außerhalb der gespielten Löcher ist kein vollständiger Abschluss. **Alle Teilnehmer müssen vollständig sein.** Keine implizite DNF-/Abbruchregel.

Finale HCPs werden ausschließlich aus eingefrorenen Rundenstarts, Par/SI/Vorgaben und serverbestätigten versionierten Rohkarten berechnet. Der aktuelle Spieler-HCP ist keine Berechnungsgrundlage. Netto-Gleichstand erhält geteilten Rang und mehrere Netto-Sieger. Brutto-/Putts-Sieger werden ausdrücklich **nicht gewertet**; keine erfundene Strich-/Bruttoregel und keine Änderung alter Siegerlisten.

Historische Schreibkorrekturen, unversionierte Admin-Schreiber, V1-Autosync/API, Altbufferübernahme und Masterreset bleiben gesperrt. Die bisherige `closeSpieltagServer`-API und `closeActiveSpieltag` bleiben ebenfalls gesperrt. Freigegeben ist ausschließlich der neue versionierte Abschlussweg, keine Wiederbelebung des alten Client-HCP-Batches.

## Protokoll und Veröffentlichung

`roundClosureV1` ist eine Auth-Callable mit den Aktionen `inspect`, `begin`, `release`, `commit`, `cancel`. UID/Claims, tatsächliche DB-Rolle, PIN-Wechsel-/Löschstatus, Rundenzustand, exakte Flightpartition und S06-Snapshots werden serverseitig geprüft. Nur Admin/Spielleiter können Fenster eröffnen, abbrechen oder finalisieren. Teilnehmer dürfen ihren Flight freigeben; Admin/Spielleiter dürfen nach ausdrücklichem persönlichem Abgleich auch einen ausgewählten Flight freigeben.

1. **Inspect:** konsistenter Transaktions-Lesestand über Runde, Flights, alle Karten und deren unveränderliche Generation-Bindings. Prüfung von Identität, Loch, HCP-Metadaten, Feldrevisionen und Rohwerten; Berechnung aller Teilnehmer und SHA-256-Digest der Rechenbasis. Fehlende Karten liefern unvollständige Teilnehmer, keine Defaults.
2. **Begin:** benötigt genau diesen Digest und `scoreRevision`, eine neue Abschluss-ID und vollständige Karten. Atomar entsteht `closure.phase=collecting` mit leerer Freigabeliste. Gleiches Begin ist wiederholbar; ein konkurrierender Abschluss mit anderer ID wird abgewiesen.
3. **Freeze:** jeder neue V2-Scorecommit liest dieselbe Runde und erhöht atomar `scoreRevision`. Die Eröffnung schreibt die Runde ebenfalls. Firestore löst das Rennen durch Transaktionskonflikt und erneute Prüfung: entweder der Score ist vorher enthalten und die alte Abschlussbasis ungültig, oder der neue Write wird im Fenster abgewiesen. Auch Admin kann die Sperre nicht umgehen. Vorhandene Score-Receipts dürfen weiterhin eine verlorene Bestätigung liefern; das verändert keinen Score und keine Revision.
4. **Release:** je Flight eine ausdrücklich bestätigte, authentifizierte Freigabe aller verwendeten Schreiber/Geräte, gebunden an Abschluss-ID, Digest und Revision, mit Actor-UID und Zeitpunkt. Die UI verlangt dafür ein eigenes Kontrollkästchen pro Flight. Fehlende Freigaben blockieren `commit`.
5. **Commit:** erneute serverseitige Prüfung derselben Basis und aller Freigaben. Eine einzige Firestore-Transaktion veröffentlicht Rundenzustand `Beendet`, `_roundClose` mit Abschlussrevision1, Ergebnis-/Netto-Rängen, nicht gewertetem Bruttostatus, `hcpEnd`, beide HCP-Projektionen aller Teilnehmer und den privaten Idempotenzbeleg. Bei zwölf Spielern sind das **26 Writes**: Runde, 24 Spielerprojektionen, Receipt. Keine Score-/Historien-Batchwrites nötig.
6. **Retry:** `roundClosureReceipts` bindet Abschluss-ID und angeforderte Basis an genau ein veröffentlichtes Ergebnis. Gleiches Commit liefert dasselbe Ergebnis einschließlich Zeit/Revision, auch bei ACK-Verlust oder parallelen Requests. Andere Basis/ID darf keinen zweiten Abschluss auslösen.
7. **Cancel:** nur vor Veröffentlichung; Freigaben werden verworfen, die ID dauerhaft als abgebrochen belegt, Scores wieder geöffnet. Danach synchronisieren, Konflikte ausdrücklich entscheiden und mit neuer ID/neuem Serverstand beginnen. Kein automatisches Löschen oder Umdeuten lokaler Eingaben. Eine veröffentlichte Runde lässt sich so nicht öffnen.

Alle Transaktionsreads liegen vor den Writes. Ein Fehler nach vorgemerktem Statuswrite und vor Spieler-HCP-Writes verwirft die gesamte Veröffentlichung. Der bestehende eingefrorene Fensterstand bleibt aktiv und kann geprüft, wiederholt oder vor Veröffentlichung abgebrochen werden. Es gibt keinen automatisch ablaufenden Lock, der unbemerkt wieder Schreibzugriffe erlauben würde.

## UI, lokale Queues und ehrliche geräteübergreifende Grenze

Die lokale Prüfung verwendet den rein lesenden `inspectOwnerRound` über sämtliche Partitionen dieses Kontos und dieser Runde. Ausgewählte Admin-Flights und Partitionen ohne gespeicherten Ansichtskontext werden damit ebenfalls erfasst; ein fehlgeschlagener IndexedDB-Read blockiert die Freigabe.

Der neue Einstieg steht in der Spieltagsliste unter **„Abschluss / Serverergebnis“**. Er lädt den aktuellen Serverstand und zeigt pro Spieler gültige/benötigte Löcher, Netto und HCP sowie den Freigabestatus aller Flights. Nach Veröffentlichung zeigen Abschlussansicht und Netto-Leaderboard das serverbestätigte Ergebnis; Brutto/Putts bleiben nicht gewertet.

Vor Begin/Release/Commit prüft der Client online Identität, wartet bereits angenommene lokale Controller-Aktionen ab und liest die dauerhaften eigenen V2-Queues in allen Partitionen dieser Runde. Pending, Konflikte, unklare Requests, Persistenz-/Lesefehler oder vorhandene V1-Pendingdaten verhindern den Aufruf. Doppelklicks werden durch einen laufenden Action-Guard abgefangen; neue lokale Eingaben während der Prüfung werden ausdrücklich abgewiesen. Ein bekanntes Abschlussfenster sperrt den betreffenden lokalen Eingabecontroller zusätzlich. Bereits vorhandene lokale Daten werden nicht bereinigt.

**Technische Grenze:** der Server kann nicht erkennen, dass ein anderes, offline liegendes Gerät noch nicht übertragene Eingaben besitzt. Drei Freigaben sind daher authentifizierte **manuelle Flight-Attestierungen**, kein Beweis allwissender globaler Pending-Erkennung. Verbindlicher Betriebsablauf: alle tatsächlich verwendeten Schreiber/Geräte jedes Flights online vergleichen, ausstehend0/keine Konflikte/keine unklaren Requests prüfen und danach Eingaben beenden; erst dann den geprüften eingefrorenen Stand persönlich freigeben. Bei Zweifel keine Freigabe, Fenster abbrechen und abgleichen. Die geschlossene bekannte Gruppe ist Voraussetzung dieses manuellen Verfahrens. Ein heimlich weiterbenutztes oder vergessenes Offline-Gerät wird dadurch nicht technisch entdeckt.

Unbekannter Commit-Ausgang zeigt keinen Erfolg. Serverstand neu laden; veröffentlichtes Ergebnis über dieselbe ID lesen/wiederholen. Ein Browserabsturz im Fenster löscht weder serverseitige Freigaben noch lokale Queues. Eine komplette Geräte-/Recovery-Freigabe ist trotzdem Bestandteil S08.

## Folgerunde und zusätzliche Schreibgrenzen

Bereits mit `hcpClosure` geschützte Spielerprojektionen dürfen auch nicht gelöscht und neu angelegt werden, um den HCP-Update-Schutz zu umgehen.

S06-`createRoundStart` blockiert weiterhin aktive/unvollständige Vorgänger. Bei abgeschlossenen Vorgängern verlangt es nun zusätzlich einen veröffentlichten versionierten S05-Abschluss und Übereinstimmung des gespeicherten End-HCP mit der reinen chronologischen Berechnung. Die nächste Runde übernimmt diese berechneten Werte, ohne aktuellen Spieler-HCP-Fallback. Legacy-Abschlüsse ohne Beleg werden nicht automatisch migriert.

Rules sperren direkte Änderungen von Abschlussfenster, Score-/Abschlussrevision, Ergebnissen, Starts und HCP-Ende sowie direkte `hcpLIE`-/`hcpClosure`-Updates in beiden Spielercollections einschließlich Admin/Spielleiter. Score-/Flightwrites bleiben gesperrt. `getLoginPlayers` ist nun rein lesend: sein bisheriger automatischer Public-Backfill könnte sonst einen Abschluss mit einem vor dem Commit gelesenen privaten HCP wieder überschreiben. Fehlende öffentliche Projektionen blockieren den Abschluss; keine automatische Legacy-Reparatur durch Login.

## Bestätigte Tests und reproduzierte Fehler

Tests wurden zuerst in Commit `196c0d8` festgehalten: **16 Tests, 16 Fehler** vor Implementierung (`.local-runtime/s05-red.txt`). Danach ergänzt: Folgerundenstart, Ein-Loch-Teilnehmer, Strich, Score-Receipt-Replay nach Freeze/Close und schreibfreie Loginabfrage.

Die rote Baseline weist das fehlende neue Abschlussprotokoll bzw. den fehlenden lokalen Guard nach. Der alte gefährliche Abschluss war auf S06 bereits gesperrt und wurde für diese Tests nicht wieder aktiviert. Die Zwischenfehler werden gezielt im neuen Transaktionsmodell und im echten lokalen Emulator injiziert.

| Prüfung | Beobachtung |
| --- | --- |
| Node einschließlich aller314 bisherigen Fälle | **336/336 erfolgreich**, keine Skips/Fehler, Exit0 |
| Separater unveränderter Hotfix | 30/30 V1-Sicherheitstests erfolgreich |
| Bestehender Sync-Browser | 40 Adapterchecks, 32 Phase-B-Checks und IndexedDB-/Queue-Prüfungen einschließlich zweier neuer Rundenscan-Prüfungen erfolgreich, Exit0 |
| Bestehender Screen-Browser | Je75 Checks bei320/390/1024px, V1/V2-Testtransportwrites0, Exit0 |
| Neue Unitfälle | Stale Cache/Revision/Digest; fehlende/teilweise Freigaben; fehlendes Loch/Ein-Loch-Karte; Strich0; PIN/Rolle/fremder Flight; zwei Abschlüsse; Score/Begin-Rennen; Freeze/Closed-Writer; Cancel; atomarer Fehler; Receipt-Replay; berechnete Folgerunde |
| Echte Demo-Gesamtintegration | **Exit0**, S01/S04/S02/S03/S06 weiterhin grün; anschließend Front108 → Close → Back108 → Close → 18-Loch216 → Close erfolgreich |

Der abschließende Nachweis umfasst **432 eindeutige serverbestätigte Scorecards**, zwölf synthetische `MS01..MS12`, drei Viererflights und drei normale App-Rundenanlagen. Drei getrennte Browserprofile der Flightschreiber bedienen die tatsächlichen UI-Knöpfe für jeweils vier Spieler; ein viertes Profil erzeugt den Zweitgeräte-Konflikt. Keine fertigen Scorecards oder HCP-Starts wurden als Ersatz für die UI-/Anlagewege geseedet. Die bestehende S02-Prüfung mit zwölf eigenen UI-Sendern bleibt zusätzlich erhalten. Dies ist keine physische Zwölf-Geräte-Abnahme.

Unabhängige Emulatorreads prüfen jede neue Karte auf Start-HCP, Lochvorgabe und echte V2-Generation. Je Runde sind drei identitätsgebundene manuelle Flightfreigaben, Transaktionsabbruch nach vorgemerktem Status/HCP-Write, parallele reale Auth-Callable-Abschlüsse, echter Commit mit lokal verlorener Antwort und identisches Receipt-Replay bestätigt. Nach jedem Abschluss stimmen private/öffentliche HCPs und Herkunftsmarker, Serverergebnis, aktuelle UI-HCP-Anzeige und veröffentlichtes Netto-Leaderboard überein. Direkte HCP-Updates/-Deletes und Closure-Updates werden abgewiesen; S07 bleibt blockiert. Beim Front-Fall verhindern der offline ausstehende letzte Score, der Zweitgerätekonflikt und ein nach Freeze abgewiesener echter UI-Write die lokale Freigabe; Cancel und ausdrücklicher Feldentscheid ermöglichen einen neuen sicheren Versuch.

### Bestätigte HCP-Endwerte und Folgerundenstarts

| Spieler | Ende Front / Start Back | Ende Back / Start18 | Ende18 |
| --- | ---: | ---: | ---: |
| MS01 | 26.0 | 26.0 | 26.0 |
| MS02 | 25.0 | 25.0 | 24.0 |
| MS03 | 26.2 | 26.2 | 26.4 |
| MS04 | 26.5 | 26.5 | 27.0 |
| MS05 | 25.5 | 25.5 | 25.0 |
| MS06 | 26.1 | 26.1 | 26.2 |
| MS07 | 27.8 | 27.8 | 31.4 |
| MS08 | 26.0 | 26.0 | 26.0 |
| MS09 | 24.0 | 24.0 | 22.0 |
| MS10 | 26.4 | 26.4 | 26.8 |
| MS11 | 26.0 | 26.0 | 26.0 |
| MS12 | 26.0 | 26.0 | 26.0 |

Alle Werte entsprechen den unabhängig handberechneten Konstanten in `tests/fixtures/hcp-s06-golden.json`. Netto-Sieger Front: MS09 mit22; Back: alle zwölf mit18, geteilter Rang1; 18-Loch: MS09 mit40. Alle drei Spieltage enden `Beendet` mit genau einer Abschlussrevision1. Der normale Back-/18-Loch-Folgerundenstart übernimmt nachweislich die berechneten Vorwerte; kein vierter Spieltag nach der letzten 18-Loch-Runde behauptet. Maschinenlesbarer Laufbeleg: `.local-runtime/s05-close-proof.json` (`serverConfirmedCards=432`, drei `chronologicalRounds`, `releaseGo=false`).

Die erste Sandbox-Nodeprüfung hatte ausschließlich beim vorhandenen lokalen HTTP-Test `fetch failed`; die vollständigen freigegebenen Loopback-Läufe waren grün. Die beiden Browserstarts wurden von der Sandbox blockiert; außerhalb der Sandbox bestanden beide Suites. Keine Änderung der Anwendungs-/Cloud-Guards dafür.

Die ersten S05-Integrationsversuche stoppten sicher: zunächst mussten zusätzliche Profile den normal neu angelegten Spieltag regulär laden; danach erzeugte die Zweitgeräte-Fixture versehentlich einen Dokumentgenerationswechsel statt des beabsichtigten Feldkonflikts. Die Lifecycle-Sperre verhinderte die Auflösung. Der Test erzeugt jetzt zuerst eine normale Karte und anschließend einen Revisionskonflikt innerhalb derselben Generation; keine Lockerung der Schutzlogik. Fehlversuche sind keine erfolgreiche Gesamtabnahme.

Weitere Iterationen korrigierten einen voreiligen zweiten Feldentscheid im Test und ergänzten die fehlende explizite `round_close`-Route im Router. Die Prüfung eines alten UI-Schreibers verwendet den vorhandenen Sender direkt; eine nachträgliche globale Transport-Neuzuweisung hätte dessen bereits gebundene Transportfunktion nicht ersetzt. Die abschließende Suite prüft die tatsächliche Route und den tatsächlichen abgewiesenen Write.

Reproduzierbare Befehle im neuen Worktree:

```powershell
# Rote Baseline vor Fix, Commit196c0d8:
node --test functions/test/round-close-s05.test.js tests/round-close-s05-client.test.cjs
# Vollständige Node-Suite:
$env:SCORE_SYNC_EMULATOR_TEST='0'
node --test tests/preprod-gates.test.cjs tests/preprod-hosting.test.cjs tests/local-environment.test.cjs functions/test/score-read-v2.test.js functions/test/score-operations-v2.test.js tests/score-screen.test.cjs tests/v1-s01-snapshot.test.cjs tests/v1-s01-bridge.test.cjs functions/test/pin-s04.test.js tests/pin-s04-client.test.cjs tests/score-auto-sync.test.cjs functions/test/score-writer-safety.test.js tests/hcp-s06.test.cjs functions/test/round-start-s06.test.js functions/test/round-close-s05.test.js tests/round-close-s05-client.test.cjs
node tests/run-score-sync-browser.cjs
node tests/run-score-screen-browser.cjs
# Java21, Node22, npm ci in Root und Functions:
$env:LIE_AUTH_PORT='9399'; $env:LIE_FIRESTORE_PORT='8388'
$env:LIE_FUNCTIONS_PORT='5301'; $env:LIE_APP_PORT='5702'
npm run test:integration
```

Laufbelege ausschließlich lokal/ignoriert: `s05-red.txt`, `s05-node.txt`, `s05-sync-browser.txt`, `s05-screen-browser.txt`, `s05-emulator.txt` unter `.local-runtime/`. Auth-/Firestore-/Functions ausschließlich `demo-lie-scorecards-local`, Loopback, leere Credential-Homes, bestehende Netzwerk-/CSP-/Cloud-Gates aktiv. PINs/Hashes/Tokens werden nicht als Testdiagnostik ausgegeben.

## Annahmen, offene Abnahmen und S07/S08

Die Worktree-Integrität wurde lesend verglichen: ursprünglicher Entwicklungsbranch `feature/score-autosync` unverändert auf `cb4661f`, einschließlich seines vollständigen vorhandenen Entwicklungsdiffs und der ungetrackten Dateien; hinzugekommen ist nur `.codex-s05-worktree/`. Alle zehn älteren isolierten Worktrees bleiben getrackt sauber und auf ihren bisherigen HEADs, insbesondere S06 `295d13b`, S02/S03 `437c76d`, S04 `3d77af8` und S01 `f862cf0`. Hotfix bleibt `55c0db4` mit ausschließlich seiner bereits vorhandenen ungetrackten `fiveserver.config.js`. Kein alter Branch wurde umgehängt.

- **Fachlich offen:** Brutto-/Putts-/DNF-/Nichtantritts-/Abbruchvertrag; Veröffentlichung bleibt gesperrt. Kein stilles Korrigieren historischer Sieger.
- **Betrieblich erforderlich:** die persönlich abgeglichene Flight-Freigabe umfasst alle verwendeten Geräte. Diese manuelle Zusage ersetzt keine technisch mögliche Offline-Queue-Erkennung.
- **Ungeprüft:** reale Geräte, echte Kurs-/Vorgabentabellen, produktive Altbestände, Cloud-PreProd, Backup/Restore und Samstagsbetrieb. Keine Produktionsabnahme aus Demo-Tests ableiten.
- **S07 bleibt gesperrt:** spätere Korrekturplanung muss `_roundClose.revision`, `scoreDigest`, eingefrorene Roh-/Startbasis, `hcpClosure` und die gesamte Folgeabschluss-/Folgerundenkette berücksichtigen. Kein nachträgliches Überschreiben eines veröffentlichten Abschlusses oder einzelner Spieler-HCPs durch diesen Auftrag.
- **S08 bleibt offen:** geräteübergreifender Betriebs-/Recoveryablauf, Backup, Wiederherstellung und komplette Generalprobe/Freigabe.

Mission Samstag bleibt **Release-NO-GO**, bis S07/S08, vollständige Abnahme, Backup und separate Freigabe abgeschlossen sind. Kein Deployauftrag durch diesen PR.
