# Mission Samstag – S07 revisionsgebundene historische Korrektur

Stand: 09.11.2026, Europe/Berlin. Issue #22. Basis Draft-PR #21 / `2c32064a9850eeac10587d807f1d523d3bcafe8f`, Branch `codex/s05-authoritative-round-close`. Neuer isolierter Worktree `.codex-s07-worktree`, Branch `codex/s07-revisioned-history-correction`; PR-Ziel ist ausschließlich der S05-Branch. Kein Merge, Deploy, Cloud-Projektanlegen, produktiver Firebase-/GAS-Zugriff oder echte Personen-/PIN-/Score-/HCP-Daten.

## Entscheidung und Freigabeumfang

Implementiert ist ein **gesonderter, nur tatsächlichen Administratoren zugänglicher, begrenzter S07-Vertrag**. Alte Admin-Formularwrites, `recalculateSeasonFromStart`, V1-API/Autosync, unversionierte Scorewrites, Masterreset und automatische Legacy-Migration bleiben gesperrt. Kein allgemeiner historischer Firestore-Batch darf wieder öffentlich schreiben.

Der vollständige betroffene Folgeabschnitt muss in **höchstens480 Nutzdaten-Writes** und eine validierte einzelne Veröffentlichungstransaktion passen. Hinzu kommen drei Metadaten-Writes für Mutation-Receipt, Run und Published-Control: maximal483 statt mehr als500 Writes. Der verlangte Zwölf-Spieler-Fall benötigt **459 +3 =462 finale Writes**. Größere Ketten werden vor Lock/Mutation ausdrücklich abgewiesen, niemals abgeschnitten. Für solche Ketten wäre eine separat abzunehmende generationsbasierte Materialisierung mit atomarem Published-Pointer erforderlich.

**Release bleibt NO-GO** bis S08, Backup/Restore, Daten-/Geräte-/Betriebsabnahme und separater Freigabe. Ein lokaler Demo-Nachweis ist keine Freigabe produktiver Bestandsdaten.

## Inventarisierter Ausgangsstand und erhaltene Grenzen

| Stelle | Ausgangsbefund / S07-Verhalten |
| --- | --- |
| `Views_AdminKorrektur.js` | Alter direkter Batch und „Speichern & Saison neu berechnen“ existieren als Legacy-Code, halten aber weiterhin vor Formular-/DB-Zugriff an; nicht freigeschaltet |
| `App_Logic_History.js` | Alte saisonweite Batch-Neuberechnung weiterhin früh gesperrt; reine S06-Berechnung bleibt Referenz |
| `score-operations-v2.js` | Feld-CAS, Generation-Bindings und dauerhafte Mutationsreceipts bleiben erhalten; globale Korrekturbarriere zusätzlich geprüft |
| `roundClosureV1` | Gemeinsamer Server-Inspector für Startbasis, Flights, Rohwerte, Generationen und Ergebnisdigest; S05-Abschluss weiterhin atomar/einmalig |
| `createRoundStart` | Verlangt konsistente veröffentlichte Vorgängerkette und freie Korrekturbarriere; neue Starts referenzieren den Published-Stand |
| Rules / Spielerprojektionen | Direkte Score-, Closure-, Start-/End-HCP- und Published-/Snapshot-Revisionswrites einschließlich Admin weiterhin gesperrt; Runs und Staging bleiben privat |
| Receipts | Alte Score-/Closure-Belege bleiben erhalten. Historische Korrektur erzeugt einen neuen V2-kompatiblen Mutation-Beleg und dauerhaften Run-Beleg; kein Zurückdrehen alter Generationen |

## Formaler Fach- und Revisionsvertrag

Unverändert privates Gruppen-HCP aus S06, kein WHS: Start26.0 oder expliziter individueller Saisonstart, Soll18/36 Netto bei9/18, je Punkt über Soll−0.5 und unter Soll+0.1, eine Nachkommastelle mit positivem Halbwert aufwärts, Begrenzung0–54. Expliziter Strich ist gespielt/Netto0; fehlende oder ungültige Löcher erlauben keine Fortschreibung. Brutto/Putts bleiben nicht gewertet; DNF wird nicht erfunden.

