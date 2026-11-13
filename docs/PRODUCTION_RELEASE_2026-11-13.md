# Mission Samstag – Produktionskandidat vom 13.11.2026

**Entscheidung: NO-GO für den produktiven Versionswechsel.** Es liegt ein baubares, lokal geprüftes Produktionspaket vor, keine Freigabe zur Datenumstellung. Produktion wurde ausschließlich gelesen. Kein Deployment, Merge, Push, Export, Restore, PIN-/Claim-Wechsel oder Datenmigration.

## Tatsächlicher Bestand – bestätigt, keine Referenzannahme

Mit bestehendem Firebase-Zugang nur Projekt-/Hosting-Metadaten, Collection-IDs und serverseitige COUNT-Abfragen gelesen. Diese aufeinanderfolgenden Leseproben sind kein atomarer Saison-Snapshot oder Backup. Keine Benutzer-/Score-Dokumente exportiert und keine PINs, Hashes oder Tokens protokolliert. Mengenbeleg: [PRODUCTION_INVENTORY_2026-11-13.json](PRODUCTION_INVENTORY_2026-11-13.json).

| Gegenstand | Bestätigtes Ergebnis |
| --- | --- |
| Firebase | `liescorecard-70c5e`, ACTIVE; Web-App `1:163868016379:web:0b7f1aeb29d80f9ca37a5e` |
| Tatsächliche App | `https://app.lochihnein.de`, HTTP200, Server GitHub.com/GitHub Pages; öffentliche `config.js` bindet dasselbe Firebase-Projekt, Version `5.3.3-flight-preview` |
| Firebase Hosting | Site registriert, aber keine Releases; Standardadresse HTTP404. **Kein bestehendes Rollout-/Rollback-Ziel!** |
| Firestore | `(default)`, Native, `eur3`; PITR und Löschschutz deaktiviert |
| Spielerprofile | 15 private und 15 öffentliche Profile; 13 mit nicht leerem `pinHash`, 2 ohne |
| Saison | 42 Rundendokumente, 707 Scorecards, 70 Flights |
| Statuswerte | 17 Dokumente mit Status `Aktiv`, 25 mit `Beendet`; Löschflags/Teilnehmer-/Gerätezuordnung noch nicht einzeln geprüft |
| V2-Nachweise | 0 Runden mit numerischer `hcpSnapshotVersion:1`; 0 Karten mit Generation; 0 Generation-Bindings, Closure-Receipts, Published-Control oder `_roundClose.version:1` |
| Bestehende Functions | Vier Auth-Functions in `europe-west1`; keine V2-/Abschluss-Callables. Beobachteter Runtime-Account: `163868016379-compute@developer.gserviceaccount.com` |
| Backup-/DR-Ziele | Benutzer ausdrücklich: **„nicht vorhanden“**. Daher kein Export oder Restore begonnen. |

15 Profile sind nicht mit 15 nachgewiesenen Auth-Konten oder gleichzeitigen Schreibern gleichzusetzen. Nicht aus Aggregaten ableiten: PIN-Hash-Format jedes Kontos, persönliche HCP-Verläufe, gelöschte/aktuell gespielte Runden, offene Browser-Queues, bestehende Rules-/Functions-Quellarchive oder sonstige externe Sicherungen.

## Fünf entscheidende NO-GO-Gründe

