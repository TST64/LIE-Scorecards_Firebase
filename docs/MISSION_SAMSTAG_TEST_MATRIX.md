# Mission Samstag — Zwölf-Spieler-Testmatrix

**S08.1, 09.11.2026 / Issue #24:** Eigenständiger synthetischer Backup-/Kaltstart-Vertrag mit frischen Auth-/Firestore-/Functions-Prozessen und Browserprofilen. Birth-Rebinding erhält Generationen/Revisionen und legt Karte/Binding atomar mit gleicher neuer Creation-Time an. Closed/Corrected-Datensatz, unterbrochene S07-Korrektur, Auth-Split-/Sperrzustände, Importabbruch und beschädigte Artefakte werden getrennt geprüft. [Tatsächlich bestandene Ergebnisse, Inventar, Anker und verbleibende Grenzen](MISSION_SAMSTAG_S08_1_RESTORE_REPORT.md). S08.2, reale Altbestände, Cloud-Restore, Geräteabnahme und Release bleiben NO-GO.

**S07-Demo-Nachweis, 09.11.2026 / Issue #22:** Nach der vollständigen normalen S05-Kette wurde MS02/Front/Loch6 von7 auf3 revisionsgebunden korrigiert. Bestätigt: Netto24/17/36, HCP23.0/23.1/23.1, unveränderte übrige431 Rohkarten, privates400+59-Staging mit absichtlichem Batchfehler, echter Worker-Abbruch/Recovery und eine atomare Veröffentlichung. Vierte normale Runde und neue V2-Karte übernehmen23.1 samt Published-Stempel. Alte Writer bleiben gesperrt; Release/S08/Restore und reale Bestandsmigration bleiben NO-GO. [Vertrag, Testbefehle und S07-Ergebnisse](MISSION_SAMSTAG_S07_HISTORY_CORRECTION_REPORT.md).

**S05-Demo-Nachweis, 09.11.2026 / Issue #20:** Front108 → atomarer Abschluss → Back108 → atomarer Abschluss → 18-Loch216 → atomarer Abschluss wurden mit zwölf synthetischen Spielern, drei Flights, normalen UI-Eingaben und unabhängigen Emulatorreads ausgeführt. HCP-Werte unten stimmen mit allen drei veröffentlichten Ergebnissen und den beiden Folgerundenstarts überein. Persönliche Flightfreigaben bilden die ausdrücklich begrenzte Gerätebarriere; historische Schreibkorrekturen, physische Geräte-/Recovery-/Backup-Abnahme und Release bleiben NO-GO. [S05-Vertrag und Testergebnisse](MISSION_SAMSTAG_S05_ROUND_CLOSE_REPORT.md).

**S06-Korrektur, 09.11.2026 / Issue #18:** Die bisherige Ganzzahlrundung des Orakels war falsch. Die folgende Referenz verwendet eine Nachkommastelle; unabhängige Konstanten: `tests/fixtures/hcp-s06-golden.json`. Rechner und reine Korrekturplanung sind geprüft, ebenso drei separate normale Rundenanlagen mit je zwölf synthetischen Spielern und anschließender V2-Eingabe im Emulator. Die chronologische Generalprobe mit Rundenschluss und historischen Schreibkorrekturen bleibt gesperrt und wurde nicht ausgeführt. Details: [S06-Prüfbericht](MISSION_SAMSTAG_S06_HCP_REPORT.md). Die Angaben zum ursprünglichen S0-Auftrag unten beschreiben dessen damaligen Stand.

Stand 08.11.2026, Europe/Berlin. Issue #10. Bezug: [Release-Readiness und Reparaturpakete](MISSION_SAMSTAG_RELEASE_READINESS.md). **Testplan, nicht bereits absolvierte Zwölf-Spieler-Abnahme.** Basis `c2be311`; Dokumentationsbranch `codex/mission-samstag-audit`. In diesem Auftrag keine Anwendungs-/Testcodeänderung, keine Cloud-/GAS-/Produktionszugriffe, kein Deploy oder Merge.

## Sichere Durchführung und Ebenen

- **U:** reine Rechner-/VM-/Memory-Tests, keine SDK-/Netzinitialisierung.
- **B:** Browser mit temporärem Profil, echter IndexedDB, injiziertem Transport; keine Produktivkonfiguration.
- **E:** spätere vollständige Auth-/Firestore-/Functions-Demo-Emulatorintegration mit synthetischen Daten und bestandenem Bootstrap-/Netzwerk-Guard. Ein lokaler Server ist kein Beweis eines Emulatorziels.
- **G:** spätere manuelle Geräte-/Betriebsabnahme; Cloud-PreProd nur nach eigener ausdrücklicher Freigabe, getrenntes Projekt/Standardhost, keine Produktivdaten. Produktionsbackup/geschütztes DR strikt separat, nicht Teil dieser Testumgebung.

