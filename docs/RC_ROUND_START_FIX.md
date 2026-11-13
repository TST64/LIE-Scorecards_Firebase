# RC1 – Rundenstart im lokalen Demo-Modus

Stand: 11.11.2026. Branch `codex/rc1-ui-round-start`, isolierter Worktree `.codex-rc-round-start-worktree`. Grundlage ist `b3ee957` einschließlich RC1-Diagnose und Performance-Fix. Keine Produktionsfreigabe.

## Bestätigte Ursache

Der unveränderte synthetische Seed aus `npm run rc` erzeugte nach Spielern, Kurs und Vorgabentabelle bereits `RC-ROUND`: **Aktiv**, 9-Front, zwölf Teilnehmer in drei Flights. Eine weitere Runde über die normale Oberfläche überlappt deshalb bei allen zwölf Spielern.

Die konkret abweisende Prüfung liegt in `functions/round-start.js`, innerhalb der Transaktion nach der Abfrage aktiver und beendeter Runden:

```js
requireValue(old.status !== 'Aktiv', 'Participant already has active round; S05 required');
```

Das ist eine beabsichtigte Sicherheitsprüfung, kein Fehler im 9-Front-Vertrag. Reproduktion: echte lokale Auth-/Firestore-/Functions-Emulatoren, derselbe `rc-fixture.seed()`, Anmeldung MS01/PIN1234, zwölf Teilnehmer, Kurs RC-COURSE, 9-Front, normale Flight-Vorschau und Speichern. Der Browser erhielt HTTP400 / `functions/failed-precondition`. Der direkte Aufruf desselben unveränderten Servermoduls mit dem erfassten UI-Request und den tatsächlichen Emulator-Claims wies die oben genannte Prüfung nach. Es wurde keine zweite Runde geschrieben.

## Gezielte Korrektur

Der lokale RC-Seed legt ausschließlich Startdaten an, **keine aktive Runde und keine Scorecards**. Der Benutzer legt die erste Runde über die Oberfläche an; `createRoundStart` erzeugt weiterhin die autoritativen Snapshots. Die reine `fixture()`-Runden-/Flight-Vorlage bleibt für bestehende Tests erhalten und wird nicht mehr in die Demo geschrieben.

Serverlogik, Firestore Rules, Berechtigungen, HCP-Regeln, Alt-Schreibsperren und Umgebungsschutz bleiben unverändert. Vorhandene Daten werden weder gelöscht noch umetikettiert; ein nicht leerer Emulator wird weiterhin abgewiesen. Keine automatische Pending-Löschung.

Der kurze bestehende RC-Smoke-Test legt seine Runde nun ebenfalls über die normale Oberfläche an. Er verwendet je einen Spieler der tatsächlich ausgelosten Flights statt eine feste Zuordnung zu unterstellen.

## Lokaler Nachweis

Regression zuerst: Commit `4d5ff2a`; vier gezielte Seed-/Rundenstarttests, davon zwei vor dem Fix rot und zwei grün. Nach dem Fix sind die vier grün. Insgesamt **25/25** gezielte Tests grün:

```powershell
node --test tests/rc-round-start.test.cjs functions/test/round-start-s06.test.js tests/rc-compatibility.test.cjs tests/browser-network-s08-2.test.cjs
```

Separater echter Chrome-/Emulatorlauf nach dem Fix bestätigt:

- Normale UI-Anlage: HTTP200, 9-Front, zwölf autoritative HCP-Start-Snapshots, drei Flights.
- Normale UI-Eingabe: MS01, Loch1, fünf Schläge; serverseitig bestätigte V2-Scorecard einschließlich Generation-Binding.
- Erneute UI-Anlage mit denselben Spielern weiterhin abgewiesen; anschließend genau eine Runde und eine Scorecard vorhanden.
- Keine unerlaubten Browser-Ursprünge; lokale CSP-Sperre gegen Apps-Script-Zugriffe bestätigt.

Auch der angepasste bestehende kurze RC-Smoke-Test ist grün: erster Rundenstart über die Oberfläche, drei getrennte Browserprofile, je ein Schreiber pro tatsächlichem Flight, zwölf bestätigte V2-Karten. Beide Nachher-Läufe verwendeten frische Emulatoren. Zusammengefasste synthetische Nachweise: [RC_ROUND_START_EVIDENCE.json](RC_ROUND_START_EVIDENCE.json).

Abschließender Integritätsvergleich: HEAD und Status der versionierten Dateien aller 19 bisherigen Worktrees unverändert; SHA256 aller sechs ursprünglich uncommitteten Dateien und unversioniertes Inventar des ursprünglichen Entwicklungs-Worktrees unverändert. Der Diff enthält keine Änderungen an Functions, Rules, Anwendungskonfiguration oder den bestehenden Umgebungs-/Netzwerksperren.

Reproduzierbarer gezielter Lauf mit Java21 und installiertem Chrome:

```powershell
node tools/local/run-rc-round-start.cjs
# Bestehenden kurzen Drei-Schreiber-Starttest an getrennten Ports ausführen:
node tools/local/run-rc-round-start.cjs --smoke
```

Der Test-Runner verwendet ausschließlich `demo-lie-scorecards-local`, App12501/Auth12099/Firestore12088/Functions12001, eigene Hilfsports, leere synthetische Emulatoren und neue Browserprofile. Er beendet nur seine eigenen Prozesse. `--expect-blocked` reproduziert den Vorher-Nachweis auf dem Test-Commit vor dem Seed-Fix; auf dem korrigierten Stand muss diese Vorher-Erwartung scheitern.

## Start der korrigierten Demo

Die bereits laufende ältere Demo auf Port5501 wurde nicht angefasst und behält ihre aktive Vorab-Runde. Sie aktualisiert sich nicht durch diesen Fix. Falls ihre flüchtigen synthetischen Eingaben noch benötigt werden, zunächst erhalten; sie werden hier nicht migriert oder gelöscht.

Danach die alte lokale RC-Sitzung selbst regulär beenden, im neuen Worktree mit Node22/Java21 `npm run rc` starten und `http://127.0.0.1:5501` in einem neuen Browserprofil öffnen. Als MS01 mit Fixture-PIN1234 anmelden, neuen Spieltag mit Kurs **Synthetic RC course**, **9-Front** und den gewünschten Teilnehmern anlegen, Flights bestätigen und Scores eingeben. Bei Zufallsflights je einen der tatsächlich zugeordneten Spieler als Schreiber einsetzen. Bestehende Profile und Pending-Daten unverändert lassen.

## Grenzen

Bestätigt ist der synthetische lokale Rundenstart samt V2-Eingabe und fortbestehender Überlappungssperre. Produktive Bestandskompatibilität und die verschwundene historische Runde wurden hier nicht geprüft. Keine produktiven Zugriffe, Deployments oder Merges; kein neuer allgemeiner Testlauf und keine Produktionsfreigabe.
