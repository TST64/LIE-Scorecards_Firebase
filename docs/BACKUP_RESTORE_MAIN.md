# Konkreter Rückfallweg für main

Stand13.11.2026. Produktion: GitHub Pages `app.lochihnein.de`; Firebase `liescorecard-70c5e`, Datenbank `(default)`, historisch `eur3`. Tatsächliche Cloud-Konfiguration und Bereitstellungen vor Ausführung lesend bestätigen. Kein V2-Cutover, kein DNS-/Sites-Hostingwechsel.

## Bereits geprüft: lokaler Quellrückfall

Aus dem Repository, Python3 ohne Zusatzpakete:

```sh
python tools/release_recovery.py create --repo . --commit f4dcbecf9c4c95ca30135f3f2a1458def82ca757 --out ../main-recovery
python tools/release_recovery.py verify --package ../main-recovery --commit f4dcbecf9c4c95ca30135f3f2a1458def82ca757 --manifest-sha256 ANKER_AUS_CREATE
python tools/release_recovery.py restore --package ../main-recovery --commit f4dcbecf9c4c95ca30135f3f2a1458def82ca757 --manifest-sha256 ANKER_AUS_CREATE --out ../main-restored
```

Neue Zielverzeichnisse verwenden. Den ausgegebenen Manifestanker unabhängig vom Paket festhalten. Es werden ausschließlich versionierte Git-Dateien archiviert: keine unversionierten Credentials, lokalen Backups oder Browserprofile. Vor Nutzung für andere Commits deren versionierten Inhalt auf Geheimnisse prüfen. Ein Prüfsummenanker belegt Integrität relativ zum vertrauten Anker, keine digitale Signatur.

60 Dateien der bestätigten main-Basis wurden tatsächlich lokal wiederhergestellt und verglichen.32 öffentliche Webdateien sind bytegleich. Functions/Rules im ZIP sind Repositoryquellen, kein Beleg der Cloudbereitstellung. Externe CDN-Assets und Browser-SW-Caches sind nicht im ZIP; kein funktionsfähiger Offline-Kaltstart behauptet. Wiederhergestellte App nicht gegen Produktion starten: getLoginPlayers schreibt bereits beim Laden der Loginliste.

## Noch benötigte konkrete Angaben

| Angabe | Entscheidung/Voraussetzung |
| --- | --- |
| Backup-Ziel | Bestehender privater GCS-Bucket/Prefix mit zu eur3 passender Lage und restriktivem Zugriff; falls keiner existiert: Anlage/Abrechnung gesondert freigeben. |
| Auth-Sicherung | Privater geschützter Ablageort, kein Git/öffentlicher Download; Original-UIDs, Custom Claims, disabled-Status, Provider und gegebenenfalls Hashparameter. |
| Restore-Ziel | Leeres, separates geschütztes DR-Projekt mit ausdrücklich bestätigter Projekt-ID; niemals Quelle als Ziel. Keine echten Profile in öffentliche/synthetische Demo mischen. |
| Zugang | Betreiberbestätigte Identität mit auf Export/Backup/DR begrenzten Rechten. Zugangsdaten ausschließlich über sichere Umgebungsverwaltung. |
| Zeitfenster | Alle verwendeten Geräte online abgleichen, manuelles Sichern erfolgreich, keine unklaren Requests; danach keine Score-/PIN-/Admin-/GAS-Änderung. Bereits ungesendete RAM-Eingaben nicht durch Reload verlieren. |
| Aufbewahrung | Vorschlag: eine unveränderte Voränderungssicherung bis zur Abnahme der Reparatur plus Folgesicherung nach nächster verifizierter Runde. Regelmäßige Sicherung später nach tatsächlicher Größe/Kosten entscheiden. |

## Ein gemeinsamer Backup-Lauf – erst nach konkreter Freigabe

1. Lauf-ID und Schreibruhe dokumentieren. Bestehende fachlich fragliche Runden unverändert mitsichern; keine Vorabreparatur. Geräte/Pending und Originaldaten kontrollieren. Bei nicht erreichbarem Gerät dessen fehlende Eingaben ausdrücklich ausnehmen; keine Vollständigkeit behaupten.
2. Vollständige Firestore-Datenbank mit Untercollections exportieren, kein eingeschränkter Collectionfilter. Ein normaler Export ist kein exakter Snapshot des Startzeitpunkts. Billing/Blaze und Bucket-/Service-Agent-Berechtigungen müssen vorhanden sein; nichts automatisch aktivieren. Export liest pro Dokument und verursacht außerdem Speicher-/ggf. Restorekosten; erst Bestandsgröße und aktuelle Tarife bestimmen, keine pauschale Eurozusage.
3. Auth im gleichen Fenster getrennt sichern: CLI-Userexport plus vollständiges paginiertes Admin-Inventar für Original-UIDs/Claims/disabled/Provider. PIN-Hashes gehören zur Firestore-Sicherung und sind nicht Firebase-Passworthashes. Bei Passwort-Providern Hashvollständigkeit und benötigte Hashparameter prüfen; fehlende Berechtigung nicht durch PIN-Reset umgehen.
4. Tatsächlich deployte Functions-Versionen/Runtime/Konfigurations- und Secret-Versionsreferenzen, aktive Rules/Indexes, Auth-Provider/Domains und GAS-Deploymentreferenz dokumentieren. Backendstand nicht aus main ableiten. Webrelease mit Prüfsummen binden; erforderliche externe Ressourcen/Versionen für DR festhalten.
5. Erfolg der Operation bis zum terminalen Status prüfen. Gesamten Exportprefix samt Metadaten unverändert erhalten. Geschütztes Laufmanifest bindet Quellprojekt, Uhrzeiten, Operation, Objektprüfsummen, Auth/Claims und Artefakte. Mengen vorher/nachher und private/öffentliche HCP-Projektionen vergleichen; bei Änderung keinen gemeinsamen gesunden Rückfallpunkt behaupten.

