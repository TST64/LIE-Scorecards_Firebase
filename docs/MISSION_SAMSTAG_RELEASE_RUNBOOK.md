# Mission Samstag – Release- und Betriebsablauf (Entwurf)

Stand: 10.11.2026, Europe/Berlin. Issue #26. **Nur ein schriftlicher Entwurf, keine Betriebsfreigabe.** Aktueller PROD-Datenbestand, tatsächlich ausgelieferter Code, Cloud-Konfiguration und Wiederherstellbarkeit sind unbekannt. In S08.2 werden diese Systeme auch nicht lesend abgefragt. Keine der folgenden späteren Maßnahmen ist durch diesen Bericht zur Ausführung autorisiert.

## Freigabe bleibt getrennt

- Lokale synthetische Integration: tatsächliche Ergebnisse und offene Blocker stehen im [S08.2-Abnahmebericht](MISSION_SAMSTAG_S08_2_ACCEPTANCE_REPORT.md).
- S08.3: wirkliche Android-/iOS-Geräte, Browserhintergrund, Sperrbildschirm, Funkwechsel, Akku-/Speicherdruck und Wiederanlauf mit den zwölf vorgesehenen Teilnehmern gesondert abnehmen. Lokale Touch-/Viewportsimulation ersetzt das nicht.
- Gesamt-Release: **NO-GO**, bis zusätzlich Bestandsinventur, Auth-/Migrationskonzept, Cloud-Backup/Restore, PreProd, Cutover/Rollback und ausdrückliche Veröffentlichung genehmigt und nachgewiesen sind. Keine automatische Freigabe aus einer Testsuite, einem Merge oder einer Checkbox.

## Vor einem Samstag

1. Einen Betriebsverantwortlichen und drei Flightverantwortliche benennen. Alle tatsächlich verwendeten Geräte einschließlich Ersatzgerät oder zweitem Browser pro Person erfassen. Diese Liste wird lokal abgestimmt; keine PINs oder Tokens darin ablegen.
2. Die freigegebene Anwendungsversion und deren eindeutig richtige Umgebung prüfen. Spätere PreProd-Umgebung: eigenes Firebase-Projekt, eigene Auth-/Firestore-/Functions-Daten und Firebase Hosting mit eigener Standard-Subdomain `PROJECT_ID.web.app`. Keine gemeinsam genutzte Produktionskonfiguration und kein unbemerkter GAS-Fallback. Projekt-ID, Cloud-Ressourcen und Deployment werden in diesem Auftrag nicht angelegt oder verändert.
3. Kurs, Bahnen, SI, Tee und ausdrückliche Rundenart 9-Front/9-Back/18 prüfen. Für alle zwölf müssen serverseitige Rundenstart-Snapshots und Vorgaben vorliegen; HCP0 ist ein gültiger Wert. Keine geratenen Vorgaben oder Ersatzwerte eingeben, um einen Abschluss zu erzwingen.
4. Gruppenregel bleibt die bestätigte S06-Regel: Saisonstart26, Soll18/36 Netto bei9/18 Loch, Verbesserung−0,5 und Verschlechterung+0,1 je Punkt, eine Nachkommastelle, Grenze0–54. Brutto-/Putts-Wertung, DNF, Nichtantritt und unvollständige Runden sind nicht abschließend entschieden. Die getestete technische Strich-/Clear-Funktion ist keine zusätzliche fachliche Abnahme dieser offenen Regeln.
5. Jeder meldet sich mit seiner eigenen Identität an. Pflicht-PIN-Wechsel vollständig durchführen; bei Claims-/DB-Split oder Sperre nicht über andere Konten umgehen. E-Mail-/GAS-Zustellung ist in der lokalen Umgebung deaktiviert.
6. Auf jedem Gerät eine synthetische Eingabe, deren dauerhafte lokale Annahme und echte Serverbestätigung demonstrieren. Offline-Eingabe und Wiederverbindung gemeinsam üben. Bei Speicherfehler darf eine abgewiesene Eingabe nicht als gespeichert gelten.

## Status und normale Eingabe

„Lokal angenommen/pending/offline“ bedeutet noch keinen Servercommit. Erst ein passender bestätigter Request/Receipt und der autoritative Serverstand belegen die Speicherung. „Konflikt/Fehler/unklar“ braucht einen Abgleich. Ein grüner Stand für einen alten Wert bestätigt keine später abgewiesene Eingabe.

