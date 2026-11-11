# RC1 – begrenzte lokale Validierung

Basis PR#27 / `3d55211`, Stand11.11.2026. Keine erneute S08.2-Kampagne. Deren381 Node-/30 Hotfix-/432-Karten-Belege werden übernommen, **nicht als hier erneut ausgeführt ausgegeben**.

Tatsächlich ausgeführt:

- `node --test tests/rc-compatibility.test.cjs tests/local-environment.test.cjs`: **17/17 PASS**, keine Skips. Vier Kompatibilitätsproben und13 bestehende Start-/Umgebungs-Guards, weil der Wrapper um den RC-Einstieg erweitert wurde. `.local-runtime/rc-focused-tests.txt`.
- `npm run rc:smoke`: **Exit0**. Ein gezielter echter Auth-/Firestore-/Functions-Emulator-/Browserstart mit drei Schreibern, je vier Spielern und genau einem Loch. Zwölf unabhängig serverbestätigte V2-Karten und zwölf autoritative Start-Snapshots, `forbiddenOrigins=0`. Kein Rundenschluss-/History-/Restore-Dauerlauf. `.local-runtime/rc-smoke.txt`, `.local-runtime/rc-smoke-proof.json`.
- `node --test tests/rc-compatibility.test.cjs tests/round-repair-preview.test.cjs`: **10/10 PASS**. Die vier Kompatibilitätsproben plus sechs gezielte Tests der nachträglich angefragten Rundentyp-Diagnose: tatsächlichen Performance-Ausblendungspfad reproduziert, Front-/Back-Auswahl, vollständige unveränderte Rohdaten, Auswirkungen über drei synthetische Runden und Sperren bei fehlenden/widersprüchlichen Daten. `.local-runtime/rc-data-tests.txt`.
- `npm run rc:round-preview`: **Exit0**, ausschließlich eingebautes synthetisches Beispiel. `.local-runtime/round-repair-preview.json`, kein Firebase-Zugriff und kein Save/Apply. Bereinigte Beispielkopie: [RC_ROUND_REPAIR_PREVIEW.json](evidence/RC_ROUND_REPAIR_PREVIEW.json).

Eine erste Legacy-Leseprobe scheiterte am Testadapter ohne vollständige Collection-Queries; der Test benutzt jetzt dieselbe Erweiterung wie die vorhandenen S07-Tests. Keine Änderung am Published-Read. Die erste npm-Installation scheiterte in der Sandbox; im neuen Worktree mit derselben Lockdatei erfolgreich wiederholt, keine Paketupdates. Beide Punkte wurden nicht als Anwendungsfehler ausgegeben.

Alle Testdaten sind synthetisch; keine Produktionszugriffe, Deployments, Merges oder Änderungen an bisherigen Worktrees. Rohlogs bleiben unter `.local-runtime/` im neuen RC-Worktree.

**Freigabegrenze:** Lokaler RC-Start bestätigt, reale Bestands-/Produktionsfreigabe weiterhin offen. Die konkrete produktive18-/9-Loch-Runde wurde nicht untersucht; die fehlende Performance-Anzeige ist ein bestätigter möglicher Codepfad, keine bestätigte Ursache im realen Bestand. Eine Admin-Speicherfunktion ist geplant und nicht implementiert.

Abschlussvergleich: ursprüngliche sechs Dirty-Dateihashes, vollständiger Git-Diff und unversioniertes Inventar unverändert; alle bisherigen Worktree-HEADs und Git-Status entsprechen der zu Beginn erfassten Ausgangsbasis. `.local-runtime/rc-integrity.txt`. Kein vollständiger Hashnachweis aller ignorierten Laufdateien wird behauptet. Alle Änderungen dieses Auftrags liegen ausschließlich im neuen RC-Worktree.