Der neue `historyCorrectionV1`-Request benennt genau eine vorhandene Karte, Feld, Set/Delete, Wert, ursprüngliche Feldrevision, Dokumentgeneration und eindeutige Change-ID. Der Server prüft Firebase-UID=playerId, `mustChangePin=false`, tatsächliche aktuelle Admin-DB-Rolle, Claims und PIN-/Löschstatus. Spielleiter sind ausdrücklich ausgeschlossen. Die UI bietet zunächst eine bewusste Schlägekorrektur; der Backendvertrag validiert die vier bekannten V2-Felder.

Die Vorschau verfolgt die gesamte über Teilnehmer verbundene Saisonfamilie und alle folgenden abgeschlossenen Runden in der Reihenfolge Datum/ID. Sie validiert wirkliche ISO-Daten, höchstens zwölf Spieler, versionierten S06-Anlagebeleg, vollständige S05-Abschlüsse, exakte Teilnehmer-/Flight-/Lochidentitäten, sämtliche Score-Generation-Bindings, aktuelle Digests/Revisionen, Start-/Endketten, Netto-Ergebnisse und beide aktuellen HCP-Projektionen samt Herkunft. Aktive kollidierende Folgerunden, Legacy, gelöschte/unvollständige Historie, ungültige Kette oder oversized Daten blockieren. Es gibt keine Ableitung aus einem beliebigen heutigen Spieler-HCP und keine automatische Altbestandsmigration.

`basisHash` bindet **Quellstand, exakt bestätigte Änderung und vollständigen deterministischen fachlichen Plan**. Eine Vorschau7→3 kann daher keinen Prepare7→4 autorisieren. Die fertige Staging-Version bekommt zusätzlich ihren eigenen `planHash`, der sämtliche finalen Payloads einschließlich Run-/Published-Stempel bindet. Vor Veröffentlichung werden Quelle und Plan erneut vollständig geprüft.

## Mehrere private Commits, eine öffentliche Veröffentlichung

1. **Preview:** nur lesende Servertransaktion. Zeigt alte/neue Start- und End-HCPs für alle betroffenen Runden/Spieler, CAS-Basis und vollständig berechnete Netto-/Siegerwerte. Keine Reservierung und keine Liveänderung.
2. **Prepare:** eindeutige Run-ID, explizite Bestätigung des gebundenen Plans. Eine Transaktion speichert den dauerhaften Plan in `historyCorrectionRuns` und setzt `historyPublication/current.activeRun`. Der Run enthält ursprüngliche Zielkarte, Änderung, Quell-/Planhashes, frühere Closure-Revisionen/Digests, Actor-UID und Zeit. Keine Auth-/PIN-Daten in Planprojektionen. Eine konkurrierende Korrektur kann nicht denselben Lock übernehmen.
3. **Stage:** idempotente private Payloads in `historyCorrectionStages`; im Referenzfall Batch1 genau400, Batch2 genau59 Einträge. Der fortgeschriebene Checkpoint wird erst nach Prüfung der gespeicherten Payloads bestätigt. Geht die Antwort verloren oder endet der Prozess nach Batchcommit vor Checkpoint, werden dieselben IDs/Inhalte erneut geprüft/geschrieben. Keine öffentlichen Score-/HCP-Daten ändern sich dabei.
4. **Ready:** alle459 Payloads privat vorhanden. Run/Plan/Staginghashes und ursprüngliche Quelle müssen weiter exakt passen. Der Status bedeutet ausdrücklich **noch nicht veröffentlicht**.
5. **Publish:** eine einzige Firestore-Transaktion liest nochmals Quelle, privaten Plan und sämtliche Staging-Dokumente und schreibt alle459 Liveprojektionen zusammen mit drei Metadatenbelegen. Runde, Scorewerte/Metadaten, HCP-Kette, Ergebnisse, Spielerprojektionen und Published-Revision wechseln gemeinsam. Ein Fehler beim Vormerken irgendeines Writes verwirft die komplette Veröffentlichung.
6. **Retry/Recovery:** Runstatus und Published-Resultat sind dauerhaft. Gleiche veröffentlichte Run-ID liefert dasselbe Ergebnis, ohne weitere Feld-/Closure-/HCP-Inkremente. Unklarer Ausgang bedeutet Statusabfrage, keine grüne Erfolgsmeldung. Abbruch vor Veröffentlichung gibt den Lock frei und behält Run/Staging zur Prüfung; er führt keinen blinden Live-Rollback aus. Bei geänderter Quelle oder beschädigtem Staging bleibt Veröffentlichung gesperrt – Reparatur/Abbruch erforderlich.

