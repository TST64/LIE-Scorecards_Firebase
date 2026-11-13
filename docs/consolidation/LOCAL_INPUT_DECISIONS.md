# Einzelentscheidungen zu den ursprünglichen lokalen Dateien

Quelle: ursprünglicher Worktree `feature/score-autosync`, HEAD `cb4661f5194147fa0ef0f40fe44838ce3d0aa19e`. SHA256/Größen: `SOURCE_INPUTS.json`. Originaldateien wurden ausschließlich gelesen und bleiben unverändert.

**Entscheidender Nachweis:** Alle sechs Dirty-Dateien stimmen nach reiner CRLF/LF-Normalisierung exakt mit Commit `8763d7b` überein. Dieser bereits vorhandene Import ist Vorfahr von `d50c3d9`. Damit wird keine lokale Funktion durch das Unterlassen eines zweiten Imports vergessen. Der aktuelle Stand enthält die späteren Sicherheitskorrekturen.

| Datei | Lokaler Zweck | Entscheidung im Konsolidierungsbranch |
| --- | --- | --- |
| `App_Logic_Bridge.js` | Polling prüft Pending statt bloßer Livewerte | Bereits in `8763d7b`, später durch S01/V2 abgesichert. Neueren Bridge behalten. |
| `App_Logic_Scores.js` | Persistenter V1-Puffer, Pending, Autosync pro Flight, Status und explizites Sichern | Bereits in `8763d7b`. Alle neun dort hinzugekommenen Funktionsnamen sind im V2-Stand vorhanden. Naives ACK-Löschen ohne Änderungs-/ABA-Bezug und bloße Speicherwarnungen werden nicht zurückkopiert; S01-Journal und autoritativer V2-Sender bleiben maßgeblich. |
| `App_Logic_Spieltage.js` | Schnellerfassungsänderungen als Pending markieren | Bereits importiert. Aktuelle persistenzgeprüfte Annahme beibehalten. |
| `Views_ScoreSchnellerfassung.js` | Autosync initialisieren, Flight-/Silent-Parameter beim Sichern | Bereits importiert. Die unversionierte schnelle Schreibansicht bleibt bewusst gesperrt; keine zusätzliche aktive Featureübernahme aus der alten Vorschau. |
| `config.js` | Alte Preview-Versionsnummer | Bereits historisch importiert, danach durch lokale Guards ersetzt. Kein aktives produktives Firebase-/GAS-Profil aus dieser Datei kopieren. Explizite Local-/PreProd-/Produktions-Adapter aus d50 unverändert behalten. |
| `sw.js` | Ein Kommentar-Trennzeichen | Kein funktionaler Gewinn; schon in der Historie. Kein Reaktivieren alter Worker-/Cache-Verwendung. |
| `docs/PROJECT_STATUS.md` | Lokaler Bericht vom08.11. | Inhalt entspricht PR#1/`5eba4e6`. Als historische Referenz mit Warnkopf übernommen; ein alter Initialwert redigiert. Kein aktueller Statusbericht. Eigener Commit. |
| `fiveserver.config.js` | Entwicklungsserver auf `0.0.0.0:5500`, Remote-Logs | Nicht als aktive Konfiguration übernommen. Umgeht den geprüften Wrapper-/CSP-/Umgebungsworkflow und ist für das konsolidierte lokale Profil nicht erforderlich. Metadaten erhalten, Original unangetastet. |
| `design-reference/lie-6-score-mode-target` | Mobile Designvorlage | Binärdatei nicht übernommen: Namen/Porträts; synthetische Herkunft/Freigabe nicht belegt. Gestaltungsabsicht: Spieler-Karten, große Eingabeflächen, Lochfortschritt, klare lokale/Server-Statusunterscheidung. Keine neue UI daraus gebaut. |
| `design-reference/lie-current-liveboard` | Frühere Matrix/Live-Ansicht | Nicht veröffentlicht: Screenshot mit Personenbezug und real wirkenden Runden-/Scorewerten. Gewohnte Matrix-/Listen-/Flightdarstellung ist bereits im geprüften `Views_LiveScoreboard.js` erhalten; unsichere alte Brutto-/Putts-Berechnungen werden nicht aktiviert. |
| `design-reference/lie-current-score.png` | Bisherige Score-Oberfläche | Nicht veröffentlicht: Personen-/Score-Bezug. Vorhandene neue V2-Eingabe und bereits bereinigte synthetische UI-Nachweise bleiben unverändert. |
| verschachtelte `.codex-*-worktree/` | Vorhandene isolierte Arbeitsstände | Nicht in Git aufnehmen. Alle21 anderen Worktrees separat inventarisiert; keine Inhalte oder Metadaten ihrer Branch-HEADs verändert. |
| ignorierte Tool-/Emulator-/Browser-/Backup-/ZIP-Verzeichnisse | Lokal erzeugte Laufzeit-/Belegdaten | Nicht importiert, nicht geöffnet/kopiert als Benutzerdaten. Keine Credentials, privaten Backups oder Datenbanken ins Repository. Nur bereinigte Ergebniszähler und Hashes eigener Testlogs dokumentiert. |

Zusätzlich außerhalb der d50-Abstammung: Phase-1-Sicherheitsbericht aus PR#3/`afadff8` als historische Dokumentation; paralleler V1-Hotfix `55c0db4` ausschließlich als nicht angewendeter historischer Patch. Keine Merge-Strategie „ours“, kein automatisches Überbügeln, keine Reaktivierung alten Anwendungscodes.

Öffentliche Firebase-Webkonfiguration und Projekt-/App-IDs in der vorhandenen Basis sind keine privaten Admin-Credentials. Sie bleiben explizite, abgesicherte Konfigurationsreferenzen. Bereits bestehende synthetische Testkonstanten sind keine ausgegebenen produktiven PINs. Neue echte PINs, Tokens, OAuth-Caches, private Schlüssel oder Sicherungsinhalte wurden nicht übernommen.