S0 führte U/B und vorhandene lokale Sicherheitstests aus. Neue E-/G-Szenarien werden erst nach Reparaturen freigegeben ausgeführt. Alle vorhandenen Suites bleiben bestehen; neue rote Regressionen ergänzen sie. Nicht automatisch durch ein rotes Testfeld weitergehen und als Ersatz das Produktionsbackend öffnen.

## Fixturevertrag für genau zwölf synthetische Identitäten

Neu anzulegender Testseed, **hier nicht implementiert/geschrieben**: `MS01` bis `MS12`, Namen `Synthetisch 01` bis `Synthetisch 12`, E-Mail höchstens `ms01@example.invalid` usw., öffentlich bekannter ausschließlich synthetischer Fixture-PIN, keine Daten aus realen Spielern. IDs enthalten kein `_`, damit bestehende V1-Keyannahmen den Test nicht verdecken. Separater negativer ID-Validierungstest folgt unten.

| Flight | Mitglieder | Hauptschreiber | Rollen / Geräte |
| --- | --- | --- | --- |
| `FL-MS-1`, seq 1 | MS01, MS02, MS03, MS04 | MS01 | MS01 Admin, übrige Spieler; vier getrennte Profile |
| `FL-MS-2`, seq 2 | MS05, MS06, MS07, MS08 | MS05 | MS05 Spielleiter, übrige Spieler; vier getrennte Profile |
| `FL-MS-3`, seq 3 | MS09, MS10, MS11, MS12 | MS09 | Vier Spieler; MS09 Hauptgerät bewusst offline |

Zwölf primäre Browserprofile, zusätzlich je ein Zweitprofil für MS02 und MS09: **14 Gerätekontexte, weiterhin genau zwölf Identitäten**. In Mehrgerätefällen ist dasselbe Konto nicht versehentlich ein dreizehnter Spieler. Alle zwölf melden sich an; Stressschritt bearbeitet je ein eigenes Feld gleichzeitig. Normale Generalprobe: drei Hauptschreiber, übrige lesen und prüfen. Autorisierte Änderungen am eigenen Flight und explizit gewählter privilegierter Flight werden getrennt getestet.

Kurs `MS-K18`: 18 Löcher, jedes Par 4, SI 1 bis 18 eindeutig. Synthetische Handicap-Tabelle für 0–54: Spielvorgabe identisch zum Start-HCP. Keine Übernahme echter Club-/Spielerdaten. Saisonstart `2026-01-01`, alle zwölf initial HCP 26. Runde `MS-R9F` am `2026-01-03` (`9-Front`, 1–9), `MS-R9B` am `2026-01-10` (`9-Back`, 10–18), `MS-R18` am `2026-01-17` (`18`, 1–18), jeweils dieselben drei Viererflights. Diese Daten sind künstliche Fixtures, keine realen Samstagsaufzeichnungen.

Vollständig: 108 + 108 + 216 = **432 eindeutige Scorecards**. Dokument-ID `SC-<runde>-<spieler>-<loch>`, keine Duplikate, Loch-/Spieler-/Flightidentität separat validiert. Operationen/Belege sind zusätzliche Dokumente und werden nicht mit Scorecards verwechselt. Pending, Requests, Receipts, Issues und Generationen jeweils nach Benutzer/Runde/Flight protokollieren, ohne PINs/Tokens.

Der vorhandene `tools/local/seed.cjs` des Stacks ist **kein Zwölf-Spieler-Seed** (vier synthetische Konten und kleiner Flight); die bisherigen Tests nicht als diese neue Generalprobe ausgeben.

## Unabhängiges fachliches Orakel

Verbindliche Gruppenregel: Saisonstart 26, sofern kein expliziter individueller Startwert vorliegt; Soll 18/36 Netto-Stablefordpunkte; Verbesserung 0,5 und Verschlechterung 0,1 pro Punkt, auf eine Nachkommastelle gerundet und begrenzt 0–54. Positive Halbwerte werden aufgerundet (`26.05 → 26.1`); HCP 0 ist gültig. Kein WHS-Verfahren. Nicht erneut „Kopie derselben Appfunktion“ als unabhängiges Orakel verwenden.

```text
H = 9 oder 18, Löcher explizit aus Front/Back/18 wählen
V = roundHalfUp(startHCP)     # ganzzahlige 18-Loch-Spielvorgabe der synthetischen Referenz
falls H=9: V = round(V/2)
Lochvorgabe = floor(V/H) + (SI-Rang innerhalb gespielter H < V mod H ? 1 : 0)
Netto je Loch = max(0, 2 + Par + Lochvorgabe - Schläge)
endHCP = clamp(round1(startHCP - 0.5*(Netto-Soll)), 0, 54), falls Netto>Soll
endHCP = clamp(round1(startHCP + 0.1*(Soll-Netto)), 0, 54), sonst
round1(x) = floor(x*10 + 0.5)/10
Fortschreibung nur vollständig und gültig; expliziter Strich = gespielt, Netto 0.
```

