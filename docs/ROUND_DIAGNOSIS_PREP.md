# RC1 – verschwundene Runde: vorbereitete Lesediagnose

Stand11.11.2026, Basis RC1 `5174064`. **Vorbereitet, nicht produktiv ausgeführt.** Dieser Auftrag ergänzt ausschließlich Dokumentation und eine nicht ausführbare Abfrageliste. Anwendung, Guards, Vorschau und RC1 bleiben unverändert. Keine allgemeine Testkampagne.

## Ziel und Kenntnisstand

| Zu ermittelnder Wert | Tatsächlicher Stand |
| --- | --- |
| Runden-ID / Datum / Kurs | Nicht mitgeteilt; nicht aus „zuletzt verschwunden“ geraten |
| Betroffene Ansicht / letzter bekannter sichtbarer Stand | Nicht mitgeteilt |
| Verifiziertes Firebase-Projekt / Datenbank | Unbekannt. `liescorecard-70c5e` ist nur ein Kandidat aus historischem Repository-Code, keine bestätigte Projektidentität. RC1 selbst verwendet ausschließlich das lokale Demo-Projekt. |
| Rundentyp, Lochanzahl, Status, Löschflags | Nicht produktiv gelesen |
| Teilnehmer, Flights, Karten, tatsächliche Lochnummern | Nicht produktiv gelesen |
| Ursache der fehlenden Anzeige | Für den echten Fall ungeklärt; passende Codepfade sind unten bestätigt |
| Freigabe für produktive Reads / Backup / Reparatur | Keine |

Die Antwort auf die bisherige Rückfrage enthielt nur die Fragen erneut. Sie liefert weder eine Kennung noch eine Zugriffsfreigabe. Zur Eingrenzung reichen Runden-ID **oder** ungefähres Datum und Kurs sowie die fehlende Ansicht. Falls das nicht mehr bekannt ist, kann nach separater Freigabe zunächst eine schmale Kandidatenliste erstellt werden; keine automatische Auswahl der vermeintlich neuesten Runde.

## Lesediagnose nach späterer ausdrücklicher Freigabe

Vor der ersten Abfrage müssen konkretes Projekt, Datenbank, lesende Identität, Abfrageumfang und geschützte Berichtablage vereinbart sein. Die maschinenlesbare Abfrageliste [ROUND_DIAGNOSIS_READ_PLAN.json](ROUND_DIAGNOSIS_READ_PLAN.json) ist ein Plan, **kein Collector und kein ausführbarer Cloudzugriff**.

| Phase | Exakte Leseaufgabe | Ergebnis / Abbruchkriterium |
| --- | --- | --- |
| D0 – Identifizieren | Bei bekannter ID `spieltage/<ID>` direkt lesen. Sonst freigegebene Kandidatenliste aller infrage kommenden `spieltage`: Dokument-ID, gespeichertes `id`, `date`/`datum`, Kurs-ID, Typ, Lochanzahl, Status, Flags und Teilnehmer. Keine Monats-/Saison-/„meine“-Filter und keine voreilige Sortier-/Limit-Auswahl des Zieles. | Eindeutige ID durch Eigentümer bestätigen. Mehrdeutige Kandidaten bleiben offen. Nicht automatisch den letzten Zeitstempel wählen. |
| D1 – Original erfassen | Runde mit allen Originalfeldern, Datentypen, Dokumentpfad, `createTime` und `updateTime`; `config/saison` und relevante Published-/Closure-Metadaten lesen. | `18` als String und18 als Zahl unterscheiden; widersprüchliche Typ-/Lochfelder und versteckte Lösch-/Abbruchflags melden. Kein Normalisierungswrite. |
| D2 – Alle Karten | `scorecards` nach dem **bestätigten** gespeicherten `spieltagId` lesen. Keine Lochbereichs- oder Scorewertfilter. Dokument-ID und Daten-`id`, Runde, Spieler, rohe Lochnummer, alle Score-/HCP-/Vorgaben-/Syncfelder und unbekannte Zusatzfelder erhalten. | Auch leere Karten,0,False, Strich, Duplikate und Bahnen außerhalb1–9/10–18 erfassen. Keine Karte löschen, zusammenfassen oder umnummerieren. Bei ausbleibendem Treffer Typ/ID-Abweichungen als offenen Befund melden; breitere Suche nur nach zusätzlicher Umfangsfreigabe. |
| D3 – Zuordnen | `flights` derselben Runde, die referenzierten `spieler_public`-Datensätze, Kurs-/Bahnen-/Vorgabedaten und vorhandene historische Snapshots lesen. | CSV-Teilnehmer, Flightmitglieder und tatsächlich in Karten vorkommende Spieler getrennt darstellen. Unbekannte Spieler-/Kursreferenzen benennen. Private PIN-/Mail-/Auth-Daten sind für diese erste Rundendiagnose nicht nötig. |
| D4 – Auswirkungen | Nur soweit ausdrücklich umfasst: relevante frühere HCP-Basis und verbundene Folgerunden samt Karten/Start-/End-HCPs und Resultaten lesen. | Zusammengehörigen Stand durch gleiche Read-Time oder vorher/nachher passende Versionen belegen; bei Änderungen/unklarer Reihenfolge neu freigeben bzw. abbrechen. Ohne historische SI-/Vorgaben-/HCP-Basis keine definitive Neuberechnung. |