Der Referenzplan enthält432 Karten, drei Runden und24 Spielerprojektionen. Nicht korrigierte Rohwerte bleiben identisch. Nur das korrigierte Feld erhöht seine V2-Revision um1; Dokumentgeneration und Birth-Binding bleiben erhalten. Abgeleitete HCP-Metadaten werden für den gesamten Folgeabschnitt erneuert.

Die globale Barriere wird von V2-Writer, Rundenschluss und Rundenanlage in deren Transaktionen gelesen. Während eines Runs sind neue Writes/Abschlüsse/Starts pausiert. Bereits aktive kollidierende Runden verhindern schon die Planung; solche Rundensnapshots oder lokale Offline-Queues werden nicht heimlich neu basiert. Unbekannte fremde Offline-Queues sind technisch nicht allwissend erkennbar. Alte geschlossene Geräte bekommen keine historische Schreibberechtigung; ihre lokalen Daten werden nicht gelöscht.

## Versionen, Belege und konsistentes Lesen

S06 bleibt der Schema-/Rechnervertrag (`hcpSnapshotVersion=1`). Eine historische Materialisierung erhält eine **neue `hcpSnapshotRevision`**, im Referenzfall1→2. Ebenso steigt `_roundClose.revision`1→2 für jede betroffene Runde; Score-Revision/Digest werden neu gebunden. Neue historische Startmaps sind neue veröffentlichte Rechenrevisionen, kein unmarkiertes Überschreiben des ursprünglich bestätigten Starts. Vorherige Werte/Revisionen sind im Run und den erhaltenen Closure-/Korrekturbelegen nachvollziehbar.

`historyPublication={runId,revision}` kennzeichnet korrigierte Karten/Runden/Spielerprojektionen. `hcpClosure` verweist auf aktuelle Runde, ursprüngliche Close-ID, neue Abschlussrevision, neuen Digest und Korrekturstand. Ein danach normal erzeugter Spieltag beginnt wieder mit Snapshotrevision1, referenziert aber die vollständig veröffentlichte Saisonrevision1/Run-ID. Seine neuen V2-Karten übernehmen diesen Quellenstempel.

Ein alter S05-Close-Receipt bleibt als ursprünglicher Beleg erhalten. Wiederaufruf nach S07 schreibt nichts und liefert den aktuellen supersedierenden Rundenschluss mit ausdrücklicher Kennzeichnung; er darf keine alten HCPs zurück in UI/Projektionen bringen. Normale stale V2-/Admin-/Legacy-Schreiber bleiben für abgeschlossene Runden abgewiesen. Neue Korrekturen verlangen neue CAS-/Planbasis.

`readPublishedSeasonV1` liest Runde, Karten, öffentliche HCP-Projektionen, Flights und Published-Control **in einer Servertransaktion**. Globales Refresh verwendet diese zusammengehörigen Daten statt voneinander unabhängiger Collection-Lesestände; auch Admin-Profilzusätze dürfen die HCP-Werte dieses Snapshots nicht durch einen späteren privaten Read ersetzen. Legacy-`scores` überstimmen keine autoritativen Scorecards. Die alte konsistente Saison bleibt während Staging lesbar; Staging/Run-Dokumente sind selbst für direkte Admin-Clientreads gesperrt.