Rohscores für ein gewünschtes Netto `N` reproduzierbar erzeugen: Lochindex `j=0..H-1`, `punkte[j]=min(4,max(0,N-4*j))`; `schläge[j]=4+vorgabe[j]+2-punkte[j]`, Putts=2, Lady=false, Maxscore=false. Alle Schläge positiv; Netto 0 ist hier eine vollständig gespielte schlechte Runde, **kein fehlendes Loch**. Bei späterer Neuberechnung bleiben diese Rohschläge unverändert; nur Vorgaben/Netto/HCP werden neu berechnet. R9B wird mit Ende aus R9F erzeugt, R18 mit Ende aus R9B.

| Spieler | Netto R9F | Ende R9F / Start R9B | Netto R9B | Ende R9B / Start R18 | Netto R18 | Ende R18 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| MS01 | 18 | 26 | 18 | 26 | 36 | 26 |
| MS02 | 20 | 25 | 18 | 25 | 38 | 24 |
| MS03 | 16 | 26.2 | 18 | 26.2 | 34 | 26.4 |
| MS04 | 13 | 26.5 | 18 | 26.5 | 31 | 27.0 |
| MS05 | 19 | 25.5 | 18 | 25.5 | 37 | 25.0 |
| MS06 | 17 | 26.1 | 18 | 26.1 | 35 | 26.2 |
| MS07 | 0 | 27.8 | 18 | 27.8 | 0 | 31.4 |
| MS08 | 18 | 26 | 18 | 26 | 36 | 26 |
| MS09 | 22 | 24 | 18 | 24 | 40 | 22 |
| MS10 | 14 | 26.4 | 18 | 26.4 | 32 | 26.8 |
| MS11 | 18 | 26 | 18 | 26 | 36 | 26 |
| MS12 | 18 | 26 | 18 | 26 | 36 | 26 |

Alle Card-HCP-Starts entsprechen ihrer jeweiligen Rundenmap, private/öffentliche Spieler-HCPs am Ende identisch zur letzten Spalte. Für R9F ist `Brutto = 67 - Netto` (Parsumme 36, Vorgabe 13, 18 Basispunkte); MS09 gewinnt dort Brutto und Netto. Für R9B sind alle Netto 18 gleichauf: Gleichstand sichtbar, keine unbegründete Überlegenheit der ersten Arrayposition. Verbindliche Tiebreakregel vor Freigabe festhalten oder geteilten Rang verwenden. Abschluss darf keinen Spieler mit nur einem Loch wegen geringer Bruttosumme zum vollständigen Sieger erklären.

### Rückwirkende Korrektur mit festen Folge-Rohscores

Nur MS02/R9F/Loch 6 von **7 auf 3 Schläge** ändern: R9F-Netto steigt von 20 auf 24, Ende wird 23.0. Die späteren Rohscores bleiben fest. R9B hatte Vorgabe 13 bei Start 25, bekommt nun 12 bei Start 23: Netto **17**, Ende **23.1**. R18 hatte Vorgabe 25 und Netto 38, bekommt Vorgabe 23: Netto **36**, Ende **23.1**. Somit finale MS02-HCP **23.1**; der alte Orakelwert 23 war falsch. Alle anderen Spieler bleiben unverändert. Zweite identische reine Planung darf nichts fachlich verändern. S07-Schreibkorrekturen bleiben gesperrt.

### Separate Kantenfixtures (frische Kopie, nicht Goldenlauf verändern)

HCP 0/1/9/18/26/36/54; HCP 0 + Netto 20 Front-Nine muss Ende 0 bleiben. HCP 26 auf 18-Loch-Kurs: gespielte Front-Nine erhält insgesamt 13 Vorgaben. Generisch `9` muss exakt auf definierte neun Löcher normalisiert oder klar abgewiesen werden, niemals stillschweigend auf 18 Loch verteilen. `9-Back` verwendet SI-Ränge seiner neun Löcher, nicht rohe SI-Grenzen eines anderen Teils.

Strich: explizites Maxscore=true zählt als gespieltes Loch mit Netto 0; UI-Platzhalterschläge und Putts=3 begründen keine Brutto-/Puttswertung. Ausschalten ohne gültige Schläge macht das Loch wieder offen. Fehlende oder ungültige Löcher erlauben keine HCP-Fortschreibung. Brutto-/Putts-Veröffentlichung und Rundenschluss bleiben gesperrt.

## Konkrete Generalprobe in Reihenfolge

