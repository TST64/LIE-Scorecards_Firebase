# RC1 – vertrautes Live-Scoreboard und Rundenschluss

Stand: 12.11.2026. Neuer isolierter Branch `codex/rc1-live-scoreboard` auf `37afa5c` (funktionierender Rundenstart, einschließlich RC1-Performance-Fix). Keine Produktionszugriffe, Deployments oder Merges.

## Bestätigter Ausgangsbefund

`Views_Leaderboard.js` enthält weiterhin die ursprüngliche Matrix-, Listen- und Flightansicht als `leaderboardLegacyReference`. Eine spätere S06-Definition ersetzt sie durch eine schlichte Tabelle ohne die gewohnte Ansichtsauswahl. Die ursprüngliche Implementierung ist keine sichere Datenquelle: sie mischt `app.state.liveScores` mit globalen Karten, verwendet teilweise heutige HCPs/Fallbacks, ordnet Back-Nine-Löcher alternativ als `hNr-9` zu und besitzt alte Brutto-/Putts-/Siegerdarstellungen. Der bisherige `startLivePolling` liest außerdem direkt die Firestore-Scorecards.

Die alte Implementierung bleibt ausschließlich Designreferenz. Sie wird weder aufgerufen noch als Fallback verwendet. Die vertraute Gestaltung – grüne Akzente, Score-Matrix mit Par-Zeile und Spielernamen, kompakte Rangliste, Flight-Karten – ist in `Views_LiveScoreboard.js` neu an den bestätigten Lesestand gebunden.

## Autoritativer Lesestand ohne Backend-Änderung

Der vorhandene V2-Eingabeleser `readOwnFlightScoresV2` liefert bewusst nur den eigenen Flight. Er wird nicht erweitert oder durch einen ungeprüften All-Flight-Zugriff umgangen. Die Live-Gesamtsicht verwendet zwei bereits vorhandene authentifizierte Server-Leseverträge:

1. `readPublishedSeasonV1` liefert einen atomaren Saison-/Runden-/Rohscore-/Flight-Stand.
2. `roundClosureV1` ausschließlich mit **`action:inspect`** prüft die gesamte gewählte Runde über den bestehenden V2-Vertrag: Generation-Bindings inklusive Firestore-Creation-Timestamps, positive Feldrevisionen, Score-Identitäten, eingefrorene HCP-Starts und Lochvorgaben. Er liefert geprüfte Netto-Summen und einen Digest.

Der Browser bildet **denselben kanonischen SHA256-Digest wie `functions/round-close.js`** über Runde, Rundenstartdaten, Flights und jede angezeigte Rohscorecard. Nur wenn Digest, Score-Revision und Status übereinstimmen, wird der neue Stand angezeigt. Damit können die zwei Leseaufrufe bei gleichzeitiger Eingabe keine ungeprüfte Mischprojektion veröffentlichen. Eine aktive Historienkorrektur blockiert neue Projektionen. Fehlende Snapshots, ungeprüfte Altdaten oder ein abweichender Digest führen nicht zu Schätzungen oder einem Legacy-Fallback.

Die Rangliste liest keine IndexedDB-Pending-Queues, `liveScores`, heutigen Spieler-HCPs oder direkten Firestore-Collections. Gesamtsummen stammen aus der Serverprüfung; die Matrix zeigt deren gebundene Rohschläge. Loch-Netto-Hinweise verwenden ausschließlich die kanonische Gruppenregel mit den geprüften, eingefrorenen Lochvorgaben. Strich zählt null Punkte; vorhandene Rohschläge werden nicht verändert.

Live-Abfragen starten beim Öffnen der Rangliste oder des Overlays unmittelbar und folgen sequenziell fünf Sekunden nach Abschluss des vorherigen Abrufs. Kein paralleles Polling. Beim Ansichts-/Kontowechsel werden alte Antworten verworfen; beim Schließen des Overlays endet dessen Polling. Der letzte bestätigte Stand bleibt bei Offline-/Lade-/Prüffehlern sichtbar, ist dann ausdrücklich als veraltet gekennzeichnet und wird automatisch erneut abgeglichen. Keine F5-Abhängigkeit.

## Darstellung und bestehende Sicherheitsgrenzen

- **Matrix, Liste, Flights:** identische Datenbasis, mobile Buttons mindestens48px, horizontal scrollbar innerhalb der Matrix, Fokus und horizontale Position bleiben bei Live-Updates erhalten.
- **Laufend:** „Live-Netto · vorläufiger Zwischenstand“, bestätigte Löcher je Spieler, Hinweis auf unterschiedlich viele gespielte Löcher. Keine neuen HCP-Endwerte und keine offiziellen Sieger aus der Live-Reihenfolge.
- **Offiziell:** nur der serververöffentlichte `_roundClose`-Stand nach erfolgreicher Prüfung; separate Sieger-/HCP-Tabelle und Abschlussrevision.
- **Rundenschluss:** verständlicher Status, Ergebnis-/HCP-Prüftabelle, Flight-Karten mit persönlichem Geräteabgleich, große Freigabe-/Abschluss-/Abbruchbuttons. Bei unvollständigen Scores ist der Startbutton deaktiviert; ohne alle Freigaben der Bestätigungsbutton. Die vorhandenen serverseitigen Prüfungen und lokalen Pending-/Konflikt-/Persistenzsperren bleiben unverändert maßgeblich.
- **Fehlermeldungen:** Rundenschluss zeigt sichere Handlungsanweisungen statt ungekürzter technischer Fehlermeldungen. Bei unklarem Ausgang bleibt der aktuelle Serverstand zu prüfen; keine implizite Bestätigung.
- **V2-Eingabe:** Layout, Steuerelemente, Farben, Sync-Sender und Persistenzlogik unverändert. Nur „Flight / Live“ öffnet das neue lesende Overlay. Es liegt außerhalb des Eingabe-Rendercontainers, damit ein normaler ACK-Repaint es nicht entfernt. Keine Sync-Funktion wurde dafür verändert.