Vor Geräte-/Accountwechsel und vor Verlassen des Browsers ausstehende Eingaben prüfen. Mit Pending-Daten niemals Browserdaten löschen, das Profil zurücksetzen oder neu installieren. Der Server kann Eingaben eines vollständig verlorenen lokalen Speichers nicht rekonstruieren. Noch unbestätigte Schläge müssen dann ausdrücklich manuell abgeglichen werden; keine automatische ID-Adoption und kein Raten aus alten Screenshots.

## Störungen und Recovery

| Situation | Sichere Anweisung | Verbotene Abkürzung |
| --- | --- | --- |
| Offline oder Dienst nicht erreichbar | Gerät und Eigentümerkontext behalten, Pending sichtbar lassen, Wiederverbindung abwarten und danach autoritativ abgleichen | „Gespeichert“ behaupten oder neue IDs für denselben unklaren Request erzeugen |
| Antwort nach echtem Commit verloren | Ursprüngliche Request-/Mutation-ID über den Receipt-Vertrag wiederholen | Zweite fachliche Buchung erzeugen |
| Konflikt desselben Feldes | Lokalen und aktuellen Serverwert vergleichen; nur ausdrücklich und mit passenden Erwartungen lokal verwerfen | Stilles Rebase, blindes „noch einmal +“, alte Admin-/V1-Schreiber |
| Falscher Owner, geänderter Flight oder neue Scoregeneration | Eingabe stoppen, ursprüngliche Queue unverändert sichern/quarantinieren, Spielleitung hinzuziehen; nur einen geprüften expliziten Recovery-Vertrag verwenden | Fremde Queue senden, alte IDs übernehmen, Generation-/CAS-Prüfungen abschalten |
| IndexedDB-/Quota-Fehler | Abgewiesene Eingabe sichtbar benennen, ungespeicherten Schlag gesondert festhalten, Speicherproblem beheben und Serverstand prüfen | Eine fehlgeschlagene Speicherung als leere oder bestätigte Queue behandeln |
| Browser-/Geräteabbruch | Dasselbe Profil nach Möglichkeit wieder öffnen; Eigentümer, ursprüngliche Mutation und Serverstand prüfen | Aus Profilverlust folgern, dass alles gesendet wurde |
| PIN-/Claims-Split oder Kontosperre | Normale S04-Fertigstellung bzw. ausdrücklich autorisierten Kontowiederherstellungsprozess nutzen | Gemeinsame PIN, Masterreset, private Firestore-/Auth-Direktkorrektur im laufenden Betrieb |

Wenn die Oberfläche einen Owner-/Flight-/Generations-Konflikt nicht sicher auflösen kann: **kein Flight-Commit und keine Samstagsfreigabe**. Das ist ein dokumentierter Recovery-Blocker, kein Anlass, Sicherheitsprüfungen zu lockern. Fehlende lokale Daten lassen sich nur aus vorhandener ursprünglicher Evidenz oder durch bewusste fachliche Neueingabe nach Serverabgleich ersetzen.

## Drei persönliche Flightfreigaben

1. Alle zwölf und alle zusätzlichen Schreibergeräte müssen ausdrücklich erreichbar sein. Je Gerät online, Pending0, keine Konflikte und keine unbekannten Requests prüfen. Auch ein altes Offline-Gerät desselben Kontos zählt.
2. Der Server kann vollständige Karten zeigen, obwohl ein vergessenes Offline-Gerät noch eine lokale Änderung hält. Der organisatorische Abgleich ist deshalb zwingend; „Server vollständig“ ersetzt ihn nicht.
3. Bei Zweifel kein Commit. Ein bereits geöffnetes Abschlussfenster abbrechen, die Geräte abgleichen, anschließend einen neuen geprüften Serverstand und ein neues Fenster verwenden.
4. Erst danach bestätigt jeder der drei berechtigten Flightverantwortlichen die tatsächliche Prüfung seines Flights über die normale Freigabe-Checkbox. Die lokale S08.2-Automation simuliert diesen menschlichen Ablauf; sie ist keine echte persönliche Unterschrift.
5. Abschluss mit der zugehörigen Closure-ID einmalig ausführen. Bei verlorenem ACK dieselbe ID prüfen/wiederholen, keinen zweiten fachlichen Abschluss erfinden. Alle zwölf End-HCPs und die veröffentlichte Revision prüfen.
6. Folgerunde erst aus der autoritativen veröffentlichten Vorgängerkette starten; die zwölf neuen Start-Snapshots unabhängig kontrollieren. Unvollständige oder fachlich ungeklärte Runden bleiben gesperrt.