1. Ziel/Demo-Konfiguration und Egress-Sperre verifizieren, frische Profile/isoliertes synthetisches Dataset, Referenzdatei außerhalb produktiver Daten erstellen. Default-Allowlist/Cloudsperren nicht abschalten. Testlauf-ID und Kandidatencommit protokollieren.
2. AU/FL-Prüfungen: zwölf Logins inkl. PINwechsel, drei Flights; Mengen- und Identitätsprüfung. Erst dann R9F beginnen.
3. Auf jedem Hauptgerät autoritativen Flightkontext laden; alle zwölf ändern gleichzeitig je einen eigenen Wert. Danach je Flight zeilen-/lochweise Scores nach Orakel eingeben und lokale/serverbestätigte Zustände prüfen.
4. ACK-Barrieren, Doppelgeräte, Konflikte und Offlinefälle gezielt nach den SY/OF-Zeilen provozieren. Barrieren in Fake-/Demo-Transport, nicht nur zufälliges schnelles Tippen. Pending-/Serverzustand nach jedem Ereignis aus unabhängiger Leseinstanz vergleichen.
5. Vor Abschluss mindestens eine neue Eingabe pending lassen, Konflikt und Netzausfall setzen; Abschluss muss blockieren. Nach sauberer Auflösung alle 108 Karten serverseitig vergleichen, dann R9F einmal und nochmals abschließen.
6. R9B und R18 mit denselben zwölf Identitäten durchführen, Rohscores aus jeweils korrekter Startbasis generieren; exakt 432 Karten, alle Golden-HCP-/Leaderboardwerte vergleichen.
7. Historische MS02-Korrektur und Neuberechnung durchführen; zweite Korrekturkopie mit Fehler im zweiten Batch; Wiederanlauf und unveränderte andere Spieler prüfen. Kein kaputtes Dataset als sauberen Abschluss verkaufen.
8. Synthetische Backup-/Restoresimulation, Rücknahme-/Geräteablauf und Abbruchplan. Abschließend GO-Tabelle im Readinessbericht mit Belegen füllen; heute ist diese Generalprobe **nicht ausgeführt**.

## Szenarienmatrix — Zugang und Flightanlage

Jede Zeile ist eine automationsfähige Given/When/Then-Vorgabe. „Geplant“ bedeutet nicht bestanden. Zuordnung zu Befunden S01–S14 im Readinessbericht.

| ID / Prio / Ebene | Gegeben / Aktion | Exaktes Soll / Integritätskriterium |
| --- | --- | --- |
| AU01 P0 E | Alle zwölf Fixturekonten anmelden; MS12 muss PIN ändern, Reload, alter/neuer PIN | Neuer PIN funktioniert, alter nicht; DB/Token `mustChangePin=false`; keine echte Mail; S04 |
| AU02 P1 E | MS03 fünf falsche PINs, vor/nach synthetisch kontrollierter Sperrzeit erneut anmelden | Zähler/Sperre nur MS03; andere elf unbeeinflusst; klare Wiederaufnahme ohne Aufweichung |
| AU03 P0 E | `updatePlayerPin` mit validem newPin als eigener Spieler, Admin, fremder Spieler | Eigener/Adminfall freigegeben, fremder abgewiesen; kein `tempPin`-ReferenceError, keine Statusdivergenz |
| AU04 P1 E | Fehler zwischen PIN-DBwrite/Claimänderung bzw. Refresh injizieren | Kein falscher Erfolg; definierte reparierbare Anmeldung; keine PINs/Tokens in Logs |
| AU05 P1 B/E | MS02 offline ändern, Logout, MS03 am selben Gerät, Login MS02 | Keine fremden Pending-/Scorewerte, ursprüngliche Daten weiterherstellbar; keine automatische Alt-Puffermigration |
| AU06 P1 E | Rollenwechsel/abgelaufene Session; Spieler versucht Admin-/geschlossene/fremde private Writes | Aktuelle autoritative Rolle gewinnt; kein nur frontendseitiger Schutz; Fehler verliert keine Eingabe |
| FL01 P1 E | Admin erstellt MS-R9F mit drei Viererflights | Zwölf IDs exakt einmal, drei eindeutige Flight-IDs/Sequenzen, Datenbank und UI stimmen überein |
| FL02 P1 E | Flightbatch nach Rundenanlage scheitern lassen | Keine als spielbereit veröffentlichte halbe Runde; Retry genau ein konsistentes Ergebnis |
| FL03 P1 U/E | Doppelte/fehlende Mitgliedschaft, gleiche seq, leere ID, `_`-/Slash-ID, Flighttausch während Read | Vor Write eindeutige Ablehnung oder autorisierte Neuauflösung; kein erster Flight/Teilnehmerfallback |
| FL04 P1 B/E | Umordnung MS01–04 innerhalb desselben Flights bei bestehender Pendingkarte | Score bleibt an Spieler-ID/Loch gebunden; Änderung der Reihenfolge ändert keinen Besitzer |

## Szenarienmatrix — Scoring und Datenintegrität