1. **Nachgewiesene Vertragsinkompatibilität:** Alle42 Runden besitzen keinen erforderlichen V2-Start-Snapshot. Die unveränderte V2-Leselogik weist einen entsprechend aufgebauten Legacy-Aktivstand reproduzierbar zurück. Die Live-/Abschlussprüfung benötigt zusätzlich echte Generation-/Revisionsbelege; alle707 Karten haben keine Generation. Ein blindes Nachrüsten würde unbestätigte HCP-/Vorgabenannahmen in autoritative Daten umwandeln. Das wird nicht durchgeführt.
2. **Kein verifizierter vollständiger Rückfallpunkt:** Kein genehmigtes Sicherungsziel/DR-Ziel, kein heute erstelltes oder wiederhergestelltes Firestore-/Auth-/Rules-/Functions-/Frontend-Backup; PITR deaktiviert. Ein Codepaket ersetzt kein Saisonbackup.
3. **Laufender Bestand/Offline-Queues ungeklärt:** 17 Aktiv-Statuswerte und unbekannte persönliche Pending-Daten. Ein neuer Produktions-Namespace und/oder neue Rules dürfen diese nicht unsichtbar machen oder Altschreiber abrupt aussperren. Kein persönlicher Geräteabgleich oder Schreibruhefenster wurde bestätigt.
4. **Bestehende Anmeldung nicht vollständig freigabefähig:** Zwei private Profile ohne Hash. Der Produktionsadapter aktiviert keine bekannte Legacy-/Demo-Initial-PIN. Ein Login-Test über die echten Auth-Functions würde Claims/Anmeldezustände ändern und wurde deshalb nicht ausgeführt. PIN-/Claims-Reparaturen benötigen Freigabe.
5. **Keine atomar geprüfte Betriebsumschaltung:** Neue V2-Callables/Rules müssten die vier bisherigen Auth-Functions und Altclients koordiniert ergänzen/ersetzen. Der aktuelle Pages-Publish-Stand und ein vollständiges rückspielbares Originalartefakt sind nicht gesichert. Die unbenutzte Firebase-Hosting-Site als angeblichen Rückfall zu verwenden wäre falsch.

## Konkretes lokales Produktionspaket

Basis `3f51d11`, gleicher Worktree/Branch. Der abschließende Release-Commit wird im **ARTIFACT.json** als `sourceCommit` dokumentiert; `sourceDirty:false` muss für das finale Paket gelten.

```powershell
# Rein lokal; kein Firebase-/GitHub-Aufruf, keine Datenänderung:
node tools/production/build.cjs .local-runtime/production-release-20261113
node tools/preprod/check-artifact.cjs .local-runtime/production-release-20261113
```

Die Ausgabe ist ausdrücklich **production**, gebunden an das live bestätigte Projekt und `https://app.lochihnein.de`, mit dessen tatsächlichen öffentlichen SDK-Werten und beobachtetem Runtime-Account. Keine PreProd-Projekt-ID, keine MS-Testkonto-Allowlist, keine Seed-Daten und kein Emulatorprofil. Runtime-/Browser-Guards akzeptieren keine anderen Projekte oder gemischten Profile. Der lokale Checkout bleibt weiterhin Emulatorbetrieb; nur das gesonderte Paket lädt die Produktionsadapter.

`hosting/` enthält die unveränderte V2-Eingabe/-Synchronisation, Live-Matrix/Liste/Flights, Rundenschluss und HCP-Module; die Produktions-Bindings konfigurieren ausschließlich eigene Speicher-/Kontextnamen ohne Queue-Migration oder Löschung. `config.js` erhält eine commitbezogene Produktionsversion. `CNAME` erhält die bestehende Domain und `.nojekyll` erhält die SDK-/Vendor-Verzeichnisse auf Pages. Keine Domain-/DNS-Änderung. Historische Schreibkorrekturen und externe Temp-PIN-Zustellung bleiben gesperrt; bekannte Initial-/Demo-PINs werden nicht als Fallback benutzt. Der originale Handler wird für bestehende produktive IDs verwendet; keine Beschränkung auf synthetische Benutzer.

`functions/` enthält die bestehenden Fachmodule plus ausdrücklich produktiven Bootstrap. Discovery initialisiert keine Cloud-Credentials; erst der tatsächliche Cloud-Run-Request kann die projektgebundene Runtime-Identität verwenden. `firebase.json` enthält nur Functions und unveränderte Rules, **kein Hosting-Deployment-Ziel**. Frontend-Ziel ist der bestehende Pages-Host, dokumentiert in `HOSTING_TARGET.json`.

**Dateibelege:** `ARTIFACT.json` listet alle81 Release-Dateien mit SHA256 einzeln auf; der Checker verifiziert jeden Hash und weist zusätzliche/manipulierte Dateien zurück. Der Manifest-Digest deckt diese Dateiliste ab; ein zusätzliches ZIP-Checksum schützt die lokale Transportdatei. `cloudExecutionAuthorized:false`, `dataMigrationAuthorized:false` und `releaseDecision:NO-GO` sind keine versteckten Schalter zur automatischen Bereitstellung.

## Ausschließlich releasekritische Nachweise