**Keine App-Anmeldung als „nur lesend“ ausgeben:** PIN-Verifikation kann Auth/Claims ändern. RC1-Callables sind zudem über `localMaintenance.withRequest` gewrappt; bei aktivierter lokaler Wartungsbarriere entstehen Request-Leases. Deshalb keine App-/Callable-Aufrufe als unbesehen schreibfreie Produktionsdiagnose verwenden. Geplant sind direkte lesende Firestore-Operationen mit einer auf Reads beschränkten Berechtigung; keine `.set`, `.update`, `.delete`, Batchwrites, PIN-Wechsel oder Auto-Reparatur. Produktive Zugangsdaten werden heute weder gesucht noch geladen.

## Form des Diagnoseberichts

Der echte Bericht wird erst nach genehmigten Reads gefüllt und bleibt im geschützten Betriebsbereich, nicht im Git-Repository oder Demo-Projekt:

- **Runde:** Dokumentpfad/ID, Rohdatum/Kurs, Typ und Lochanzahl mit Datentyp, Status und alle Löschflags, vorhandene Snapshot-/Closure-Versionen.
- **Teilnehmer:** deklarierte CSV, Flights und Karten-Spieler als drei Mengen; Abweichungen sichtbar.
- **Pro Spieler:** Kartenanzahl, unterschiedliche Lochnummern, Front-/Back-/sonstige Bahnen, positive Schläge, bestätigte Striche, leere/ungültige Werte und Duplikate **getrennt**. „Neun Datensätze“ ist nicht automatisch „neun vollständig gespielte Löcher“.
- **Originalschutz:** geschützte vollständige Rohkopie aller gelesenen Karten mit Pfaden/Zeiten und SHA-256-Prüfsummen. Im freigebbaren Kurzbericht nur benötigte IDs/Zähler, keine PINs, Hash-Secrets oder Auth-Tokens.
- **Anzeigeursache:** gespeicherter Datensatz fehlt / Filter schließt aus / Zuordnung scheitert / Berechnung oder Veröffentlichung gesperrt – mit Beleg statt Vermutung.
- **Vorschau:** gespeicherte Ergebnisse/HCPs, hypothetische Front- und Back-Auswirkung, alle betroffenen Folgerunden, offene Fakten und Sperrgründe. Unbekannt bleibt unbekannt.

## Bereits bestätigte Codepfade, keine produktive Fallfeststellung

1. `App_Logic_Performance.js:256`: neun positive Lochscores bei18 konfigurierten Löchern werden vor Aufnahme der Runde in Runden-/HCP-Reihe übersprungen. RC1 hat diesen Pfad mit dem tatsächlichen Code reproduziert. Striche ohne positive Schläge zählen dort ebenfalls nicht als `played`.
2. `Views_Spieltage.js:11`: Standardansicht ist aktueller Monat. „Alle Runden“ hat keinen bloßen18-/9-Loch-Ausschluss, entfernt jedoch fehlende IDs, Löschflags und `Abgebrochen`. Datums-, Saison- und Teilnehmerfilter separat prüfen.
3. `Views_Leaderboard.js`: Legacy-Runden ohne gültige autoritative Start-Snapshots können eine Sperrmeldung statt neuer Netto-/HCP-Ergebnisse zeigen. Keine Löschung daraus ableiten.
4. `functions/hcp-rules.js`: fehlende18-Loch-Karten machen diese Rechnung unvollständig; die Folgekette kann dadurch blockieren. Front/Back-Auswahl ist eine fachliche Feststellung, keine Kartenanzahl-Heuristik.