Alte unversionierte Score-Schreibwege, Brutto-/Putts-Veröffentlichung und unsichere HCP-Fallbacks bleiben gesperrt. Kein neuer Backend-Endpunkt, keine Änderung an Functions, Rules oder Auth-Verträgen.

## Gezielt ausgeführter Nachweis

Vor Umsetzung acht reproduzierende Live-Tests rot. Nach Umsetzung **16/16** gezielte Tests grün: acht Live-Lese-/Darstellungs-/Lifecycle-Tests, sechs vorhandene Rundenschluss-Pending-/Offline-/Konflikt-/Persistenz-Gates, zwei sichere Offline-Prüfungen der Feldtest-Vorlage.

```powershell
node --test tests/rc-live-scoreboard.test.cjs tests/round-close-s05-client.test.cjs tests/fieldtest-proposal.test.cjs
node tools/local/run-rc-round-start.cjs --live-ui
```

Der echte Chrome-/Emulatorlauf verwendet den tatsächlichen RC-Seed, eine normale 9-Front-UI-Rundenanlage, zwölf synthetische Spieler und drei getrennte Browserprofile. **108 Scorecards** wurden über die normale V2-Oberfläche eingegeben. Bestätigt:

- Änderung in einem Schreiberprofil erscheint im anderen Profil ohne Reload.
- Offline-Eingaben bleiben aus dem Live-Netto heraus; nach Wiederverbindung erscheinen die bestätigten Werte automatisch.
- Live-Overlay überlebt normale Score-ACKs.
- Alle drei Ansichten zeigen dieselben Summen; Sichtprüfung bei390px und1280px.
- Score-Eingabe, Live-Netto und serverseitiger Rundenschluss stimmen überein; drei persönliche Flightfreigaben, einmaliger offizieller Abschluss, veröffentlichte HCPs passen zum Abschlussvertrag.
- Keine unerlaubten Browser-Ursprünge. Eigene Testports12501/12099/12088/12001 und Hilfsports; bestehende Demo nicht angefasst.

Bei der Sichtprüfung wurde ein Kontrastproblem durch die alte globale `header`-CSS-Regel entdeckt und ausschließlich für die neuen Ansichten korrigiert. Anschließende gezielte Sichtprüfung (`--live-visual`) prüft die Ansichten und den gesperrten unvollständigen Abschluss, ohne die komplette Neun-Loch-Prüfung zu wiederholen.

Verdichteter Nachweis: [RC_LIVE_UI_EVIDENCE.json](RC_LIVE_UI_EVIDENCE.json). Bildschirmnachweise liegen unter `docs/evidence/rc-live/`. Dies ist keine neue allgemeine Testkampagne.

Abschließender Integritätsvergleich: HEADs, vollständige Statusinventare und SHA256-Hashes ursprünglich geänderter Dateien aller **20 bisherigen Worktrees** unverändert. Functions, Rules, V2-Sender/-Storage/-Controller und bestehende lokale/PreProd-Guards haben gegenüber der Basis keinen Diff. Die Offline-PreProd-Policy enthält weiterhin keine genehmigten Cloud-Ziele.

## Lokal starten und nächster Feldtest

Im neuen Worktree `.codex-rc-live-worktree` mit Node22/Java21 und installierten Lockfile-Abhängigkeiten `npm run rc` starten. Eine alte Demo muss der Benutzer vorher selbst regulär beenden, wenn deren Standardports benutzt werden sollen. Neue synthetische Sitzung/neues Browserprofil verwenden; bestehende lokale Daten und Profile nicht löschen. MS01 erstellt den ersten Spieltag. Die lokale bekannte Fixture-PIN bleibt ausschließlich für den Emulator gedacht.

Der gewünschte Mobilfunk-Feldtest ist separat in [FIELD_TEST_PREPARATION.md](FIELD_TEST_PREPARATION.md) vorbereitet. **Noch nicht bestätigt:** physische Smartphones, Safari-/Mobilfunk-/Hintergrundverhalten, Cloud-Konfiguration und Online-Bereitstellung. Keine Online-Umgebung ist angelegt. Die bestehenden lokalen Guards müssen vor späterer Freigabe durch einen eigenständigen geprüften PreProd-Bootstrap ergänzt werden, nicht abgeschaltet. Produktive Bestandsdaten wurden nicht geprüft oder übernommen.