| Prüfung | Ergebnis dieses Auftrags |
| --- | --- |
| Bestehende Anmeldung | Projekt-/Bestandsmetadaten gelesen; echte Anmeldung wegen Schreibwirkung nicht ausgeführt. Zwei Profile ohne Hash sind ein konkreter Freigabepunkt. |
| Historische Runden/HCP | 42/707 tatsächlich gezählt; V1-Shape wird vom unveränderten V2-Vertrag abgewiesen. Keine geratene HCP-Kette und keine erfundenen Snapshots. |
| Neue Runde/V2-Eingabe | Bestehender positiver synthetischer UI-Nachweis aus `76df958` wiederverwendet; gleiche geschützte Quellmodule. Legacy-Neustartblockade durch vorhandene Kompatibilitätstests bestätigt. Keine produktive Runde angelegt. |
| Sync/Live | Positiver Drei-Schreiber-/108-Karten-/Offline-/Auto-Live-Nachweis aus `76df958` wiederverwendet; Quellen bytegleich. Produktions-Bindung und Paketkopien zusätzlich gezielt geprüft. |
| Abschluss/HCP | Bestehender synthetischer S05/S06/UI-Nachweis wiederverwendet; keine Fachmoduländerung. Produktiver Bestand erfüllt die Start-/Generation-Verträge nicht. |
| Restore/Rückfall | Lokaler synthetischer S08-Nachweis vorhanden; **kein produktiver Restore-Nachweis** und keine Zielressourcen. Kein GO daraus abgeleitet. |

Neu **20/20** gezielte Produktions-/Paket-/Kompatibilitäts-/Adaptertests sowie **13/13** lokale Start-/Guardtests grün. Keine allgemeine Testkampagne. Die bereits vorhandenen58 Adapter-/Authprüfungen und der Drei-Schreiber-UI-Lauf werden nicht als live getestete Produktionsfreigabe ausgegeben.

## Backup und Wiederherstellung – konkrete Sperre, keine Ausführung

Vollständiger Ablauf: [FIREBASE_BACKUP_ROLLBACK.md](FIREBASE_BACKUP_ROLLBACK.md). Die dort zuvor offene Quell-ID ist durch die heutige Inventur bestätigt: `liescorecard-70c5e`, Datenbank `(default)`. **Keine Zielressource ist genehmigt/vorhanden.** Projekt-/Bucket-/IAM-Anlage ist eine eigenständig freizugebende Cloud-Änderung.

Nach Ziel- und Exportfreigabe: alle genutzten Browser/Offline-Geräte persönlich abgleichen, Pending0 und Schreibruhe einschließlich GAS-/Altclients bestätigen. Gesamte Firestore-Datenbank einschließlich Untercollections, Auth-Konten mit nötiger Hashkonfiguration, tatsächlich veröffentlichte Rules/Functions, Hosting-Quellartefakt und zugehörige Konfiguration im gleichen Ruhefenster sichern. PIN-/Privatdaten ausschließlich in einem zugriffsgeschützten echten DR-Ziel; niemals Repository, Demo oder gewöhnlicher synthetischer PreProd-Bestand.

```powershell
# Nur nach separater Freigabe und mit konkreten existierenden Zielen:
gcloud firestore export 'gs://<GENEHMIGTER_BUCKET>/<NEUER_PREFIX>/firestore' --project=liescorecard-70c5e --database='(default)'
firebase auth:export '<GESCHUETZTES_DR_VERZEICHNIS>/auth-users.json' --format=JSON --project=liescorecard-70c5e
# Vollständigen Export-Operationsnamen auf erfolgreichen Abschluss prüfen.
# Restore AUSSCHLIESSLICH in das gesondert genehmigte private DR-Projekt:
gcloud firestore import '<VOM_ERFOLGREICHEN_EXPORT_ZURUECKGEGEBENE_GS_OUTPUT_URI>' --project='<GENEHMIGTES_DR_PROJEKT>' --database='(default)'
```

