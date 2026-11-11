# Mission Samstag – lokaler RC1

Basis: Draft-PR #27, `3d55211fd82689fee761ce27d910a76a2f1a0ebb`. Stand: 11.11.2026.
Ein Anwendungskern, zwölf synthetische Spieler, bis zu drei Viererflights. **Lokal benutzbar; keine Produktionsfreigabe.**

Im neuen Worktree `.codex-rc-round-start-worktree`, Node22 und Java21+ auf PATH:

```powershell
npm ci --ignore-scripts --no-audit --no-fund
npm --prefix functions ci --ignore-scripts --no-audit --no-fund
npm run rc
```

Falls Java21 nicht die Standardversion ist, vor dem Start für dieses Terminal `JAVA_HOME` auf das vorhandene JDK21 setzen und dessen `bin` an `PATH` voranstellen. Die kurze Prüfung verwendete das bereits vorhandene portable JDK21; es wurde keine systemweite Installation verändert.

Danach `http://127.0.0.1:5501` in drei **neuen getrennten Browserprofilen** öffnen.

| Beispiel-Schreiber bei manueller Aufteilung | Flightmitglieder | Rolle |
| --- | --- | --- |
| MS01 | MS01–MS04 | Admin / Abschluss |
| MS05 | MS05–MS08 | Spielleiter |
| MS09 | MS09–MS12 | Spieler |

Alle zwölf sind synthetisch. Öffentlicher Fixture-PIN ausschließlich lokal: **1234**.
Jeder der drei Schreiber erfasst über „Mein Flight“ die vier Spieler seines Flights.
Die weiteren neun erfassen nicht parallel. **Drei Schreiber sind eine Betriebsvereinbarung, keine neue serverseitige Benutzerbegrenzung.**

Es wird keine aktive Runde vorab angelegt. Als MS01 anmelden, über die normale Oberfläche einen Spieltag anlegen (z. B. 9-Front, Synthetic RC course, zwölf Teilnehmer) und anschließend Scores eingeben. Der bestehende autoritative Server erzeugt dabei die Start-Snapshots. Bei zufälligen Flights je einen tatsächlich zugeordneten Spieler als Schreiber wählen; MS01/MS05/MS09 sind keine garantierte Flight-Aufteilung. Es werden keine historischen Ergebnisse oder Legacy-Scorecards vorgeschrieben.

**Nur synthetisch:** Emulatoren starten leer. Der RC-Seed verweigert vorhandene Firestore-/Auth-Daten statt sie zu überschreiben. Die Sitzung ist flüchtig; nach Beenden/Neustart sind Eingaben dieser synthetischen Sitzung nicht als erhalten zugesichert. Keine echten Scores, PINs oder Bestandsdaten eingeben. Die Bestandserhaltung für den späteren Produktivstart wird separat im unten verlinkten Plan behandelt.

Ports: App5501, Auth9099, Firestore8088, Functions5001; Hilfsports4400/4500/9150. Andere lokale Emulatorläufe vorher regulär beenden. Der Start öffnet keinen Browser und führt keinen Deploy aus. `npm run rc:smoke` ist die kurze Startprüfung mit drei UI-Schreibern und zwölf Karten; keine neue Generalprobe.

Weitere Produktionsschritte, Datenunterschiede und G02/F02: [Bestandserhalt und Startplan](docs/RELEASE_CANDIDATE.md).
Gemeldete18-/9-Loch-Altrunde: [nur lesende Diagnose, Vorschau und Admin-Repair-Plan](docs/ROUND_TYPE_REPAIR.md). Synthetischer Einstieg: `npm run rc:round-preview`; kein Speichern und kein produktiver Zugriff.
Konkrete Vorbereitung der noch nicht identifizierten Runde: [Lesediagnose und Abfrageumfang](docs/ROUND_DIAGNOSIS_PREP.md). Bestehende Firebase-Umgebung: [Backup-/Rückfallanleitung mit getrennten Freigaben](docs/FIREBASE_BACKUP_ROLLBACK.md). Beide sind vorbereitet, nicht produktiv ausgeführt.
Tatsächliche lokale Prüfungen: [RC-Validierung](docs/RC_VALIDATION.md).
Gezielter Performance-Anzeige-Fix auf Diagnosestand9a8c71e: [Prüfrunden sichtbar, Rohscores unverändert, keine neue HCP-Fortschreibung](docs/RC_PERFORMANCE_FIX.md).
Die alten Deployment-Anweisungen in `README-DEPLOYMENT.md` sind historische Notizen und für diesen RC **nicht ausführbar**.

Rundenstart-Korrektur, genaue Ursache und gezielter UI-Nachweis: [RC-Rundenstart](docs/RC_ROUND_START_FIX.md). Eine bereits laufende ältere Demo bleibt unverändert; sie enthält weiterhin ihre vorab angelegte aktive Runde. Für diesen Fix aus dem oben genannten neuen Worktree frisch starten. Bestehende Pending-Daten oder Browserprofile nicht löschen.