Die gesonderte UI ist über den bestätigten Abschluss erreichbar: Vorschau → ausdrückliche Bestätigung → privater Run → Status/Teile vorbereiten → gesonderte finale Veröffentlichung. Lauf-ID wird vor Prepare lokal dauerhaft gehalten und kann nach Reload eingegeben/wiederaufgenommen werden. Zustände unterscheiden „In Bearbeitung“, „noch nicht veröffentlicht“, „Veröffentlicht“, „Abgebrochen“, unbekannten Ausgang und Reparaturbedarf. Lokale Pending-/Konflikt-/Speicherfehler blockieren Prepare/Publish; kein Doppelklick startet einen zweiten Run.

## Tests und bestätigte Ergebnisse

Die Tests wurden vor Implementierung in `6fc1363` committed: **8 Tests, 8 Fehler** (`.local-runtime/s07-red.txt`), weil der neue sichere Vertrag fehlte. Die auf S05 bereits gesperrten alten Writer wurden dafür nicht reaktiviert. Später ergänzte Fälle prüfen öffentlichen Leseschutz, Quelle geändert, atomaren Endfehler/ACK-Verlust, begrenzte Ketten und Neukartenstempel.

| Prüfung | Ergebnis |
| --- | --- |
| Node | 349/349 erfolgreich, alle336 bisherigen Fälle erhalten, keine Skips |
| Separater unveränderter Hotfix | 30/30 erfolgreich |
| Sync-/IndexedDB-Browser | 40 Adapterchecks,32 Phase-B-Checks sowie vorhandene Queue-/Scope-/Rundenscan-Prüfungen erfolgreich |
| Screen-Browser | Je75 Checks bei320/390/1024px, keine renderbedingten V1/V2-Testtransportwrites |
| Lokale Demo-Gesamtintegration | **Exit0:** S01/S04/S02/S03/S06/S05 unverändert erfolgreich; danach vollständige S07-Korrektur, Worker-Crash/Recovery, atomare Veröffentlichung und normale vierte Runde/V2-Neukarte erfolgreich |

### Unabhängig geprüfter MS02-Lauf

Die Quelle sind die vorher normal über die App angelegten drei S05-Runden und432 UI-Karten von zwölf synthetischen Spielern in drei Viererflights. Die Korrektur nutzt die gesonderte Admin-Vorschau/Bestätigung. Erst400 private Payloads, dann absichtlicher Fehler vor dem zweiten59er-Batch: weiterhin alte Scores7/HCP24 und alle Abschlussrevisionen1. Ein echter separater Node-Worker bestätigt anschließend den zweiten Batch und beendet sich absichtlich mit Exit73 **vor** Checkpoint. Ein neuer OS-Prozess nimmt dieselbe Run-ID auf; nochmals dieselben59 Payloads, dann Ready459, weiterhin keine Liveänderung.

Ein zusätzlich injizierter Fehler während der finalen Firestore-Transaktion lässt ebenfalls die komplette alte Saison stehen. Danach erfolgt der echte Auth-Callable-Commit mit lokal verlorener Antwort: UI meldet unklar statt Erfolg, unabhängige DB-Reads sehen die komplette neue Saison. Ein paralleler transaktionaler Leser sieht ausschließlich `[7,24,Revision0]` oder `[3,23.1,Revision1]`, keine Kombination. Derselbe Publish-Retry liefert genau das gespeicherte Ergebnis. Direkte Stagingreads sind selbst für Admin im Browser abgewiesen.

| Runde | MS02 Start vorher → neu | Netto vorher → neu | Ende vorher → neu | Neue Abschlussrevision |
| --- | ---: | ---: | ---: | ---: |
| 9-Front | 26.0 → 26.0 | 20 → 24 | 25.0 → 23.0 | 2 |
| 9-Back | 25.0 → 23.0 | 18 → 17 | 25.0 → 23.1 | 2 |
| 18 Loch | 25.0 → 23.1 | 38 → 36 | 24.0 → 23.1 | 2 |