Kein gestarteter Export als fertige Sicherung zählen. Objekt-/Metadatenbestand, GCS-Prüfsummen, Mengen je Collection/Runde und ursprüngliche Rohscores/HCP-Projektionen prüfen; Auth/Claims und Rules getrennt prüfen. Erst nach tatsächlichem DR-Restore und Vergleich aller Spieler/Runden/Karten/HCPs einen verwendbaren Rückfallpunkt bestätigen. Ein normaler Managed-Export ist kein atomarer gemeinsamer App-/Auth-Snapshot; Schreibruhe bleibt erforderlich. [Firestore Export/Import](https://firebase.google.com/docs/firestore/manage-data/export-import).

Vor späteren V2-Writes müssen Firestore-Creation-Timestamps/Generation-Bindings und Receipts auch im **tatsächlichen DR-Weg** geprüft werden. Der lokale S08-Restore ist keine Garantie für Cloud-Import-Zeitstempel. Der heutige Originalbestand hat noch keine V2-Bindings, darf aber deshalb nicht automatisch umgeschrieben werden. Keine produktive Migration wurde implementiert oder freigegeben.

## Bereitstellung und Rückfall – gesperrte Reihenfolge

Erst nach Aufhebung aller fünf NO-GO-Gründe und ausdrücklicher Freigabe für den konkreten Commit/Digest:

1. Geprüfte Sicherung und DR-Restore, Geräteabgleich und Schreibruhe; separat freigegebene **bestandserhaltende** Initialisierung/Korrektur durchführen. Keine Scorecard oder HCP-Projektion löschen; ungeklärte Rundentypen nur nach Vorschau/Bestätigung reparieren.
2. Dedizierten freigegebenen Bereitsteller wählen. Runtime-Rechte des beobachteten Accounts einschließlich Token-Signierung prüfen, nicht automatisch erweitern. Das genehmigte Backend-/Rules-Paket lokal mit Lockfile-Abhängigkeiten vorbereiten.

```powershell
# NICHT ausführen: NO-GO besteht. Nur eine explizit genehmigte Identität benutzen.
$release = (Resolve-Path '.local-runtime/production-release-20261113').Path
$cli = (Resolve-Path 'node_modules/firebase-tools/lib/bin/firebase.js').Path
$deployer = '<EXPLIZIT_FREIGEGEBENES_KONTO>'
npm --prefix "$release/functions" ci --ignore-scripts --no-audit --no-fund
node $cli deploy --account $deployer --project liescorecard-70c5e --config "$release/firebase.json" --only firestore:rules
node $cli deploy --account $deployer --project liescorecard-70c5e --config "$release/firebase.json" --only functions
```

3. Nur den **geprüften Inhalt von `hosting/`** mit erhaltenem CNAME/`.nojekyll` über den tatsächlich konfigurierten bestehenden GitHub-Pages-Publish-Weg veröffentlichen. Dessen Source-Branch/Workflow zuerst lesend bestätigen; hier wurde keine Pages-Einstellung geändert und kein neuer Workflow erfunden. Kein `firebase deploy --only hosting`, keine DNS-Umschaltung, kein automatischer Push/Merge.
4. Bestehende Nutzer und historischen Bestand sowie einen gesondert genehmigten neuen Runden-/Score-/Abschlusslauf abnehmen. Ohne diese Schreibfreigabe keinen produktiven „Smoke-Test“ durchführen.

Rückfall **vor neuen V2-Writes**: freigegebenes vollständiges Original-Web-/Functions-/Rules-Paket zurückspielen. Rückfall **nach V2-Writes**: zuerst Schreibstopp und neue Daten/Receipts/Pending sichern und abgleichen. Keine alte unversionierte UI/Schreiber einfach wieder einschalten. Entweder repariertes Release vorwärts oder vollständigen zusammengehörigen geprüften DR-Stand nach separater Freigabe wiederherstellen, ohne neue Scores zu verlieren. Firebase-Hosting-Rollback hilft der bisherigen Pages-App nicht.

## Kleinste sichere, heute nutzbare Alternative

Die bestätigte **Bestands-App `https://app.lochihnein.de` / `5.3.3-flight-preview` unverändert weiterbetreiben**. Keine Umstellung, keine neue Rules-/Backend-Version, keine Pending-Löschung, keine Wiederverwendung synthetischer Konten in Produktion. Dies ist ausdrücklich kein als zuverlässig abgenommener neuer V2-Produktivrelease und repariert keine bereits vorhandenen Saisonfehler; es vermeidet den heute nachgewiesenen inkompatiblen Cutover. Der neue V2-Kandidat liegt konkret als lokales Prüf-/Transportpaket vor. Ein fehlendes Backup-Ziel und notwendige reale Bestandsänderungen lassen sich nicht durch weitere synthetische Tests ersetzen.
