# Bestehende Firebase-Umgebung – Backup und Rückfall

Stand11.11.2026. **Konkrete Arbeitsanleitung zur späteren Freigabe, heute nicht ausgeführt.** Echtes Projekt, Datenbank, Hostinganbieter, Bucket, Auth-Konfiguration, Abrechnung und vorhandene Sicherungen sind ungeprüft. RC1 bleibt lokal. Öffentliche Herstellerdokumentation wurde gelesen; keine Projektkonsole, Cloudressource oder produktive App wurde aufgerufen.

## 1. Freigaben und Identität festhalten

Vier getrennte Vorgänge: **A** lesende Bestandsdiagnose; **B** Backup mit Produktivreads und Schreiben neuer Sicherungsobjekte; **C** Restore in ein geschütztes DR-Ziel; **D** Produktionsreparatur/Bereitstellung oder produktiver Rückfall. A erlaubt weder B noch C/D. Kein heutiger Abschnitt ist eine Ausführungsfreigabe.

Vor B ein Freigabeblatt ausfüllen:

| Pflichtangabe | Einzutragen / aktuell |
| --- | --- |
| Bestätigte Quell-Projekt-ID und Datenbank-ID | Offen; historischen Repository-Kandidaten `liescorecard-70c5e` nicht als bestätigtes Ziel übernehmen |
| Betreiber, Backup-Verantwortlicher, lesende/Export-Identität | Offen; minimale erforderliche Rechte, keine pauschale neue Owner-/Editor-Freigabe |
| Bestehender genehmigter Backup-Bucket und geschütztes Auth-/Artefaktverzeichnis | Offen; kein Repository, Demo-Emulator oder gewöhnliches PreProd-Ziel mit echten Personendaten |
| Backup-Lauf-ID, UTC-Zeiten, Schreibruhefenster, Aufbewahrung und Zugriff | Offen; neuer eindeutiger Prefix, vorhandene Sicherungen nicht überschreiben |
| Genehmigtes DR-Ziel und Freigabe zur Wiederherstellungsprüfung | Offen; keine Projekt-/Bucket-/IAM-Anlage aus dieser Anleitung ableiten |
| Tatsächlich ausgelieferte Web-/Functions-/Rules-Version und Rückfallversion | Offen; nicht mit RC1-Git-Stand gleichsetzen |

Alle unten gezeigten Befehle sind **nicht ausgeführte Vorlagen**. Platzhalter verhindern ein voreilig bestätigtes Ziel. Keine `.firebaserc`-Defaults verwenden, kein `firebase use`, kein `gcloud config set project`, keine Zugangsdaten im RC aktivieren. Fehlende Rechte, Abrechnung oder ein fehlendes DR-Ziel werden als Blockade gemeldet; nicht automatisch eingerichtet.

## 2. Vor Backup: gemeinsamen konsistenten Stand herstellen

1. Alle tatsächlich benutzten Browser-/Ersatzprofile erfassen, auch alte/offline Geräte. Drei vorgesehene Schreiber bedeuten nicht, dass keine vierte Queue existiert. Online abgleichen, Pending0, keine Konflikte und keine unklaren Requests bestätigen. Lokale Queues **nicht** löschen. Ist ein Gerät nicht erreichbar, keine vollständige Sicherung seiner noch nicht gesendeten Scores behaupten.
2. Für das genehmigte Sicherungsfenster keine Score-, Runden-, Admin-, PIN- oder Rollenänderungen. Auch Hintergrundjobs, alte GAS-/V1-Schreiber und andere Clients müssen nachweislich ruhen. Das Abschalten technischer Schreiber oder Ändern von Rules benötigt selbst die dafür passende Freigabe; hier wird nichts umgeschaltet.
3. Runde/Ergebnis/HCP-Projektionen und gegebenenfalls `historyPublication` müssen zusammenpassen. Kein offenes Abschlussfenster, unbekannter Request oder halb veröffentlichter Historienlauf als gesunder Stand deklarieren. Vorher/nachher Versionen und Mengen erfassen; Abweichung bedeutet Sicherung neu bewerten.

