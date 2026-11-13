# Bestand retten: 18-Loch-Anlage, tatsächlich neun gespielt

11.11.2026. Ergänzung zum RC-Auftrag. **Nur Repository-Diagnose, synthetische Vorschau und Plan. Keine produktive Runde gelesen, keine Datenkorrektur oder Speicherung implementiert.** Ob die gemeldete Runde noch existiert, welche neun Löcher gespielt wurden und welche HCPs betroffen sind, ist ungeprüft.

## Bestätigte mögliche Ausblendungspfade

| Ansicht / Code | Tatsächlich vorhandenes Verhalten | Aussage für den gemeldeten Fall |
| --- | --- | --- |
| Persönliche Performance, `App_Logic_Performance.js` | Nur abgeschlossene, nicht gelöschte Teilnehmer-Runden ab Saisonstart. `requiredHoles` folgt9/18; bei `played < requiredHoles` erfolgt `return` vor Aufnahme in Runden-/HCP-Reihe. `played` zählt hier nur positive Schläge. | **Synthetisch reproduziert:** 18 konfiguriert + neun vorhandene positive Lochscores → Runde fehlt in dieser Reihe, Daten bleiben vorhanden. Strich ohne positive Schläge kann denselben Filter zusätzlich auslösen. |
| Spieltageliste, `Views_Spieltage.js` | Standardfilter ist **aktueller Monat**, daneben Saison/meine/alle. Fehlende ID, Löschflags und `Abgebrochen` werden ausgeschlossen. | Eine ältere Runde kann im Monatsfilter fehlen. **Die bloße 18-Loch-Konfiguration entfernt sie nicht aus „Alle Runden“.** Datum, Status, Teilnehmer-IDs und Flags separat prüfen. |
| Netto-/HCP-Ergebnisse, `Views_Leaderboard.js` | Ein neuer veröffentlichter V2-Abschluss wird angezeigt. Ohne diesen verlangt die Vorschau gültige autoritative Start-Snapshots; Fehler führen zu einer Sperrmeldung. | Legacy ohne S06-Metadaten kann trotz vorhandener Karten keine neue Ergebnisansicht erhalten. Sperre ist kein Löschbeweis. |
| Serverberechnung, `functions/hcp-rules.js` | 18 benötigt18 gültige Bahnen; Front verlangt1–9, Back10–18. Fehlende/duplizierte/außerhalb liegende Karten machen Ergebnisse unvollständig oder ungültig und blockieren die HCP-Folgekette. | Neun erfasste Löcher belegen **nicht automatisch** Front oder Back; die 18-Loch-Runde darf nicht mit geratenen fehlenden Scores vervollständigt werden. |
| Datenladen / Zuordnung | Published-Read, Auth/Claims, 3MiB-Grenze, Kurs-/Spieler-/Runden-ID-Zuordnung und alte `date`/`datum`-/Statusausprägungen können die Darstellung beeinflussen. | Vor einem Repair zuerst feststellen: Datensatz fehlt wirklich, wird gefiltert oder scheitert nur eine Berechnung? Kein Reset als Diagnose. |

Die erste erfolgreiche Reproduktion verwendet **den tatsächlichen Performance-Code aus PR#27**, nicht einen nachgebauten Filter: Die 18-Loch-Konfiguration ergibt0 angezeigte Runden, eine reine In-Memory-9-Front-Alternative1; sämtliche54 Beispielkarten bleiben erhalten. Das erklärt einen möglichen Mechanismus, bestätigt aber noch nicht die produktive Ursache.

## Bereits nutzbare rein lokale Vorschau

```powershell
npm run rc:round-preview
```

Schreibt ausschließlich den lokalen Bericht `.local-runtime/round-repair-preview.json`. Das Kommando verwendet **nur ein eingebautes synthetisches Beispiel**, akzeptiert keine Produktionsdatei und lädt kein Firebase SDK. Es gibt keinen `save`-/`apply`-Befehl und keinen Produktiv-Endpunkt. Die Funktion `preview()` berechnet auf einer Kopie und liefert immer `readOnly=true`, `automaticCorrection=false`, `persistAllowed=false`.

Beispiel: zwei synthetische Spieler, drei abgeschlossene Runden, die erste als18 angelegt, je neun Front-Karten. Rohfelder einschließlich Zusatzfelder bleiben exakt unverändert. Vorschau für SYN01 (SYN02 identisch):

| Runde | Fiktiv gespeichert Start → Ende | 9-Front-Alternative Start → Ende | Netto |
| --- | --- | --- | --- |
| SYN-R1 | 26 →26.1 | 26 →24.0 | 22 |
| SYN-R2 | 26.1 →26.2 | 24.0 →22.5 | 21 |
| SYN-R3 | 26.2 →26.3 | 22.5 →21.0 | 21 |

Die gespeicherten Beispielwerte sind bewusst Vergleichswerte, keine behauptete reale Historie. Bei der unveränderten18-Loch-Hypothese ist die erste Runde unvollständig und die danach neu berechnete Kette blockiert. Die Alternative zeigt daher **gespeicherte Werte und hypothetische Neuberechnung getrennt**, samt Gewinnern/Unvollständigkeit, nicht eine angeblich schon bestätigte Korrektur. Brutto-/Putts-Ranking wird nicht als freigegeben dargestellt.