Alle431 nicht korrigierten Rohkarten behalten exakt ihre Schläge/Putts/Lady/Strich-Werte; alle432 Generationen bleiben erhalten. Nur die Zielkarte erhöht ihre Schläge-Feldrevision um1. Für alle zwölf stimmen private/öffentliche End-HCPs, Herkunftsmarker und neue Closure-Revisionen. Der vierte normale Spieltag startet mit MS02=23.1 und dem Korrektur-Run-Stempel; seine echte neue V2-Karte hat Start23.1, Lochvorgabe2 und denselben Published-Stempel. Eine weitere historische Korrektur wird bei dieser aktiven Folgerunde ausdrücklich abgewiesen.

Die elf anderen Spieler behalten ihre unabhängigen Golden-Werte aus `tests/fixtures/hcp-s06-golden.json`:

| Spieler | Ende Front | Ende Back | Ende18 / Start vierte Runde |
| --- | ---: | ---: | ---: |
| MS01 | 26.0 | 26.0 | 26.0 |
| MS02, korrigiert | 23.0 | 23.1 | 23.1 |
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

Das Netto-Leaderboard wird aus den neuen Ergebnissen veröffentlicht; Front berücksichtigt jetzt MS02 mit24 statt der alten Siegerbasis. Ein alter S05-Close-Retry liefert die supersedierende Revision2 und kann nichts zurückschreiben. Alte V2- und andere Korrekturen werden während des Locks gesperrt; veränderte Bestätigung7→4 bei Vorschau7→3 wird ebenfalls abgewiesen. Eine frische Worker-Vorschau stimmt mit dem laufenden Callable-Plan überein. Maschinenbeleg: `.local-runtime/s07-proof.json` mit `sourceCards=432`, `unchangedRawCards=431`, `realWorkerExit=73`, `publicationRevision=1`, `roundRevisions=[2,2,2]`, `fourthNormalStart=23.1`, `newV2Card=true`, `releaseGo=false`.

Der erste explorative Emulatorlauf erreichte Batchfehler, Worker-Recovery, atomare Korrektur und den vierten Rundenstart. Seine letzte Zusatzprüfung meldete jedoch einen fehlenden Published-Stempel an der neuen V2-Karte. Dieser Zwischenlauf ist **keine vollständige Abnahme**. Stempelweitergabe und ein gezielter Neukartentest wurden ergänzt/geprüft; der vollständige Stand wurde anschließend mit neu gestarteten Functions erneut geprüft. Eine mögliche alte Worker-Abhängigkeit im ersten Lauf ist eine ungeprüfte Ursachenannahme, kein als bestätigt ausgegebener Befund.

Der abschließende neu gestartete Gesamtlauf ist erfolgreich und bestätigt ausdrücklich auch den zuvor fehlenden Neukartenstempel. Die obige Fehlerspur bleibt zur Nachvollziehbarkeit erhalten; die lokale Freigabe stützt sich auf den erfolgreichen Gesamtlauf und die aktuellen349 Node-Tests.

### Worktree-Integrität

Alle elf älteren isolierten Worktrees sind weiterhin getrackt sauber und auf ihren bisherigen HEADs, insbesondere S05 `2c32064`, S06 `295d13b`, S02/S03 `437c76d`, S04 `3d77af8` und S01 `f862cf0`. Hotfix bleibt `55c0db4` mit ausschließlich seiner vorherigen ungetrackten `fiveserver.config.js`. Der ursprüngliche Entwicklungsbranch bleibt `feature/score-autosync` auf `cb4661f` mit denselben sechs bereits anfangs gemeldeten Dirty-Dateien und bisherigen ungetrackten Pfaden; hinzu kam nur das neue Worktree-Verzeichnis. Alle Dateiänderungen dieses Auftrags liegen im neuen Worktree, kein Stash/Reset/Clean/Checkout in alten Worktrees.

Der Integritätsnachweis vergleicht HEADs/Git-Status und die dokumentierten Schreibziele. Eine durchgehend dauerhaft gespeicherte Bytehash-Baseline des ursprünglichen Dirty-Diffs vom allerersten Auftragsbeginn liegt nicht vor; daraus wird keine stärkere Byte-für-Byte-Aussage abgeleitet. Ein abschließender SHA-256-Stand der sechs Dirty-Dateien liegt ausschließlich lokal unter `.local-runtime/original-root-hashes-final-check.json`.