**Die gemeldete18-/9-Loch-Unstimmigkeit darf eine Originalsicherung nicht verhindern.** Auch ein fachlich fehlerhafter Altbestand wird zunächst vollständig und unverändert als forensischer Originalstand gesichert, mit dokumentiertem Fehlerstatus. Er ist damit nicht automatisch ein fachlich gesunder Betriebsstand. Keine Vorab-Reparatur, HCP-Anpassung oder Kartenlöschung, um ein Backup „konsistent aussehen“ zu lassen. Technisch vollständige Sicherung, bekannte fachliche Fehler und Freigabe als betrieblicher Rückfallpunkt getrennt bewerten.

Der normale Firestore-Export ist kein exakter Startzeit-Snapshot. Deshalb hier Schreibruhe; bereits vorhandenes PITR kann alternativ einen geeigneten Snapshot liefern, ersetzt aber keinen gemeinsamen Auth-/Artefaktabgleich. Managed Export benötigt aktivierte Abrechnung und passende Bucketrechte. **Nichts davon wurde am echten Projekt geprüft oder eingeschaltet.** [Firestore Export/Import](https://firebase.google.com/docs/firestore/manage-data/export-import).

## 3. Firestore vollständig sichern – erst nach B

Keine Beschränkung auf die verdächtige Runde oder eine kurze Collection-Liste: gesamte genehmigte Datenbank einschließlich vorhandener Untercollections exportieren. So bleiben auch unbekannte historische Zusatzdaten erhalten. Relevante Mengen separat verzeichnen: Spieltage, Karten pro Runde/Spieler, Ergebnisse/`scores`, Flights, private/öffentliche Spieler/HCPs, Kurs/Bahnen/Vorgaben, Konfiguration sowie vorhandene V2-/Closure-/History-Belege. Legacy ohne solche Belege nicht künstlich nachrüsten.

```powershell
# B: NUR NACH GENEHMIGUNG; nicht im RC ausführen.
gcloud firestore export "gs://<GENEHMIGTER_BESTEHENDER_BUCKET>/<EINDEUTIGE_LAUF_ID>/firestore" --project="<BESTAETIGTE_QUELL_PROJEKT_ID>" --database="<BESTAETIGTE_DATENBANK_ID>"

# Den vollständigen zurückgegebenen Operationsnamen verwenden und Erfolg prüfen.
gcloud firestore operations describe "<VOLLSTAENDIGER_EXPORT_OPERATIONSNAME>" --project="<BESTAETIGTE_QUELL_PROJEKT_ID>"
```

Nicht allein einen gestarteten Job als fertiges Backup ablegen. Erfolgreiches Ende, Export-Prefix/Metadatendatei, Zeiten, Objektbestand, Generationen/Prüfsummen und Fehlerfreiheit im Laufmanifest erfassen. Exportdateien nicht umbenennen oder bearbeiten. Ein abgebrochener/teilweiser Export ist kein verwendbarer Wiederherstellungsbeleg. Ganze-Datenbank- und gezielte Rundenrettung sind unterschiedliche Aufgaben.

Terminalschluss beendet einen gestarteten Export/Import nicht. Bestehenden Operationsnamen nachverfolgen statt blind neu zu starten. Einen abgebrochenen Import als möglichen Teilstand behandeln und nicht freigeben. [Operationsverhalten](https://firebase.google.com/docs/firestore/manage-data/export-import#manage_export_and_import_operations).

## 4. Auth, App und Konfiguration ergänzen – erst nach B

Firestore enthält nicht die Auth-Konten oder die ausgelieferte Anwendung. Im selben ruhigen Fenster:

```powershell
# B: Enthält sensible Kontodaten; nur im genehmigten geschützten DR-Bereich.
firebase auth:export "<GESCHUETZTES_DR_VERZEICHNIS>/auth-users.json" --format=JSON --project="<BESTAETIGTE_QUELL_PROJEKT_ID>"
```

UIDs/Provider und gegebenenfalls Passwort-Hashparameter sichern und auf Vollständigkeit prüfen. Der CLI-Export deckt nicht jede frühere Passwort-Hashvariante ab; fehlende Hashfelder nicht als vollständigen Credential-Restore ausgeben. Auth-Hashparameter sind sensibel. Die App-PIN-Hashes in Firestore sind ein **anderer Vertrag**, kein Ersatz für Firebase-Auth-Hashparameter. [Auth-Export/-Import](https://firebase.google.com/docs/cli/auth).

Zusätzlich Auth-Kontostatus und Custom Claims im geschützten Inventar nachweisen; UID-Zuordnung, Rollen, deaktivierte Konten und PIN-/Claims-Pendingzustände müssen zum Firestore-Bestand passen. Falls dafür ein Admin-SDK-Leseexport verwendet wird, vollständig paginieren und nicht auf STDOUT/ins Repository protokollieren. Fehlende Passwort-Hashberechtigungen nicht durch einen neuen gemeinsamen PIN umgehen. [Admin-Kontenauflistung und Hashberechtigungen](https://firebase.google.com/docs/auth/admin/manage-users#list_all_users).

Weiterhin sichern: tatsächlich bereitgestellte Webdateien einschließlich Bilder/Vendor/Umgebung und Artefakt-Prüfsummen; Functions-Quell-/Build-/Runtime-Version, relevante Konfiguration und Secret-**Versionsreferenzen**; Firestore-Rules und Indexdefinitionen; Auth-Provider/Domain-Einstellungen und verwendete Asset-/Storageobjekte mit nachvollziehbarer Version. Secrets gesondert schützen, keine Klartextkopie in Git. Hostinganbieter und alte Release-ID müssen real festgestellt werden – eine vorhandene Firebase-Projekt-ID beweist kein bisheriges Firebase Hosting.

## 5. Sicherung als zusammengehöriges Paket akzeptieren

Ein geschütztes Manifest bindet Lauf-ID/Quellidentität, ruhiges Zeitfenster, Firestore-Operation/Prefix, Auth-Export und Claimsinventar, Rules/Indexes, exakte Artefakt-/Konfigurationsversionen und Prüfsummen. Belege nicht nur neben die Sicherung schreiben und dieselbe veränderliche Ablage für die einzige Integritätskopie halten; Referenzmanifest beim freigegebenen Verantwortlichen sichern.

Vor einer Reparatur bestätigen: Originalrunde, **alle** Karten/IDs/Rohwerte und dokumentierten HCP-Verläufe im Paket vorhanden; Auth und private/öffentliche Projektionen konsistent; Zugriffe/Aufbewahrung geregelt. Originalfassungen nicht durch eine vorgeschlagene9-Loch-Version ersetzen. S08.1-Synthetik ist weder dieses Backup noch ein freigegebener Produktionsimporter.

## 6. Einmalige gezielte Wiederherstellungsprüfung – erst nach C

Im **genehmigten geschützten DR-Ziel**, nicht im synthetischen RC/PreProd: Paket wiederherstellen und die konkrete Saison/Runde gezielt vergleichen. Keine neue allgemeine Kampagne. Ein geeignetes Ziel muss bereitstehen und leer bzw. eindeutig freigegeben sein; hier wird keins angelegt.

```powershell
# C: Nur das bestätigte DR-Ziel, nie versehentlich das Quellprojekt.
gcloud firestore import "gs://<GENEHMIGTER_BACKUP_BUCKET>/<LAUF_ID>/firestore" --project="<GENEHMIGTES_DR_PROJEKT>" --database="<GENEHMIGTE_DR_DATENBANK>"
```

Herstellergrenzen: Import überschreibt gleiche Dokument-IDs, entfernt aber andere Dokumente nicht. Indexdefinitionen sind nicht Teil des Exports. Functions-Trigger laufen dabei nicht automatisch, Snapshotlistener können dagegen reagieren. Ein Import in den bereits weiterbeschriebenen Altbestand ist deshalb kein sauberer Rückfall. [Firestore Importverhalten](https://firebase.google.com/docs/firestore/manage-data/export-import#import_data).

Auth separat mit Original-UIDs und dem passenden Hash-/Claims-/Statusvertrag wiederherstellen; keine automatische Neuanmeldung oder neue Spieler-ID anlegen. Auth-Import und tatsächliche Hashparameter vor Ausführung gesondert fachlich prüfen. Danach exakt die passende App-/Functions-/Rules-/Konfigurationsfassung verwenden; im DR-Ziel externe Zustellung und produktive Trigger nicht unbeabsichtigt aktivieren.

Gezielte Abnahme: vollständige Originalrunden/Karten/Ergebnisse/HCPs und IDs/Rohfeld-Prüfsummen identisch; verdächtige Runde vorhanden; Auth/Claims passend. Für vorhandene V2-Daten zusätzlich tatsächliche `createTime`, Generation-/Birth-Binding, Feldrevisionen, Receipts und Published-Control prüfen. Keine konservierten Birth-Zeiten oder Cloud-Wiederholbarkeit aus dem lokalen S08.1-Test ableiten. Bei Abweichung kein Einsatz mit alten Pending-Requests und keine Bezeichnung als verifizierter Rückfallpunkt.

## 7. Rückfallentscheidung – nur nach separater D-Freigabe

| Situation | Vorgehen |
| --- | --- |
| Nur Vorschau/Diagnose, nichts gespeichert oder bereitgestellt | Kein Datenrestore nötig. Vorschau verwerfen/schließen; Original bleibt maßgeblich. |
| Ausschließlich Webversion geändert, keine neuen Daten-/Auth-/Regel-/Backendänderungen | Nur nach nachgewiesener Kompatibilität altes exaktes Webartefakt bereitstellen. Bei tatsächlichem Firebase Hosting: passende vorhandene Live-Version in der Release History auswählen und „Roll back“; kein Datenrollback daraus ableiten. |
| Neue V2-Scores, HCPs, Claims, Reparatur oder Schemaänderung vorhanden | Zuerst Schreibstopp. Neuesten Stand einschließlich aller seit dem Sicherungspunkt bestätigten Scoreereignisse/Receipts und noch lokaler Queues sichern und abgleichen. Bevorzugt vorwärts korrigieren. Ein alter Vollrestore darf diese Ereignisse nicht verlieren. Kein bloßes Anschalten alter V1-/Admin-Schreiber. |
| Backup/Version/Delta oder Auth-/Generation-Vertrag nicht eindeutig | Schreibgesperrt bleiben, Daten und Profile erhalten; kein blindes Importieren, Löschen oder Zurücksetzen. |

Firebase-Hosting-Rollback erzeugt eine neue Freigabe mit einer früheren Webversion; es ist kein Daten-, Functions- oder Auth-Restore. Frühere Inhalte müssen noch verfügbar sein. Ob die bestehende App überhaupt so gehostet wird, ist unbekannt. [Hosting-Rückfall](https://firebase.google.com/docs/hosting/manage-hosting-resources#rollback).

Nach einem nötigen Datenrückfall nur den vollständig konsistenten, genehmigten Daten-/Auth-/Regel-/Artefaktstand freigeben; zusätzlich neuere Spielereignisse nachvollziehbar erhalten. Geräte erst nach bestätigtem Serverstand wieder verbinden. Alte Pending-Profile sichern/quarantinieren, nicht automatisch löschen oder auf neue Generationen/Umgebungen umbiegen. Die Wiederaufnahme und der Umgang mit einzelnen ungesendeten Schlägen benötigen eine ausdrückliche fachliche Entscheidung.

## Heute tatsächlich erledigt / offen

Erledigt: Ablauf, Befehlsvorlagen, Paketumfang und Abnahmekriterien anhand Repository und öffentlicher Herstellerdokumentation vorbereitet. **Nicht erledigt:** produktive Inventur, Export, Auth-Lesezugriff, Restore, Ressourcenerstellung, Schreibstoppaktivierung, Datensatzreparatur, Deployment oder Merge. Die Felder oben bleiben offen, bis der konkrete Vorgang separat genehmigt und belegt ist.