| ID / Prio / Ebene | Gegeben / Aktion | Exaktes Soll / Integritätskriterium |
| --- | --- | --- |
| E2E01 P0 E/G | Normale freigegebene Eingabe für zwölf Nutzer, drei Flights, R9F | 108 eindeutige serverbestätigte Karten; unabhängiges Gerät/Leaderboard identisch; nicht nur lokaler Append |
| E2E02 P0 E/G | Dasselbe R9B | Genau Löcher 10–18, 108 Karten; Lochvorgaben/HCP korrekt aus R9F |
| E2E03 P0 E/G | Dasselbe R18 | 216 Karten, keine Off-by-nine- oder Fremdflightwrites |
| E2E04 P0 E | Alle zwölf gleichzeitig je eigenes Lochfeld ändern | Zwölf bestätigte Änderungen, kein Last-/globaler Lockverlust; Rollen/Flightregeln eingehalten |
| E2E05 P0 B/E | Gewählten Normaleingabepfad und ggf. zugelassene Schnellerfassung abwechseln | Entweder dieselbe sichere Pipeline oder unsichere Alternative nicht erreichbar; keine zweite unversionierte Wahrheit |
| E2E06 P0 E | Karte neu anlegen, synchronisieren, dann HCP/Leaderboard lesen | Identität, Start-HCP, Vorgabe, Revision und Generation gültig; fehlende berechnete Metadaten führen nicht zu heutiger HCP-Erfindung |
| SY01 P0 U/B/E | Wert 5 senden, ACK halten, 6 eingeben, ACK 5 liefern | 6 bleibt durable/pending; anschließend ACK 6; Server und unabhängige Ansicht am Ende 6 |
| SY02 P0 U/B | 5 senden, 6 und wieder 5 als zwei neue Änderungen, altes ACK 5 liefern | Neue 5 bleibt anhand Change-ID offen; kein reiner Wertevergleich als Quittung |
| SY03 P0 U/E | Loch 1 gültig, Loch 2 nur Putts=3 ohne bekannte Schlagbasis, ACK für Loch 1 | Ungesendete Putts bleiben durable/pending bzw. klar blockiert; kein blindes Entfernen aller erfassten Keys |
| SY04 P0 U/E | Nur strokes ändern; serverseitig puts=3, lady=true unverändert | Payload/Operation ändert nur beabsichtigte Felder; kein Default puts=2/lady=false/maxscore=false darüber |
| SY05 P0 B/E | ACK nach Servercommit verlieren, Reload, Request wiederholen | Exakt gleiche Request-/Change-IDs, eine Mutation/Revision; keine verlorenen Folgeänderungen |
| SY06 P0 U/B/E | Teil-ACK: ein Feld ACK, anderes Konflikt/Ablehnung/technischer Fehler | Nur exakte ACK-Operationen entfernen; unabhängige Felder weiter sendbar; offene Issues sichtbar |
| SY07 P1 B/E | ACK MS02 nach Wechsel MS03 oder anderem Spieltag/Flight eintreffen lassen | ACK nur ursprüngliche Partition, keine falsche Anzeige/Pufferbereinigung bei MS03 |
| SY08 P0 B/E | Strich an/aus, puts=0, lady true→false, leeres Schnellfeld | Explizite Feldlöschung/Boolean false erhalten; Defaultanzeige ist kein Write; keine automatische alte Wertwiederherstellung |
| SY09 P0 E | Neue lokale V2-Eingabe, normaler App-Reconnect/Retry ohne Test-Direktaufruf | Normale integrierte Pipeline sendet nachweislich; serverbestätigt erst nach ACK; fehlende Basis nicht erfinden |
| SY10 P0 E | MS02-D1 und MS03-D1 ändern denselben MS04-Score aus gleicher Revision | Genau ein Erfolg, anderer sichtbarer Konflikt; kein stilles Last-write-wins; bewusste Neuentscheidung |
| SY11 P0 E | Zwei Geräte ändern strokes bzw. puts derselben Karte | Beide unabhängigen Felder korrekt, Revisionen feldweise; nichts gegenseitig überschrieben |
| SY12 P0 E | Admin korrigiert 5→7, älteres V1-/V2-Gerät sendet danach stale Änderung | Korrektur 7 bleibt geschützt; V1 ausgeschlossen/versioniert, Adminrevision korrekt; Konflikt statt Rücknahme |
| SY13 P0 E | Karte löschen/neu erzeugen, altes ACK/Request wiederholen | Neue Generation bleibt, alter Request terminal abgewiesen; keine Wiederbelebung alter Karte |
| SY14 P0 U/B/E | Zwei Tabs desselben Kontos speichern gleichzeitig unterschiedliche Pendingfelder; einen schließen | Dauerhaft beide Änderungen vorhanden; kein Lost Update des gesamten LocalStorage-Bundles; Requestreservierung/Retry korrekt |

## Szenarienmatrix — Offline, UX und Abschluss