## Gezielte 9-Loch-Reparatur – Vorschau, nicht Anwenden

Die vorhandene RC1-Funktion `tools/local/round-repair-preview.cjs` bleibt unverändert. `node tools/local/round-repair-preview.cjs` verarbeitet weiterhin nur das eingebaute synthetische Beispiel; **keine Produktionsdatei und keine Firebase-Verbindung**. Sie ist die Rechenvorlage, kein schon freigegebener Produktions-Collector oder Admin-Speicherdialog.

- Nur bei belegter falscher18-Loch-Anlage wählt der Admin ausdrücklich9-Front oder9-Back. `rundenTyp` und `bahnAnzahl` werden gemeinsam **nur in der Vorschaukopie** geändert.
- Vorhandene1–9-Karten werden nicht automatisch10–18 zugeordnet. Karten außerhalb des gewählten Bereichs werden vollständig ausgewiesen und blockieren eine ungeklärte Korrektur.
- Ausgangs-HCP, damaliger Kurs/SI/Vorgaben, Teilnehmer, Overrides und zeitliche Reihenfolge müssen belegt sein. Fehlende oder widersprüchliche Daten verhindern eine vollständige Vorschau; keine erfundenen Defaults.
- Gespeicherte Werte und Neuberechnung stehen nebeneinander: Netto/Ergebnis, Gewinner, HCP Start/Ende und Folgewirkung je Runde/Spieler. Unbetroffene Historie wird nicht pauschal neu gerechnet. Die konkrete Produktionskette ist noch nicht gelesen oder berechnet.
- `readOnly=true`, `saveImplemented=false`, `persistAllowed=false`. Kein Scorecard-Delete/Recreate, keine neue Generation, keine Pending-Löschung.
- Späteres Speichern benötigt eine **weitere** Schreibfreigabe, unveränderliche Originalfassungen, Backup, Quell-CAS, schreibruhige Geräte und vollständige atomare Publikation nach dem in [ROUND_TYPE_REPAIR.md](ROUND_TYPE_REPAIR.md) beschriebenen begrenzten Repair-Vertrag. S07-Score-Feldkorrektur ist kein bereits vorhandener Rundentyp-Repair.

## Was vor dem nächsten produktiven Schritt fehlt

Eindeutiges Ziel bzw. freigegebene Kandidatensuche, bestätigtes Projekt/Datenbank, geschützte Ablage und eine gesonderte ausdrückliche **Lesefreigabe**. Diese würde weder Backupjobs/Storagewrites noch Datenkorrekturen, Projektanlage, Deployments, IAM-Änderungen oder Merges erlauben. Backup und Rückfall werden im [konkreten Ablauf](FIREBASE_BACKUP_ROLLBACK.md) vorbereitet, nicht ausgeführt.

## Tatsächlicher Vorbereitungscheck dieses Auftrags

Nur das vorhandene `node tools/local/round-repair-preview.cjs` wurde einmal mit seinem eingebauten Beispiel ausgeführt. Ergebnis:54 unveränderte Rohkarten über drei synthetische Runden; sechs Spieler/Runden-Vorschauzeilen; Front-Kandidat berechenbar, Back-Kandidat mit vorhandenen Frontkarten gesperrt. Beide bleiben `persistAllowed=false`. Das Beispiel enthält zwei synthetische Teilnehmer; es wird nicht als Diagnose der echten Runde ausgegeben. Abfragelisten-JSON ist syntaktisch geprüft und weiterhin nicht freigegeben. Keine SDK-/Emulator-/Browser-Testkampagne, keine neuen Funktionen und keine Produktionsabfragen.

Abschlussvergleich: originale sechs Dirty-Dateihashes, vollständiger Diff und unversioniertes Inventar sowie HEAD/Status aller bisherigen Worktrees unverändert, einschließlich RC1. Lokaler Beleg `.local-runtime/integrity.txt`; kein vollständiger Hashnachweis ignorierter Laufdateien. Alle Ergänzungen liegen ausschließlich im neuen Dokumentations-Worktree `.codex-rc-diagnosis-worktree` auf `codex/rc1-round-diagnosis`.