Reproduktion ausschließlich im neuen Worktree mit Node22/Java21 und `npm ci` in Root/Functions:

```powershell
# Rote Baseline auf Tests-zuerst-Commit6fc1363:
node --test functions/test/history-s07.test.js
# Vollständige Node-Suite:
$env:SCORE_SYNC_EMULATOR_TEST='0'
node --test tests/preprod-gates.test.cjs tests/preprod-hosting.test.cjs tests/local-environment.test.cjs functions/test/score-read-v2.test.js functions/test/score-operations-v2.test.js tests/score-screen.test.cjs tests/v1-s01-snapshot.test.cjs tests/v1-s01-bridge.test.cjs functions/test/pin-s04.test.js tests/pin-s04-client.test.cjs tests/score-auto-sync.test.cjs functions/test/score-writer-safety.test.js tests/hcp-s06.test.cjs functions/test/round-start-s06.test.js functions/test/round-close-s05.test.js tests/round-close-s05-client.test.cjs functions/test/history-s07.test.js
node tests/run-score-sync-browser.cjs
node tests/run-score-screen-browser.cjs
$env:LIE_AUTH_PORT='9499'; $env:LIE_FIRESTORE_PORT='8488'
$env:LIE_FUNCTIONS_PORT='5401'; $env:LIE_APP_PORT='5802'
npm run test:integration
```

Loopback-/Browserprüfungen liefen mit erforderlicher Freigabe außerhalb der Sandbox, weiterhin unter unveränderten Demo-/Credential-/Netz-/CSP-/Cloud-Gates. Projekt ausschließlich `demo-lie-scorecards-local`, leere Credential-Homes, synthetische Konten. Laufartefakte `.local-runtime/s07-*.txt` und `s07-proof.json` sind ignoriert und nicht im PR; keine PINs/Hashes/Tokens als Testdiagnostik. Die Worker-Crashoption existiert ausschließlich im Testprogramm, nicht als Produktions-API-Parameter.

## Erste noch offene S08-Entscheidung

**Als Nächstes S08.1: synthetische Kaltstart-/Restore-Abnahme in frischen Emulatoren und Browserprofilen.** Vor jeder realen Bestandsmigration muss ein vollständiger abgeschlossener und korrigierter Datensatz samt Auth-Claims, Score-Generation-/Birth-Bindings, Feldrevisionen, Score-/Closure-/Historyreceipts, Run-/Stagingdaten und Published-Control konsistent wiederherstellbar sein. Danach müssen Lesen, Receipt-Replay, normale nächste Runde und V2-CAS unverändert funktionieren.

Insbesondere ist **ungeprüft**, ob Export/Import die für Generation-Bindings benötigten Creation-Timestamps passend erhält. Falls nicht, braucht Restore einen separat versionierten und validierten Rebinding-Vertrag; keine automatische Lockerung der Generationchecks. Auch Gerätverlust/alte Offline-Queues und Prozessabbruch bei Backup/Restore müssen Teil dieser Abnahme sein.

Für reale ältere Daten ist zuerst eine gesondert autorisierte, nur lesende Inventur notwendig: Schema-/Snapshot-/Abschlussrevisionen, Chronologie, Teilnehmer/Flights, Rohwertvollständigkeit, Generationbelege, Spielerprojektionen und Lösch-/DNF-Zustände. Fehlende Belege bedeuten keine automatische Annahme von26 oder heutigen HCPs. Kein produktiver personenbezogener Export in diese Testumgebung; geschützte Produktionsbackups und deren Freigaben bleiben ein eigener Betriebsauftrag. Realmigration erst nach geprüftem Restore, dokumentiertem Mapping/Plan, unabhängiger Vergleichsrechnung und eigener Freigabe.

Die bounded S07-Demo allein ersetzt weder Zwölf-Geräte-Abnahme noch Betriebs-/Daten-/Restorefreigabe. Brutto-/Putts-/DNF-Fachentscheidungen bleiben offen. Keine Produktionsfreigabe und kein Deployauftrag.