| ID / Prio / Ebene | Gegeben / Aktion | Exaktes Soll / Integritätskriterium |
| --- | --- | --- |
| OF01 P0 B/E/G | MS09 30 Sekunden offline, mehrere Eingaben, dann online | Alle akzeptierten Eingaben zunächst durable, danach exakt bestätigt; keine gefälschte Serveranzeige |
| OF02 P0 B/E/G | MS09 30 Minuten offline, mehrere Löcher, Browserreload/Tab schließen und wieder öffnen | Pending/Kontext erhalten; gewählter Samstagspfad tatsächlich nutzbar oder ehrlich gesperrt mit definierter Ersatzführung; keine leere neue Karte als Erfolg |
| OF03 P0 U/B | Quota-/IndexedDB-Abbruch/gesperrten Speicher provozieren | Kein „lokal gespeichert“-Erfolg; betroffene Änderung sichtbar fehlgeschlagen, akzeptierte frühere Änderungen intakt; keine falsche Null-Pending-Anzeige |
| OF04 P0 E | Emulator/Backend unterbrechen und wieder starten | Kein Cloudfallback; unbekannten Requestausgang exakt klären, keine Replayverluste; nach Schema-/Generationswechsel bewusst blockieren |
| OF05 P1 B/G | Frisches Profil offline vs. zuvor validiertes Profil; alter Worker/alte Config | Verhalten unterschieden und verständlich; keine falsche Offlinefreigabe oder Produktionseinbindung; vorhandene Daten nicht löschen |
| UX01 P0 B/G | Durchlauf lokal→pending→ACK sowie Fehler/Konflikt | Sichtbare eindeutige Zustände „nur lokal“, „ausstehend n“, „serverbestätigt“, „Konflikt“, „Fehler“; Zahl entspricht offenen Feldoperationen |
| UX02 P0 B | Neue unbestätigte Karte zeigt Par/2, Nutzer navigiert ohne Eingabe weg | Anzeige allein erzeugt keine bestätigten Scores, Sieger oder Vollständigkeit |
| UX03 P1 B/G | Netzfehler/Konflikt, erneut öffnen und Entscheidung treffen | Tatsächliche alte/neue Werte, Besitzer/Loch und sichere Retry-/Verwerfenwahl; kein automatisches stilles Rebase |
| UX04 P0 B/G | Ende der Runde mit offenen Daten, Nutzer will schließen/abmelden | Offene Daten klar benannt und wiederherstellbar; kein generisches „gespeichert“ bei fehlender Bestätigung |
| CL01 P0 E | Letzter Schlag eines Flights pending, Abschluss drücken; außerdem Cache-/nicht serverbestätigten Snapshot injizieren | Abschluss gesperrt; kein falscher Beendet-Status/HCP/Sieger; offene Flight-/Feldzahl sichtbar; nur autoritativ bestätigte Abschlussbasis |
| CL02 P0 E | Abschlussfehler zwischen Status und HCP/Spielerdokumenten injizieren | Logisch kein halb veröffentlichtes Ergebnis; Wiederanlauf definiert, keine falsche Erfolgsmeldung |
| CL03 P0 E | Zwei Abschlussaufrufe, parallel weiterer Scorewrite | Ein Snapshot/Abschluss-ID; keine doppelte Fortschreibung; spätere stale Writes sicher abgewiesen |
| CL04 P0 U/E | MS12 nur ein Loch, andere elf vollständig | MS12 kein vollständiger Bruttosieger; kein stiller Abschluss ohne freigegebene DNF-/Vollständigkeitsregel |
| CL05 P0 E | Vollständige R9F/R9B/R18 abschließen, unabhängiges Gerät refreshen | Rundenmaps, private/public HCPs, Score-HCPs, Sieger und Leaderboard exakt gleich Referenz; wiederholter Close unverändert |

## Szenarienmatrix — HCP und historische Korrektur

