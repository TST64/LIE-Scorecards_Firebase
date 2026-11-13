# NICHT PRODUKTIONSREIF / NICHT MERGEN — LIE Scorecards V2 konsolidierte Referenz

Technische Übergabe gegen main, **kein Rollout- oder Merge-Vorschlag**. Die künftige Weiterentwicklung soll vom funktionierenden main-Stand ausgehen und Fehler einzeln reproduzieren/beheben; diese Gesamtlinie nicht durchmergen.

Basis d50c3d9 enthält die vollständige S01–S08.2-Kette sowie die lokalen RC-, Live-UI-, Startadapter- und Produktions-NO-GO-Commits. Alle sechs noch im ursprünglichen Worktree sichtbaren lokalen Änderungen waren bereits mit8763d7b importiert; sie wurden nicht über neuere Sicherheitsmechanismen zurückkopiert. Anwendungscode, V2-Eingabe/-Sender, Live-Ansichten, HCP-/Abschlussverträge, Functions und Rules gegenüber d50 unverändert.

Ergänzt: historische Berichte aus PR#1/#3, unapplied V1-Hotfix-Referenz, vollständige Git-/Worktree-/PR-/Inputinventur und die geforderten `docs/HANDOVER_CURRENT_STATE.md`/`docs/CONSOLIDATION_MANIFEST.md`. Personenbezogene lokale Designbilder, LAN-Konfiguration, Secrets, Emulatorbestände, private Backups und generierte ZIPs sind nicht importiert.

Im neuen unabhängigen Worktree:147 gezielte vorhandene Node-Tests grün,27 IndexedDB-/Sync-Browserprüfungen und je75 V2-Eingabechecks bei320/390/1024px. Keine allgemeine neue Testkampagne, keine Firebase-/Cloud-Zugriffe. Frühere synthetische Integrationsnachweise bleiben mit ihren Grenzen dokumentiert.

**NO-GO bleibt:** G02/F02-Recovery unvollständig, keine echte Smartphone-/Cloud-Abnahme, produktive Legacy-Daten ohne erforderliche V2-Verträge, kein geprüfter produktiver Backup-/DR-Rückfall. Keine Datenmigration, produktiven Schreibzugriffe, Deployments oder Merges. Bestehende Worktrees, main und alte PRs bleiben unverändert.
