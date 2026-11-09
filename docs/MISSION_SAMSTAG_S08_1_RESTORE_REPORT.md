# Mission Samstag – S08.1 synthetischer Kaltstart und Restore

Stand: 09.11.2026. Auftrag [Issue #24](https://github.com/TST64/LIE-Scorecards_Firebase/issues/24), Basis [Draft-PR #23](https://github.com/TST64/LIE-Scorecards_Firebase/pull/23), exakt `9a29e2ea23d0f3306a96a5e352b11e30f0104352`. Neuer Worktree `.codex-s08-1-worktree`, Branch `codex/s08-1-synthetic-cold-restore`, PR-Ziel `codex/s07-revisioned-history-correction`. Tests zuerst: `d26550f`, 15 rote Regressionen vor der Implementierung. Keine bestehenden Worktrees bearbeitet.

**Release bleibt NO-GO.** Dieser Auftrag betrifft ausschließlich synthetische lokale Emulatoren für `demo-lie-scorecards-local`. Er autorisiert weder Cloud-Projektanlage, Cloud-/Produktions-/GAS-Zugriffe, echte Daten, Deployments noch Merge. S08.2 und eine gesonderte Betriebs-/Migrationsfreigabe bleiben erforderlich.

## Restore-Vertrag und Creation-Timestamps

`tools/local/restore-contract.cjs` definiert Schema 1 und typisierte Firestore-Werte (Timestamp mit Sekunden/Nanosekunden, Bytes, Referenzen ausschließlich im Demo-Projekt, GeoPoint und nichtendliche Zahlen). Die reservierte Typmarkierung wird bei normalen Quelldaten abgewiesen. Jeder Datensatz enthält Pfad, vollständige Daten sowie ursprüngliche Creation-/Update-Timestamps. Ein unabhängiger SHA-256-Anker bindet Payload und nach Collections sortiertes Inventar; ein Manifest bindet zusätzlich Inventar und Auth-Anzahl. Das ist Integrität gegen den festgehaltenen Anker, keine externe Signatur oder manipulationssichere Archivierung unter demselben Betriebssystemkonto.

Ein logischer SDK-Restore kann Firestore-`createTime` nicht frei setzen. Deshalb werden **keine konservierten Original-Birth-Timestamps behauptet**. Ein versionierter, ausschließlich an eine frische lokale Zielinstanz gebundener Restore legt jede bestehende Scorekarte **zusammen mit genau ihrem Generation-Binding in derselben Transaktion** neu an. Die neue Creation-Time beider Dokumente muss sekundengenau und nanosekundengenau übereinstimmen. Kartendaten, ursprüngliche Generation, Feldrevisionen und Mutations-IDs werden unverändert übernommen. Original- und Zielzeit stehen getrennt in privaten `restoreProvenance`-Belegen mit Backup-Anker und Zielinstanz-ID. Die vorhandenen V2-Generation-/Birth-Prüfungen bleiben wirksam; es gibt keinen Schalter zum Überspringen von Auth, CAS, Receipts, Rules, HCP oder Closure.

Import und Checkpoint stehen in derselben Transaktion (höchstens100 Nutzdokumente plus Checkpoint); Karte/Binding werden nie geteilt. Währenddessen verweigert `localMaintenance/current.state=restoring` sämtliche Callables. Erst nach vollständigem Payload-/Auth-/Birth-/Inventarvergleich öffnet eine finale Transaktion die Zielinstanz und schreibt Provenance sowie `phase=verified`. Wiederholung mit anderem Anker oder anderer Instanz wird verweigert. Eine bereits verifizierte Wiederholung liefert ihren Beleg, schreibt keine älteren Daten zurück und bleibt auch nach neuen Scores/Abschlüssen ein No-op.

Der Test startet den App-Server und Browser erst nach dieser Verifikation. Lokale Emulatorports sind keine OS-Netzwerksandbox; privilegierte direkte SDK-Zugriffe bleiben beim kontrollierten Testbesitzer. Ein partieller oder widersprüchlicher Auth-Bestand wird gesperrt und nicht automatisch überschrieben. Der geprüfte Importabbruch liegt in der Firestore-Phase vor dem Auth-Import; ein Crash mitten im Auth-Import wurde nicht zusätzlich injiziert.

Legacy-Generationen werden ausdrücklich abgewiesen. Unbekannte Collections, Subcollections, fremde Referenzen, unerwartete Zielbestände und unbekannte Importzustände werden nicht still ergänzt, gelöscht oder migriert. Ein erneuter Backup-Zyklus eines bereits restaurierten Katalogs mit zusätzlichen Restore-Metadaten braucht eine gesonderte Inventarerweiterung; der vorliegende Vertrag deckt den S01–S07-Quelldatensatz ab.

## Konsistenter Sicherungspunkt

Nur ein zu Beginn vollständig leerer Demo-Katalog kann ausdrücklich für die Sicherung bewaffnet werden. Callables und direkte S07-Worker protokollieren dann aktive Requests als private Leases. Die Sicherung schließt zuerst den Eintritt (`quiescing`), wartet auf alle Leases und prüft Gate und leere aktive Lease-Abfrage in einer Transaktion (`quiesced`). Normale transaktionale Schreiber prüfen zusätzlich dieselbe Barriere. Ein unbekannter oder abgestürzter aktiver Request wird **nicht aufgrund eines Zeitlimits freigegeben**: Die Sicherung verweigert sich nach Ablauf ihrer Wartefrist. Nur der Testbesitzer darf den tatsächlich beobachteten, mit Exit73 beendeten privaten S07-Stage-Worker anhand seiner PID ausdrücklich stilllegen. Andere Requests können auf diesem Weg nicht entsperrt werden.

Die App-Browser werden vor dem Sicherungsschnitt einschließlich Auth-Endpunkten vom Netz getrennt und für den endgültigen Closed-Schnitt vollständig beendet. Direkte Admin-SDK-Zugriffe gehören allein zum kontrollierten lokalen Testbesitzer; die Barriere ist kein Schutz gegen einen unbefugten OS-/Admin-Prozess. Unbewaffnete Kataloge behalten den bisherigen Requestablauf. Offene Rundenschlüsse werden nicht als verwendbares Saisonbackup versiegelt. Ein S07-Run darf als ausdrücklich separate Recovery-Fixture mit alter vollständig veröffentlichter Saison und validierten privaten Stages gesichert werden; eine Mischsaison wird nicht veröffentlicht.

## Inventar, Auth und Clientdaten

Inventarisiert werden tatsächlich vorhandene Root-Collections durch das SDK; Schema 1 erlaubt `spieler`, `spieler_public`, `spieltage`, `flights`, `scorecards`, `scoreSyncV2Generations`, `scoreSyncV2Mutations`, `scoreSyncV2Requests`, `roundClosureReceipts`, `historyCorrectionRuns`, `historyCorrectionStages`, `historyPublication`, `kurse`, `bahnen`, `handicaps`, `golfplaetze`, `kalender_termine`, `config`, `settings`, `scores`, `localMaintenance` und `localMaintenanceRequests`. Nicht vorhandene Collections werden nicht als gesicherte Daten ausgegeben. Kurs-/Bahndaten, eingebettete Vorgabetabellen und autoritative Rundenstart-Snapshots werden vollständig übernommen.

Die Firestore-PIN-Hashes und PIN-Sperr-/Pending-Felder gehören ausschließlich in das **ignorierte lokale synthetische Backup**, niemals in Proof-JSONs, Terminalausgaben, Bericht oder PR. Der reine Custom-Auth-Vertrag sichert UID, persistente Claims, Kontosperren und Auth-Metadaten. Passwort-/Provider-Konten werden abgewiesen; deren Secret-/Hash-Export und eine produktive Auth-Migration sind nicht belegt. Sitzungstokens und synthetische Signierschlüssel werden nicht gesichert. Neue lokale Signierschlüssel entstehen nur im Arbeitsspeicher. Claims müssen zur privaten Spielerrolle und zum PIN-Zustand passen; ein dokumentierter Pending-PIN-Split-State bleibt gesperrt und muss über den bestehenden S04-Vertrag abgeschlossen werden.

Alte V1-LocalStorage-Daten sowie V2-Pending-Operationen und originale Request-Snapshots liegen nur als private Quarantäne im lokalen Artefakt. Sie werden **nicht in neue IndexedDB-/Browserprofile importiert**. Ein identischer ursprünglicher Request wird für den Idempotenztest ausdrücklich erneut zugestellt; das ist keine automatische Queue-Übernahme. Neue Eingaben erhalten neue IDs und müssen die unveränderten Owner-/Flight-/Generation-/Feldrevision-Prüfungen bestehen.

## Prozess- und Datenpfadtrennung

`npm run test:restore` erzeugt eindeutige Sicherungs- und Prozesskataloge unter `.local-runtime/s08/`. Der Quellkatalog hat eigene Emulatorports, leere CLI-HOME-Verzeichnisse und frische Browserprofile; die Sicherungsdateien liegen außerhalb dieses Katalogs. Jeder Zielkatalog startet eigene Auth-/Firestore-/Functions-Prozesse, eigene Ports, eigene Instanz-ID und neue Browserprofile. Vor Import müssen Datenbank und Auth vollständig leer sein.

Die Firebase-CLI erhält keine vorhandene Anmeldung/ADC, Tokens oder Proxykonfiguration. Emulatoren werden ohne natives `--import`/`--export-on-exit` gestartet; die Daten leben ausschließlich im jeweiligen frischen Prozess. Nach Ende der Quell-CLI werden die alten Ports auf Verbindungsablehnung geprüft und der eigene Quellkatalog wird umbenannt. Der Zielprozess bekommt ausschließlich Backup-Pfad und festgehaltenen Anker, keinen Quelldatenpfad; es existiert kein Fallback im Restore-Code. Code und generierte CLI-Konfiguration liegen im neuen Worktree und dürfen geteilt werden. Die CLI verlangt den Projektroot für Functions/Rules; ein außerhalb liegender Konfigurationskatalog wurde explorativ abgewiesen. Das ist Prozess-/Pfadtrennung, **keine OS-Sandbox gegen einen bösartigen Prozess desselben Kontos**. Das gesicherte Quellenartefakt bleibt zum unabhängigen Vergleich lesbar.

## Tatsächliche Testergebnisse

### Bestätigte Quellenartefakte

Vollständiger Quellenlauf `run-1794248691894-a74a5ebf`: normale S05-Runden und S07-Korrektur bestanden, Sicherung während offenem Abschluss verweigert, Sicherung während eines tatsächlichen aktiven S07-Stage-Requests wartete auf dessen Ende. Beide Schnitte haben null aktive Leases. Quellbrowser und Emulatoren sind beendet; der eigene Prozesskatalog ist `source-retired`. Alle Auth-Daten stammen von zwölf synthetischen Custom-Auth-Nutzern.

| Collection | Closed + Corrected | Interrupted S07 |
| --- | ---: | ---: |
| bahnen | 18 | 18 |
| config | 1 | 1 |
| flights | 12 | 9 |
| historyCorrectionRuns | 1 | 1 |
| historyCorrectionStages | 459 | 400 |
| historyPublication | 1 | 1 |
| kurse | 1 | 1 |
| localMaintenance | 1 | 1 |
| localMaintenanceRequests | 455 | 424 |
| roundClosureReceipts | 4 | 4 |
| scoreSyncV2Generations | 433 | 432 |
| scoreSyncV2Mutations | 1328 | 1325 |
| scoreSyncV2Requests | 271 | 269 |
| scorecards | 433 | 432 |
| spieler | 12 | 12 |
| spieler_public | 12 | 12 |
| spieltage | 4 | 3 |
| Auth-Nutzer, außerhalb Firestore | 12 | 12 |

433 bedeutet432 geschlossene korrigierte Karten plus eine bestätigte Karte der vierten Runde. Vier Closure-Belege enthalten den ausdrücklich abgebrochenen ersten Abschlussversuch und drei veröffentlichte Abschlüsse. Der separate Auth-Zustandsfall ist eine lokal abgeleitete, neu versiegelte Variante des Closed-Artefakts mit identischen Collection-Anzahlen: MS12 Pending-PIN/Claims-Split, MS11 zeitweilige PIN-Sperre, MS10 deaktiviertes Auth-Konto. Er wird nicht als spielbereite Saison ausgegeben.

Festgehaltene SHA-256-Anker (keine PIN-/Auth-Hashes):

| Artefakt | SHA-256 |
| --- | --- |
| Closed + Corrected | `6616dd87c923e8fb2846d7f7e2ade1f5edae9afcbdb7d59e8dfacaf84004effd` |
| Interrupted S07 | `8f0bbea83689360c1aae61fb033ecdb0cb2c458ff54617fcc7ac784aa7b8c8bc` |
| Auth-Zustände | `e2524821e07c5527777b260fbe0bb07893af63589f7b2a6e5d9c37abb2049ec3` |

`anchors.json` und die jeweiligen `manifest.json` unter `.local-runtime/s08/backups/run-1794248691894-a74a5ebf/` enthalten zusätzlich jede Collection-Anzahl und deren eigene Prüfsumme. Kein Quellenartefakt wird bei Wiederholungen überschrieben. Originale Quelllaufdaten sind nicht Teil eines Zielkatalogs.

### Bestätigte Tests und Restore-Szenarien

**370/370 Node-Tests bestanden**, keine Skips: alle349 bisherigen Fälle plus17 Restore-/Codec-Fälle und4 Maintenance-Fälle. Die separate unveränderte Hotfix-Suite bestand mit30/30. Die bestehende Sync-/IndexedDB-Browserprüfung bestand mit27 PASS-Meldungen; Score-Screen jeweils75 Checks bei320/390/1024px. Die vollständige bestehende reale S01–S07-Gesamtintegration endete mit Exit0 einschließlich normaler432-Karten-Saison, S07-400+59-Fehler/Worker-Recovery, atomarer Korrektur und vierter V2-Runde.

| Kaltszenario | Tatsächlicher Nachweis | Stand |
| --- | --- | --- |
| Closed/Corrected | 433 vollständige Karten-/Binding-Paare;433 gegenüber der Quelle neue Creation-Timestamps; identische gespeicherte Generationen/Revisionen/Daten; zwölf Auth-UIDs/Claims; unabhängiger vollständiger SDK- und Published-Read-Vergleich | Bestanden, finaler Katalog `run-1794250868719-45e2f05f/closed` |
| Importabbruch | Echter separater Importworker endet mit Exit74 nach erstem atomarem100-Dokument-Commit; Checkpoint bleibt `importing`, Login-Callable gesperrt; frischer Worker nimmt ohne Löschen/Neuadoption sicher auf | Bestanden im Closed-Szenario |
| Beschädigte Sicherungen | Neun Varianten: Checksumme, Generation, referenziertes Mutation-Receipt, History-Stage, Claims, Rundenrevision, fehlender Snapshot, fehlende öffentliche Projektion, unvollständiger Export | Alle vor dem ersten Zielwrite verweigert; Ziel-Firestore/Auth bleiben leer |
| Queue-/Identitätsgrenzen | Frische IndexedDB ohne alte V1-LocalStorage-Bündel oder V2-Pending-Übernahme; autoritativer Wert statt zurückgehaltenem Offline-Klick; falsche Owner-/Flight-/Generation-Basis verweigert | Bestanden im Closed-Szenario |
| Idempotenz und Weiterbetrieb | Originaler UI-Wire-Request und S07-Mutation-Receipt erneut zugestellt, alte S05-Close-ID und veröffentlichte S07-Run-ID wiederholt; neue V2-Operation inklusive gleicher Request-ID wiederholt;108 normale UI-Karten in drei Flights, R4 abgeschlossen, R5 normal gestartet, MS02 Start23.1 | Bestanden im Closed-Szenario |
| Interrupted S07 | Separate432-Karten-Sicherung mit400 Stages und alter vollständiger Veröffentlichung restauriert; neuer OS-Worker vervollständigt59 Stages; normaler geprüfter Admin-Dialog veröffentlicht den vollständigen Plan; anschließend108 neue UI-Karten, R4-Abschluss und R5-Start23.1 | Bestanden, finaler Katalog `run-1794250868719-45e2f05f/interrupted`;432 gültige neue Birth-Paare |
| Auth-Zustände | Pending-PIN-Split verweigert normalen Read; sichere eigene PIN-Fertigstellung stellt DB-/Auth-Claims und autorisierten normalen Read konsistent her; PIN-Sperr-Timestamp und deaktiviertes Auth-Konto bleiben wirksam | Bestanden, finaler Katalog `run-1794250868719-45e2f05f/authstate`;433 gültige neue Birth-Paare |

Wiederholter Restore desselben bereits verifizierten Ankers wurde jeweils vor **und nach** den neuen Scores/Abschlüssen geprüft: gleicher Restore-Beleg, kein Zurückschreiben der alten Saison. Steuerung und Provenance bleiben auch für den angemeldeten App-Admin per Rules unlesbar. Alle normalen Browserrequests waren Loopback; die absichtliche GAS-URL-Negativkontrolle wurde mit tatsächlicher CSP-Verletzung vor Übertragung blockiert.

Der abschließende gemeinsame Ziel-Lauf **`run-1794250868719-45e2f05f` endete mit Exit0 für alle drei Szenarien**. Er verwendete ausschließlich die unveränderten oben verankerten Sicherungen aus `run-1794248691894-a74a5ebf`. Maschinenbeleg: `.local-runtime/s08-proof.json`, zusätzlich `closed-proof.json`, `interrupted-proof.json` und `authstate-proof.json` beim Backup. In allen drei Fällen: frisches Browserprofil, Source-Fallback unerreichbar, null verbotene normale Origins und `releaseGo=false`. Die Closed- und Interrupted-Abnahme gelang zusätzlich in vorherigen getrennten frischen Zielprozessen; diese werden vom abschließenden gemeinsamen Ergebnis unterschieden.

V1-Quarantäne ist ein bewusst erzeugtes altes LocalStorage-Bündel. Die dauerhaften S01-Journal-/ACK-Fälle werden zusätzlich unverändert in der bisherigen Gesamtintegration geprüft; ein solcher Puffer wird nicht als bestätigter Serverstand importiert. Exportabbruch wurde als unvollständige `.partial`-Datei simuliert; der Importabbruch verwendet einen tatsächlich beendeten OS-Worker. Diese Belege werden nicht gleichgesetzt.

### Aufgetretene Fehler und Grenzen der Nachweise

- Explorative CLI-Läufe scheiterten an Windows-Pfadbehandlung: absolute Functions-Pfade wurden falsch relativiert, Rules außerhalb des Projektroots wurden abgewiesen. Die generierte Konfiguration bleibt deshalb im neuen Worktree-Root; private Prozess-/Browserkataloge bleiben getrennt. Keine Cloud-Operation wurde daraus abgeleitet.
- Die Negativkontrolle deckte eine zu schwache Prüfung älterer historischer Closure-Revisionen auf. Diese werden jetzt zusätzlich gegen den veröffentlichten Run-Beleg geprüft. Das echte Artefakt und die manipulierte Variante wurden unabhängig erneut geprüft; ein zusätzlicher Node-Fall hält diese Grenze fest.
- Der neue Testtreiber stoppte anfangs vor einer unnötigen erneuten MS01-Anmeldung den Controller einer bereits offenen Ansicht. Die nachfolgenden Klicks wurden nicht akzeptiert. Der Treiber behält jetzt eine gültige bestehende Sitzung und prüft Owner, Runde, Loch und sichtbare Controls; kein Controller-/Auth-Schutz wurde abgeschaltet. Ein zunächst noch wartender eigener fehlgeschlagener Testprozess wurde nach PID-/Parent-/Worktree-Prüfung gezielt beendet; der Browserprüfstand hat danach begrenzte Beobachtungsfristen und beendet ausstehende CDP-Kommandos beim Browserende.
- Der frische Interrupted-Browser meldete zunächst `Internal error opening backing store for indexedDB.open`. Die Pending-Prüfung verweigerte korrekt die Veröffentlichung. Der Windows-Profilpfad ließ zu wenig Platz für Chromium-LevelDB-MANIFEST-Dateien. Kürzere frische Profilnamen plus explizite Pfadlängengrenze beseitigten den Fehler im wiederholten realen Szenario. Ein Speicherfehler wird weiterhin niemals als leere Queue behandelt.
- Ein sandboxierter Node-Vorlauf meldete `fetch failed` im lokalen Server-Test. Die erlaubte vollständige Wiederholung außerhalb der Netzwerksandbox bestand mit370/370; kein Test wurde übersprungen oder abgeschwächt. Die genaue interne Sandbox-Ursache wurde nicht separat bewiesen.
- Erhaltene Typdecoder für Bytes/Referenzen/GeoPoint/nichtendliche Zahlen sind implementiert, aber im realen S01–S07-Referenzbestand nicht mit eigenständigen Emulatorfixtures abgenommen. Normale Koordinaten-Maps und unzulässige/reservierte Objekte sind per Node-Test geprüft; der PIN-Sperr-Timestamp gehört zur gesonderten Auth-Fixture. Für weitere reale Datentypen/Collections ist eine spätere Inventar-/Testfreigabe erforderlich.

### Fachliches Vergleichsorakel

Alle zwölf starten die erste Saisonrunde mit26.0. Nach S07 gilt die folgende vollständige End-HCP-Kette; der jeweilige Folgestart übernimmt genau das vorherige Ende. Sie wird gegen die gesicherten Rohkarten und alle autoritativen HCP-/Closure-Projektionen geprüft. MS02 Front Loch6 wird7→3 korrigiert, Netto24/17/36, Start26/23/23.1, Ende23/23.1/23.1;431 andere ursprüngliche Rohkarten bleiben unverändert. Alle drei ursprünglichen Closure-Revisionen sind danach2, Published-Revision1. Die vorhandene vierte Runde hat bereits eine bestätigte normale V2-Karte; der zurückgehaltene zusätzliche Offline-Klick gehört ausschließlich zur Quarantäne.

| Spieler | Ende R9F | Ende R9B | Ende R18 |
| --- | ---: | ---: | ---: |
| MS01 | 26.0 | 26.0 | 26.0 |
| MS02 | 23.0 | 23.1 | 23.1 |
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

## Reproduktion

Voraussetzungen: Node22, Java21, installierter lokaler Chrome/Edge, `npm ci` im neuen Worktree und in `functions`. Firebase-Tools und Emulator-JAR kommen aus den bereits verwendeten Entwicklungswerkzeugen. Keine Cloud-Anmeldung vornehmen. Java21 über eine lokale `JAVA_HOME` setzen, anschließend:

```powershell
node --test tests/*.test.cjs functions/test/*.test.js
node tests/run-score-sync-browser.cjs
node tests/run-score-screen-browser.cjs
npm run test:integration
npm run test:restore
```

Integration und Restore nacheinander ausführen (lokaler Hub/Logging-Port). Alle dauerhaften Testdaten, Browserprofile, Backups, privaten Logs und Proofs bleiben unter ignorierten lokalen Laufverzeichnissen. Fehlgeschlagene Exporte werden nicht automatisch repariert oder überschrieben. Die öffentliche Dokumentation enthält ausschließlich synthetische Orakel, Zählungen und Prüfsummen, keine Credentials.

Für eine erneute Abnahme **derselben bereits vollständig versiegelten** synthetischen Artefakte kann `S08_REUSE_BACKUP_RUN` auf deren strikten lokalen Namen `run-<Millisekunden>-<acht Hexzeichen>` gesetzt werden. Dadurch werden ausschließlich neue Zielprozesse und Browserkataloge erstellt; die Source-Ports müssen weiterhin nachweislich mit `ECONNREFUSED` geschlossen sein. Ein fehlender Source-Abschlussbeleg oder ein ungültiges/fehlendes Artefakt beendet den Lauf. Ein gescheiterter Quellenlauf kann auf diesem Weg nicht als erfolgreicher Backup-Lauf ausgegeben werden. Ohne diese Variable baut der Test die komplette Quelle normal neu auf.

Tatsächlich bestandene Befehle: `node --test tests/*.test.cjs functions/test/*.test.js` (370/370), `node tests/run-score-sync-browser.cjs`, `node tests/run-score-screen-browser.cjs`, die unveränderte Hotfix-Suite `node --test tests/*.test.cjs` im Hotfix-Worktree (30/30), `npm run test:integration` (Exit0). Abschließender Restore-Befehl:

```powershell
$env:S08_REUSE_BACKUP_RUN='run-1794248691894-a74a5ebf'
npm run test:restore  # Exit0, alle drei frischen Zielkataloge
```

Ein vorheriger gezielter Recovery-Lauf mit zusätzlichem `S08_RESTORE_ONLY='interrupted'` bestand ebenfalls. Diese Option erfordert ausdrücklich eine vorhandene versiegelte Sicherung und meldet nur ein Einzelszenario; sie schreibt keinen vollständigen Gesamtbeleg. Für einen Gesamtlauf die Variable entfernen. Explorative `npm run test:restore`-Aufrufe vor den oben dokumentierten CLI-/Treiber-/IndexedDB-Korrekturen waren **nicht grün**; deren Exit1 wird nicht durch ein Quellen- oder Einzelszenario-PASS ersetzt. Die ursprünglichen Backups blieben unverändert.

## Bestehende Worktrees und Nachweisgrenzen

Originaler Entwicklungs-Worktree: weiterhin `feature/score-autosync`, HEAD `cb4661f`. Alle sechs vorhandenen geänderten Dateien stimmen mit den vor Beginn gesicherten SHA-256-Werten überein; vollständiger Git-Diff und unversioniertes Inventar sind identisch. Bestehende Review-Worktrees sind im Git-Status sauber und behalten ihre HEADs: Mission `3ac98f4`, Phase2A `06dbe61`, Phase2B `8668c9e`, Phase2C `c2be311`, S01 `f862cf0`, S02/S03 `437c76d`, S04 `3d77af8`, S05 `2c32064`, S06 `295d13b`, S07 `9a29e2e`, Sicherheitsanalyse `afadff8`, Projektstatus `5eba4e6`. Hotfix bleibt auf `55c0db4` mit ausschließlich seiner bereits vorhandenen unversionierten `fiveserver.config.js`.

Diese Prüfung belegt HEADs, Git-Status und zusätzlich die unveränderten ursprünglichen Dirty-Dateien; sie ist kein vollständiger Hashvergleich sämtlicher ignorierter Laufdateien. Tests, neue Profile, Sicherungen und generierte Konfiguration wurden ausschließlich im neuen Worktree angelegt. Keine Anwendung auf echte Personen-/Score-/HCP-Daten, keine Cloud-Migration, kein Deploy oder Merge.

## Offene Entscheidungen und S08.2

- Physische Zwölf-Spieler-Generalprobe: Geräte, Netzausfall, Reload, verlorene ACKs, Owner-Wechsel, sichtbare Konflikte und manuelle Recovery.
- Reale Altbestandsinventur und Migration erst mit späterer gesonderter Autorisierung; insbesondere Legacy-Generationen, Referenzen, Passwort-/Provider-Auth und fehlende Revisionen.
- Produktive Backup-/Rollbackstrategie, Zugriffsschutz, Offsite-Anker, Aufbewahrung, Auth-Restore, Firestore-PITR und tatsächliche Cloud-Betriebsabnahme sind **ungeprüft**. Lokaler logischer Restore belegt diese Fähigkeiten nicht.
- Brutto-/Putts-/DNF-Regeln gesondert entscheiden; keine stillen fachlichen Defaults ergänzen.
- Keine Freischaltung alter unversionierter V1-/Admin-/History-Schreibwege, keine Veröffentlichung halbfertiger Saisons. Gesamtrelease bleibt bis expliziter Abnahme NO-GO.