| ID / Prio / Ebene | Gegeben / Aktion | Exaktes Soll / Integritätskriterium |
| --- | --- | --- |
| HC01 P0 U/E | Vollständiger Goldenlauf für zwölf Spieler | Jede Tabellenzelle oben exakt, nicht nur finale Summe; alle Ansichten/Rechner identisch |
| HC02 P0 U/E | Front/Back/generisch 9 auf 18-Loch-Kurs, HCP26 | Gesamtvorgabe13 auf genau neun gespielten Löchern oder explizite Ablehnung des ungeklärten Legacytyps |
| HC03 P0 U/E | HCP0, Front9, Netto20; HCP54 und sehr schlechtes Ergebnis | Ende0 bzw. höchstens54; kein 0→53-Fallback |
| HC04 P0 U/E | Ein Loch fehlt/NaN/0; alle 9/18 Karten schlecht aber positiv; Duplikatkarte | Fehlend/ungültig/dupliziert nicht als vollständige gute Referenz; vollständig Netto0 darf dagegen HCP erhöhen |
| HC05 P0 U/E | Netto Soll±1/±4/±5, halbe Rundungsgrenzen, explizite Overrides | Eine Nachkommastelle; Beispiel26 bei Netto19/9 wird25.5, bei Netto13/9 wird26.5 |
| HC06 P1 U/E | Heutiges Spieler-HCP nach Runde verändern | Historische Anzeige nutzt gespeicherten Start; fehlender Snapshot sichtbar ungeprüft statt still heutiges HCP |
| HC07 P0 U/E | Strich toggeln und unvollständige Karte mit Restore | Netto0 fachlich eindeutig; Strich-/Putts-/Brutto-/DNF-Entscheidung explizit, nicht aus UI-Defaults abgeleitet |
| HC08 P0 U/E | MS02/R9F/Loch6 7→3 korrigieren, Saison rein planen; Schreibtest erst S07 | Folge-Netto17/36, HCP23.1/23.1 wie korrigierte Referenz; spätere Rohscores und andere elf unverändert |
| HC09 P0 U/E | 432 Scorecards + drei Runden +24 Spielerwrites, zweiten Batch scheitern lassen | Kein gültig dargestellter halber Saisonstand; Runstatus/Resume und fehlende Erfolgsmeldung; aktueller Code demonstriert das Risiko mit 400+59 Writes |
| HC10 P0 E | Identische Korrektur/Neuberechnung doppelt; Reload während Run | Wiederholung idempotent, keine doppelte HCP-Korrektur, veröffentlichte Version nachvollziehbar |
| HC11 P1 U/E | Runde löschen/abbrechen, Reihenfolge/Datum ändern, gleicher Tag zwei IDs | Nur freigegebene abgeschlossene Runden in definierter Sortierung; Kette deterministisch, keine unerwarteten Null-/26-Resets |
| HC12 P0 E | Während Korrekturlauf weiterer Admin-/Scorewrite | Versionierter Konflikt/Runabbruch statt still veralteter Veröffentlichung; Korrektur wird nicht von Queue zurückgesetzt |

## Szenarienmatrix — Betrieb, Backup und Rücknahme

| ID / Prio / Ebene | Gegeben / Aktion | Exaktes Soll / Integritätskriterium |
| --- | --- | --- |
| OP01 P0 U/E | Synthetische Snapshot-/Backupkopie der kompletten Runde inkl. Syncbelegen erzeugen und isoliert zurücklesen | Identitäten, Rohwerte, Revisionen, Generationen, private Belege und HCP-Kette konsistent. Kein Produktionsimport/Cloudauftrag in S0. |
| OP02 P0 G separat | Tatsächlicher Produktionsbackup-/geschützter DR-Nachweis durch berechtigten Verantwortlichen, erst nach eigener Freigabe | Verfahrens-/Restorebeleg ohne PII im Repo. Niemals Produktionsbackup als PreProd-Testfixture; synthetischer Test allein belegt keinen realen Restore. |
| OP03 P0 G | Exakten Release-/Rules-/Functions-/Clientstand und Rücknahme einer kompatiblen synthetischen Version prüfen | Ein Kandidat, eindeutige Versionsanzeige, keine Cached-/Schema-/Queuewiederbelebung; kein Cloud-/Produktionsprofil aus Planungszweigen erfinden |
| OP04 P0 G | Fehler kurz vor Samstag, Release abbrechen, Papier-/Betreuerablauf durchspielen | Keine hektische Veröffentlichung, keine Datenbereinigung; Datenzustand sichern und definierte Rücknahme/Übernahme unter eigener Freigabe |

## Im Audit tatsächlich ausgeführte Befehle

Im neuen Worktree (Memory-Modus explizit):

```powershell
$env:SCORE_SYNC_EMULATOR_TEST = '0'
node --test tests/preprod-gates.test.cjs tests/preprod-hosting.test.cjs tests/local-environment.test.cjs functions/test/score-read-v2.test.js functions/test/score-operations-v2.test.js tests/score-screen.test.cjs
node tests/run-score-sync-browser.cjs
node tests/run-score-screen-browser.cjs
node --test 'C:/Users/thoma/source/repos/DEV_Google/LIE Scorecards_Firebase Hotfix/tests/v1-score-safety.test.cjs'
git merge-tree f4dcbec c2be311 55c0db4
```

Ergebnisse: **180/180** kombinierte Node-Tests; Browser Sync **38**, Phase B **32**, Storage erfolgreich; Score-Screen **75 Checks je Breite 320/390/1024**, V1-/V2-Schreibaufrufe 0; Hotfix **30/30 auf seinem eigenen Stand**. `merge-tree` war die reine Drei-Baum-Vorschau und zeigte Konfliktmarker, kein Branch-/Worktree-Merge. Hotfixsuite liest nur Quelltext und verwendet VM/Fake-DB, keine Dateischreib-/Cloudoperation. Diese grünen Tests ersetzen keine neue Zwölf-Spieler-Abnahme.

### Ausführbare lokale Reproduktion des ersten P0 (keine SDKs)

Aus `.codex-mission-worktree`, nur lesender Quelltext und Speicherobjekte:

