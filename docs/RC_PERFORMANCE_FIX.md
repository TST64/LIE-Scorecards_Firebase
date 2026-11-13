# RC1 – unklare Runden in Performance sichtbar

Stand11.11.2026. Basis `9a8c71e92c7429ab20ab192ece3d8fa721f8ad17`; neuer isolierter Worktree `.codex-rc-performance-worktree`, Branch `codex/rc1-performance-review`.

## Eng begrenzte Änderung

Eine abgeschlossene Teilnehmer-Runde mit18-Loch-Konfiguration und nur neun erfassten Löchern bleibt jetzt in der persönlichen Performance-Ansicht als eigener Prüfbereich sichtbar. Kennzeichnung exakt:

**„Prüfung erforderlich – Rundentyp oder Score-Vollständigkeit unklar“**

Angezeigt werden Datum, Kurs, Runden-ID, ursprüngliche Typ-/Lochkonfiguration, Kartenanzahl und vorhandene Rohscores je Bahn: Schläge, Putts, Lady, Strich. Fehlend, null,0 undFalse werden nicht in Standardwerte umgeschrieben. Die Ausgabe ist HTML-escaped; sämtliche Originalobjekte bleiben unverändert. Fehler bei der Bahnauswahl, doppelte/falsch zugeordnete Bahnen oder widersprüchliche Typ-/Lochmetadaten führen ebenfalls zum Prüfbereich statt zum Verschwinden oder zu geratenen Berechnungen.

`reviewRounds` ist von bewerteten `rounds` getrennt. Für Prüfrunden werden die vorhandenen HCP-/Netto-Rechner **nicht aufgerufen**; ihre Ergebniswerte bleiben null. Sie erzeugen keine HCP-Punkte oder neue Fortschreibung und fließen nicht als gültige Runde in bewertete Auswertungen ein. `hasHcpReviewGaps` und der sichtbare Hinweis kennzeichnen die ungeprüfte Kette. Bestehende gespeicherte HCP-Punkte davor/danach und der daraus bisher angezeigte aktuelle Wert werden nicht neu gerechnet oder verändert.

**Bestehende Ansichtssperre bleibt erhalten:** RC1 hatte die gesamte Legacy-Performance/Brutto/Putts-Ansicht gesperrt. Der Fix fügt nur darunter die lesende Prüfliste hinzu. Er schaltet weder die alte Gesamtauswertung noch Rankings oder ein HCP-Diagramm frei. Ohne Prüffälle liefert der View weiterhin denselben bisherigen Hinweistext, byte-identisch. Keine allgemeine UI-Neugestaltung und keine neue Reparatur-Schreibfunktion.

## Lokaler Nachweis

Tests-zuerst-Commit `8a2df94`: fünf gezielte Regressionen, vor dem Fix vier erwartete Fehler und eine bereits grüne Kontrollprüfung für korrekte Runden. Log lokal: `.local-runtime/performance-red.txt`.

Nach dem Fix:

```powershell
node --test tests/performance-review.test.cjs tests/round-repair-preview.test.cjs
```

**11/11 PASS, keine Skips**, `.local-runtime/performance-green.txt`. Fünf neue Fälle und sechs unmittelbar angrenzende bestehende Diagnose-/Vorschaufälle. Die alte Reproduktionsprüfung beschreibt jetzt korrekt den Ausschluss aus bewerteten Aggregaten bei gleichzeitiger Verfügbarkeit als Prüfrunde.

Nachgewiesen sind: tatsächlicher Performance-View rendert den Prüfhinweis/Rohscores; keine HCP-/Netto-Rechneraufrufe für unklare Runden; keine Einbindung ihres gespeicherten, ungeprüften HCP-Endwerts in die bestätigte Reihe; unveränderte Datenobjekte; korrekte9-Front-/9-Back-/18-Loch-Ergebnisse und bisheriger View unverändert; keine fremden Spielerscores und keine HTML-Injektion. Prüfung verwendet die tatsächlichen Anwendungsdateien in einer lokalen VM, keine Firebase-Initialisierung. Syntax- und Diffprüfung ebenfalls bestanden. Kein Emulator-/Produktions-/Browserlauf und keine allgemeine Testkampagne wurden hinzugefügt.

## Bereitschaft und Grenzen

**Ja: Der isolierte RC1-Fix ist lokal für die nächste gezielte Bestandsprüfung der Anzeige vorbereitet.** Er kann verdächtige geladene Runden zeigen, ohne sie zu reparieren oder ihre HCP-Folgen zu behaupten.

Die echte verschwundene Runde wurde weiterhin nicht gelesen oder identifiziert. Unveränderte Saison-, Teilnehmer-, Status- und Löschfilter können andere Runden weiterhin ausblenden; das ist kein allgemeiner Filterumbau. Vor einer realen Bestandsprüfung bleiben Zielidentifikation und separate ausdrückliche Lesefreigabe erforderlich. Keine Produktionsfreigabe, keine Datenkorrektur, kein Deploy oder Merge. Scorecards, Rundentypen, HCPs, Auth, Rules und Umgebungs-Guards wurden nicht gespeichert oder geändert.

Abschlussvergleich PASS: ursprüngliche sechs Dirty-Dateihashes, vollständiger Diff, unversioniertes Inventar und sämtliche bisherigen Worktree-HEADs/Git-Status unverändert. Lokaler Beleg `.local-runtime/integrity.txt`; kein vollständiger Hashnachweis ignorierter Laufdateien. Alle Änderungen liegen ausschließlich im neuen Worktree.