## Historische Korrektur

Nur der gesonderte Admin-Dialog darf eine begrenzte, versionierte Korrektur vorbereiten. Exakte Änderung, vollständige Folgekette, HCP-Ergebnisse, Revisionen und Plan vor Bestätigung prüfen. Während privatem Staging bleibt ausschließlich die bisherige vollständige Saison veröffentlicht. Bei Batch-/Workerfehler mit derselben Run-ID fortsetzen oder begründet gesperrt bleiben; keine halbe Saison über alte Batchskripte schreiben.

Erst die atomare Veröffentlichung darf alle betroffenen Scores, Runden, privaten/öffentlichen HCPs, Receipts und Published-Control gemeinsam ändern. Anschließend autoritative Reads und HCP-Folgestarts prüfen. Die derzeitige Grenze von480 Nutzprojektionen plus Metadaten bleibt bestehen; größere oder unvollständige Ketten werden nicht gekürzt.

## Späterer Bestands- und Migrationsplan – gesondert zu autorisieren

1. **Nur nach neuer ausdrücklicher Genehmigung** einen exakt abgegrenzten read-only Auftrag für das tatsächliche PROD-Projekt formulieren. Vorher Eigentümer, Projekt-/Umgebungsidentität, zulässige Datenarten und Belegablage festlegen. Zunächst Schema, Zählungen, Referenzen, Revisionen, Legacy-Generationen, Auth-Verfahren, Claims, Rollen, Rules/Indexes und tatsächlich ausgelieferte Version inventarisieren. Unbekannte Bestände nicht aus den synthetischen Tests ableiten.
2. Keine produktiven personenbezogenen Daten in Testumgebungen kopieren. Neue synthetische Gegenbeispiele aus festgestellten Schemaproblemen konstruieren. Reale Datenexporte, Auth-Secrets und Migration brauchen jeweils eigene Autorisierung und ein überprüftes Verfahren.
3. Für Cloud-Backup/PITR und Auth-Restore tatsächliche Möglichkeiten, Rechte, Aufbewahrung, unabhängige Integritätsanker und Restore-Ziel vereinbaren. Vollständigen Wiederanlauf testen. S08.1 belegt nur einen lokalen logischen Restore; native Cloud-Creation-Time-/PITR-Semantik und produktiver Auth-Restore sind unbekannt.
4. Migration ausschließlich in eine ausdrücklich isolierte Zielumgebung planen. UID-/Claims-Zuordnung, Owner/Flight, komplette HCP-Folgekette, Generationen/Birth-Bindings, Request-/Mutation-/Closure-/History-Belege und Published-Pointer als zusammenhängenden Vertrag behandeln. Legacy nicht still adoptieren.
5. PreProd mit eigener Hosting-Standard-Subdomain und ausschließlich synthetischen Daten vollständig abnehmen. Danach einen kontrollierten Cutover mit Schreibstopp, festgehaltenem konsistentem Backup, genau freigegebenem Artefakt und überprüfbarer Rückfallentscheidung entwerfen. Bestehende Cloud-Ausführungssperren bis zur separaten Freigabe beibehalten.
6. Rollback muss eine vollständige zusammengehörige Saison samt Auth-/Revisions-/Generationsverträgen wiederherstellen können. Nur alten JavaScript-Code oder eine Teilmenge von HCP-Dokumenten zurückzuschreiben reicht nicht. Keine produktive Restore-/Rollbackoperation aus diesem Entwurf ausführen.

## Freigabeprotokoll

Datum/Version, Betriebsverantwortlicher, drei Flightverantwortliche, zwölf Geräte einschließlich Ersatzgeräte, offene Blocker, Backup-/Restore-Beleg und explizite Entscheidung festhalten. Ein lokaler Testsuite-Exit0 und eine vollständig grüne Zwölf-Profil-Matrix können lediglich eine **lokale Integrationsabnahme** tragen. Wirkliche Geräte, produktive Altbestände, Migration, Cloud-Betrieb und Veröffentlichung bleiben getrennte Entscheidungen. Bis deren nachgewiesener Genehmigung gilt insgesamt **NO-GO**.