```powershell
@'
const fs=require('node:fs'),vm=require('node:vm');
(async()=>{
  const c={console:{log(){},warn(){},error(){}},navigator:{onLine:true},
    document:{getElementById:()=>null},window:{addEventListener(){}},
    localStorage:{getItem:()=>null,setItem(){}},setTimeout:()=>1,setInterval:()=>1,clearTimeout(){},
    app:{environment:{assertReady(){}},logic:{},state:{currentUser:{id:'A'},liveScores:{},
      flights:[{id:'FL-ST-1',seq:1,spieltagId:'ST',spielerIdsCsv:'A'}],
      spieler:[{id:'A',hcpLIE:26}],spieltage:[{id:'ST'}],scoreCards:[]}}};
  vm.createContext(c);
  vm.runInContext(fs.readFileSync('App_Logic_Scores.js','utf8'),c);
  c.app.logic.initScoreAutoSync('ST'); c.app.logic.calculateHoleVorgabe=()=>2;
  let ack,sent;
  c.app.logic.apiRequest=(action,p)=>{sent=p.payload;return new Promise(r=>ack=r);};
  c.app.state.liveScores.ST_A_1=5;c.app.logic.markScorePending('ST','ST_A_1');
  c.app.logic.syncScoresWithServer('ST',1,true);
  c.app.state.liveScores.ST_A_1=6;c.app.logic.markScorePending('ST','ST_A_1');
  ack({success:true});await new Promise(setImmediate);
  console.log({sent:sent[0].strokes,live:c.app.state.liveScores.ST_A_1,
    pending:Object.keys(c.app.state.pendingScoreKeys),cached:c.app.state.scoreCards[0].strokes});
})();
'@ | node -
```

Beobachtet in S0: `{sent:5, live:6, pending:[], cached:5}`. Soll nach Reparatur: neuere Änderung bleibt pending/durable, bis ihre eigene Bestätigung vorliegt. Fake-ACK ist kein Beleg eines echten Firestorecommits.

Weitere flüchtige VM-Reproduktionen in S0 verwendeten dieselben echten Module, aber ausschließlich Fake-Transport/-Batch/-DOM:

| Quelle / Aufbau | Tatsächlich beobachtet |
| --- | --- |
| V1-Fixture wie oben; ST_A_1=5 und ST_A_2_puts=3, keine Loch2-Schläge, sofortiger ACK | Gesendet nur Loch1, danach `pending=[]`, Putts3 lokal ungesendet; Payload Loch1 default `puts=2` |
| Scores-Modul, 18 Par4-/SI1..18-Bahnen, HCP26, Summe Vorgabe Loch1..9 | `rundenTyp:'9'` =9, `9-Front` =13 |
| Scores/History/Spieltage in VM, HCP0, neun Karten: erstes Loch2 Schläge, restliche4; Confirm-/API-Mocks | Netto20; normaler Close verlangt HCP53, historische Rechnung Ende0 |
| Unveränderten Body von `exports.updatePlayerPin = onCall(` bis vor `exports.requestTempPin` in VM ausführen; eigener synthetischer Nutzer, gültiges newPin, Readmock | `ReferenceError: tempPin is not defined`, noch vor Write; kein echter Auth-/DBtest |
| Scores/History in VM, zwölf IDs, drei abgeschlossene 9/9/18-Runden, 432 positive Karten; Batchmock committet ersten und wirft im zweiten | Batches `[400,59]`, **400** dauerhaft im Fake-Store, In-Memory-Spieler-HCP bereits28, Fehler `synthetic-second-batch-failure` |

Der letzte Versuch bestätigt **Teilfortschritt im Modell der echten Funktion**, keinen realen Produktions- oder Firestorefehler. Eine unabhängig implementierte reine Formelauswertung ergab für die Goldenvektoren nach R9 `[26,25,26,27,26,26,28,26,24,26,26,26]` und nach R18 `[26,24,26,28,26,26,32,26,22,26,26,26]`; das ist ein Referenzbeleg, kein ausgeführter vollständiger Appvergleich.

## Eindeutige Abnahmeentscheidung

**GO** nur mit bestandenem vollständigem gewählten Samstagspfad für alle zwölf synthetischen Nutzer, sämtlichen verbleibenden P0/P1-Gates, korrekten Orakelwerten, sichtbaren Konflikten und nachgewiesener Backup-/Restore-/Rollbackfähigkeit plus separater Veröffentlichungsfreigabe. Optional unsichere Features dürfen kontrolliert ausgeschlossen werden; sie dürfen dadurch weder erreichbar bleiben noch vorhandene Daten verändern.

**NO-GO** bei einem verlorenen akzeptierten Feld, still überschriebenem korrigiertem Score, falschem Server-/Lokalstatus, nicht nutzbarer PINpflicht, HCP-Abweichung, unklarem Abschluss, unbewiesenem Restore oder nicht ausgeführter Zwölf-Spieler-Generalprobe. Kein Schwellenwert „fast alle Tests grün“. Aktuell gilt NO-GO. Erster Korrekturauftrag: S01/R1, wie im Readinessbericht konkret formuliert.
