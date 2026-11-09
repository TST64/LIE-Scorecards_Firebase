# S02/S03 – autoritativer Score-Pfad (Design vor Implementierung)

Basis: `3d77af88318679d30896b9d611bbaf812af4d4a7`, Draft-PR #15. Issue #16.
Neuer Branch `codex/s02-s03-authoritative-score-sync`, isolierter Worktree `.codex-s02-s03-worktree`.

## Inventar und verbindliche Entscheidung

| Writer / Einstieg | Bisher | Entscheidung für diesen Kandidaten |
| --- | --- | --- |
| normale Eingabe `Views_ScoreEingabe` → ScoreEntryV2 | IndexedDB, kein automatischer Sender | automatischer Scheduler, bestehender V2-Adapter/Callable |
| `saveScoreOperationsV2` | Transaktion, Feldrevision, Generation, Mutation-/Request-Receipt | einziger aktiver App-Scorewriter; Admin-Korrekturen ebenfalls nur mit derselben CAS-Basis |
| V1-Schnellerfassung → `saveLiveScores` | unversionierter Client-Write | sichtbar sperren; V1-Journal und Puffer unverändert erhalten |
| direkte Admin-Korrektur `saveAdminRoundCorrection` | Round-/Score-Batch ohne Revision | vor jedem Write sperren; S07-Folgearbeit |
| `recalculateSeasonFromStart` | Score-/HCP-/Runden-Batches | vor jedem Write sperren; S07 |
| Rundenschluss UI/API | Runde schließen, danach HCP-Updates | vor Seiteneffekten sperren, Pending-/Konflikthinweis; S05 |
| Master-Reset | löscht zuerst Runden, dann Scores/Flights | vor erstem Write sperren |
| direkter Firestore-Client, auch Admin | Score-/Legacy-Score-Writes ohne CAS | Rules verweigern `scorecards`-/`scores`-Writes, Reads gemäß Auth-Grenze erhalten |
| externe Admin-SDK-Skripte / Operator-Credentials | umgehen Firestore Rules | keine vorhandene App-Route; nicht durch Rules kontrollierbar, Cloud-Guards bleiben gesperrt |

Ein aktiver Vertrag: Owner/Player, Runde, Flight, Zielspieler, Loch, Feld, eindeutige Change-ID,
unveränderlicher Request, erwartete Feldrevision und Dokumentgeneration. Serverseitig atomare
Feldänderung mit Receipt; gleiche Revision konkurrierender Geräte erzeugt genau einen Erfolg,
der andere bleibt Konflikt. Andere Felder bleiben unabhängig. Nie automatisch rebasen/discarden.

Neue Karten verlangen ausdrücklich gespeicherte Rundenstartdaten: `hcpStart[playerId]` und
`holeAllowances[playerId][hole]`. Fehlen sie, wird Erstellung abgewiesen. Kein heutiger HCP,
kein erfundener Wert. Vorbereitung echter Runden und die fachliche Berechnung bleiben S06.

Release bleibt NO-GO. Testbelege und Implementierungsabschluss werden nach roten Regressionen
und sicherem lokalem Emulatorlauf ergänzt. Keine Cloud-/GAS-/Produktionszugriffe oder Deployments.