Nicht ausgeführte Befehlsvorlagen, bewusst mit Platzhaltern:

```sh
gcloud firestore export gs://BACKUP_BUCKET/EINDEUTIGE_LAUF_ID/firestore --project=liescorecard-70c5e --database='(default)'
firebase auth:export GESCHUETZTER_PFAD/auth-users.json --format=JSON --project=liescorecard-70c5e
```

## Ein gezielter Restore im DR-Ziel

1. Quelle/Ziel explizit prüfen und Ziel als leer bestätigen. Quelle darf nie Importziel sein. DR-Webkonfiguration eindeutig auf DR ausrichten; GAS/E-Mail deaktivieren, produktive Clients fernhalten. Reale Daten nur unter geschütztem Zugriff.
2. Vollständigen Export ins genehmigte DR importieren; Indexdefinitionen separat herstellen. Import überschreibt gleiche IDs und entfernt fremde vorhandene Dokumente nicht; daher leeres Ziel. Auth mit Original-UIDs/Claims/Status und passenden Provider-/Hashparametern getrennt wiederherstellen. Keine neue Spieleridentität und keine gemeinsame Ersatz-PIN.
3. Passende Legacy-Functions/Rules/Appkonfiguration im DR bereitstellen; kein V2-Seed oder V2-Generationsnachrüsten. Erst nach gesonderter Freigabe für dieses konkrete Ziel, nicht mit Produktionsdefaults.
4. Gezielte Abnahme: alle Dokumentpfade/IDs und Rohfeldwerte einschließlich Firestore-Typen, Spielerprofile/Auth-UIDs/Claims/Status und beide HCP-Projektionen vergleichen. Native Systemzeiten und DR-Projektkonfiguration getrennt dokumentieren. Vorhandene Runden einschließlich9/18-Unklarheit bleiben unverändert. Ein kontrollierter DR-Login und je eine synthetische Testeingabe/Abschluss auf separater DR-Testrunde prüft die Bedienbarkeit ohne Originalrunden zu ändern. Externe Zustellung bleibt deaktiviert.
5. Nur vollständigen erfolgreichen Vergleich mit Manifest und Testergebnis als geprüften Datenrückfall akzeptieren. S08.1-Tests sind Referenz, kein Cloudnachweis. DR nicht öffentlich stellen.

```sh
# Erst mit bestätigter DR-ID und dem exakten zurückgegebenen Exportprefix:
gcloud firestore import gs://BACKUP_BUCKET/EINDEUTIGE_LAUF_ID/firestore --project=GENEHMIGTES_DR_PROJEKT --database='(default)'
```

## Produktiver Rückfall bleibt separate Entscheidung

Nur Frontend geändert und Datenvertrag unverändert: nach Freigabe das geprüfte Webartefakt über den bestehenden GitHub-Pages-Prozess ausliefern; kein Firebase-Hosting-Rollback. SW-Version/Cache und noch lokale Eingaben persönlich abgleichen, niemals Browserdaten pauschal löschen. Bei Daten-/Auth-/Rulesänderung erst neue seit Backup entstandene Ergebnisse sichern und vergleichen; bevorzugt vorwärts reparieren. Kein Vollrestore, der neuere Saisonergebnisse verliert.

## Quellen und heutige Grenzen

Am13.11.2026 anhand offizieller Dokumentation geprüft:

- https://firebase.google.com/docs/firestore/manage-data/export-import (Billing, Exportzeitpunkt, Import, Index- und Triggerverhalten)
- https://firebase.google.com/docs/cli/auth (Auth-Export/-Import, Hashvertrag)
- https://firebase.google.com/docs/auth/admin/manage-users (paginierte Userliste, Hashberechtigungen)

Kein Cloudbackup, Cloudrestore, produktiver Schreibstopp, Deployment oder Merge wurde ausgeführt. Der lokale Quellrestore ist belegt; der produktive Daten-/Auth-Rückfall ist vorbereitet und weiterhin offen.