Die 9-Back-Auswahl wird mit vorhandenen1–9-Karten **blockiert**. Kein automatisches Umnummerieren, Löschen oder Ausschließen dieser Karten. Ein eigener gezielter Test belegt, dass eine mit10–18 belegte Back-Konstellation berechnet werden kann. Das ist kein Beweis, dass die gemeldete Runde Back war.

Weitere Sperrgründe: fehlende oder doppelte Karten/IDs, fehlende positive Scores ohne bestätigten Strich, widersprüchliche Lochnummern, fehlende historische Bahnen-/Vorgabendaten oder Ausgangs-HCPs, ungeklärte Overrides, ungültiges Datum/Reihenfolge, nicht abgeschlossene Folgerunden. Keine HCP26-/Par4-Ersatzwerte zur Herstellung einer vermeintlich vollständigen Vorschau.

## Eng begrenzter Plan für die Admin-Repair-Funktion

1. **Diagnose lesen:** Nach gesonderter ausdrücklicher PROD-Lesefreigabe die konkrete Runden-ID, unveränderte Metadaten und alle Karten einschließlich leerer/außerhalb liegender Datensätze erfassen; pro Spieler Bahnen, Rohwerte, Duplikate und Zuordnung zeigen. Monat/Saison/Teilnehmer/Flags gegenprüfen. Historischen Kurs, SI/Vorgaben und damalige Ausgangs-HCPs belegen. Ohne diese Freigabe bleibt die Funktion bei Synthetik.
2. **Admin wählt ausdrücklich Front oder Back:** Kein Vorschlag allein aufgrund „neun Karten“, kein Speichern durch Öffnen der Vorschau. Sind Back-Bahnen früher1–9 nummeriert worden, braucht es eine belegte Zuordnung; das ist kein automatischer Nebeneffekt der Typkorrektur. Alle bisherigen Karten bleiben erhalten.
3. **Vorschau vor jeder Freigabe:** Bisherige gespeicherte Ergebnisse und HCPs neben neuen Netto-Ergebnissen, Start-/End-HCPs, Vorgaben und Gewinnern anzeigen, für die Zielrunde **und jede betroffene Folgerunde/Person**. Unbetroffene Historie bleibt unverändert. Die Ausgangsbasis unmittelbar vor dem betroffenen Verlauf muss verifiziert sein; keine pauschale neue S06-Berechnung einer unbekannten alten Saison. Fehlende oder widersprüchliche Daten ergeben einen konkret benannten Sperrgrund, keine automatische Korrektur. Zeitgleiche Runden benötigen eine belegte Reihenfolge.
4. **Speichern zunächst deaktiviert:** Die heutige Lieferung implementiert nur Offline-Diagnose/Vorschau. Ein späterer explizit freizugebender Serverfall `round-type-repair` muss eine echte Adminberechtigung, exakte Quellrevision/Hash, ausdrückliche Bestätigung der Vorschau, vollständiges Backup und schreibruhige Geräte prüfen. Vorhandene Pending-Queues werden weder gelöscht noch übernommen; offene aktive Folgerunden/unklare Requests blockieren.
5. **Vorhandenen S07-Vertrag gezielt erweitern:** Bestehendes S07 erlaubt Score-Feldkorrekturen, **keinen** bloßen Wechsel von `rundenTyp`/`bahnAnzahl`; Legacy ohne Closure-Vertrag wird absichtlich verweigert. Der neue Reparaturfall benötigt eigene Provenienz für Typ/Bahnenbereich, vollständige reproduzierbare HCP-Planung, CAS und denselben Receipt-/Published-Control-Vertrag. Keine Umgehung über V1, Direktbatch, manuelles Löschen oder gefälschte Receipts. Kein allgemeiner Historieneditor.
6. **Rohdaten erhalten, konsistent publizieren:** Alle Scorecard-IDs, Schlag-/Putts-/Lady-/Strichwerte, fehlenden Felder und Originaldokumentfassungen vorhalten. Keine Karte löschen, umnummerieren oder neu anlegen; Generationen bleiben erhalten. Falls abgeleitete HCP-/Vorgaben-/Snapshotmetadaten geändert werden müssen, vollständiges Vorher/Nachher versionieren, niemals Rohwerte still überschreiben. Betroffene Runden, Ergebnis-/HCP-Projektionen und Belege zunächst privat stagen, bei Fehler wiederaufnehmbar; nur einen vollständigen Stand atomar veröffentlichen. Reicht die bestehende Publikationsgrenze nicht, gesperrt bleiben statt Teilhistorie zu zeigen.
7. **Nachweis und Rückfall:** Vorher/Nachher-Kartenzahl, IDs und Rohfeld-Prüfsummen identisch; alle prognostizierten HCP-/Ergebnisänderungen exakt bestätigt; neue Geräte lesen dieselbe Publikationsrevision. Ursprünglichen Stand und Reparaturbeleg dauerhaft behalten. Bei Fehler alter konsistenter Stand maßgeblich, kein halber Verlauf. Umsetzung und produktives Schreiben erst nach separater Freigabe.

## Priorität im Release

Die Rettung der gespielten Saison geht vor neuen Runden. Der konkrete Fall wird in der ersten später genehmigten Bestandsdiagnose zuerst geprüft. Eine HCP-Übernahmebasis für neue Runden darf nicht ungeprüft auf der möglicherweise falschen18-Loch-Wertung beruhen. Bis zur verifizierten Entscheidung bleiben Originaldaten unangetastet und eine Vorschau als Vorschau gekennzeichnet. Keine Produktionsschreibzugriffe oder Deployments sind damit autorisiert.
