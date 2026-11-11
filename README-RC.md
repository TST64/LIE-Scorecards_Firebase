# Mission Samstag – lokaler RC1

Basis: Draft-PR #27, `3d55211fd82689fee761ce27d910a76a2f1a0ebb`. Stand: 11.11.2026.
Ein Anwendungskern, zwölf synthetische Spieler, drei feste Viererflights. **Lokal benutzbar; keine Produktionsfreigabe.**

Im neuen Worktree `.codex-rc-worktree`, Node22 und Java21+ auf PATH:

```powershell
npm ci --ignore-scripts --no-audit --no-fund
npm --prefix functions ci --ignore-scripts --no-audit --no-fund
npm run rc
```

Falls Java21 nicht die Standardversion ist, vor dem Start für dieses Terminal `JAVA_HOME` auf das vorhandene JDK21 setzen und dessen `bin` an `PATH` voranstellen. Die kurze Prüfung verwendete das bereits vorhandene portable JDK21; es wurde keine systemweite Installation verändert.

Danach `http://127.0.0.1:5501` in drei **neuen getrennten Browserprofilen** öffnen.

| Schreiber | Flightmitglieder | Rolle |
| --- | --- | --- |
| MS01 | MS01–MS04 | Admin / Abschluss |
| MS05 | MS05–MS08 | Spielleiter |
| MS09 | MS09–MS12 | Spieler |

Alle zwölf sind synthetisch. Öffentlicher Fixture-PIN ausschließlich lokal: **1234**.
Jeder der drei Schreiber erfasst über „Mein Flight“ die vier Spieler seines Flights.
Die weiteren neun erfassen nicht parallel. **Drei Schreiber sind eine Betriebsvereinbarung, keine neue serverseitige Benutzerbegrenzung.**

Die erste 9-Front-Runde und ihre Start-Snapshots werden mit dem bestehenden autoritativen Servermodul erzeugt. Es werden keine historischen Ergebnisse vorgetäuscht und keine Legacy-Scorecards mit fehlenden V2-Metadaten vorgeschrieben.

**Nur synthetisch:** Emulatoren starten leer. Der RC-Seed verweigert vorhandene Firestore-/Auth-Daten statt sie zu überschreiben. Die Sitzung ist flüchtig; nach Beenden/Neustart sind Eingaben dieser synthetischen Sitzung nicht als erhalten zugesichert. Keine echten Scores, PINs oder Bestandsdaten eingeben. Die Bestandserhaltung für den späteren Produktivstart wird separat im unten verlinkten Plan behandelt.

Ports: App5501, Auth9099, Firestore8088, Functions5001; Hilfsports4400/4500/9150. Andere lokale Emulatorläufe vorher regulär beenden. Der Start öffnet keinen Browser und führt keinen Deploy aus. `npm run rc:smoke` ist die kurze Startprüfung mit drei UI-Schreibern und zwölf Karten; keine neue Generalprobe.

Weitere Produktionsschritte, Datenunterschiede und G02/F02: [Bestandserhalt und Startplan](docs/RELEASE_CANDIDATE.md).
Gemeldete18-/9-Loch-Altrunde: [nur lesende Diagnose, Vorschau und Admin-Repair-Plan](docs/ROUND_TYPE_REPAIR.md). Synthetischer Einstieg: `npm run rc:round-preview`; kein Speichern und kein produktiver Zugriff.
Konkrete Vorbereitung der noch nicht identifizierten Runde: [Lesediagnose und Abfrageumfang](docs/ROUND_DIAGNOSIS_PREP.md). Bestehende Firebase-Umgebung: [Backup-/Rückfallanleitung mit getrennten Freigaben](docs/FIREBASE_BACKUP_ROLLBACK.md). Beide sind vorbereitet, nicht produktiv ausgeführt.
Tatsächliche lokale Prüfungen: [RC-Validierung](docs/RC_VALIDATION.md).
Die alten Deployment-Anweisungen in `README-DEPLOYMENT.md` sind historische Notizen und für diesen RC **nicht ausführbar**.
