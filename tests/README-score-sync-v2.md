# Isolierter Client-V2-Adapter

V2 bleibt unverbunden mit Views, V1 und Scheduler. Das Laden der Module startet
keine Requests oder Timer. Der Adapter manipuliert kein DOM.

**Zwingender Produktionsblocker (Review-Befund 2):** V1 und direkte Firestore-
Schreibrechte umgehen die V2-Revisionen. Vor Produktionsfreigabe müssen sämtliche
Schreiber derselben Scorecards versioniert oder ausgeschlossen und die Rules
verschärft werden. Dieser Schritt ändert weder V1 noch Firestore Rules.

## Persistenz und Bearbeitungsbasis

IndexedDB `lie_score_sync_v2`, Version 3, besitzt `serverCache`,
`pendingOperations`, `requestSnapshots`, `operationReceipts` und `operationIssues`.
Das Upgrade ergänzt Stores; vorhandene Daten werden nicht gelöscht. Alte lokale
Operationen ohne Bearbeitungsbasis bleiben erhalten und werden feldweise blockiert.
Sie werden nicht stillschweigend anhand neuer Serverdaten umgebucht.

`appendChanges(context, changes)` liest Cache und offene Vorgänger in derselben
IndexedDB-Transaktion wie die Speicherung. Die lokale Operation erhält eine
unveränderliche `baseFieldRevision` und `baseDocumentGeneration`. Fehlt Wissen
bei der Eingabe, bleiben diese Werte `null`. Späteres Nachladen ersetzt sie nicht.

Eine zweite lokale Änderung desselben Felds speichert zusätzlich
`predecessorChangeId` und erhält den ursprünglichen Basisanker ihres Vorgängers.
Der Wire-Request darf als erwartete Revision ausschließlich die gespeicherte
`appliedFieldRevision` dieses bestätigten eigenen Vorgängers verwenden. Diese ist
von `currentServerRevision` getrennt: Hat eine fremde Mutation inzwischen Revision
2 geschrieben, während der eigene Vorgänger nur Revision 1 schrieb, sendet die
Folgeänderung Basis 1 und erhält einen Konflikt. Ihre Basis wird niemals aus dem
inzwischen neueren Cache abgeleitet.

## Monotoner Servercache

`putServerSnapshot(context, values, fieldRevisions, info)` verarbeitet ausdrücklich
angegebene Felder separat. Revisionen stammen ausschließlich aus bestätigten
Server-Reads. Ein Feld mit Revision, aber ohne Wert in `values`, gilt als gelöscht.
Nicht genannte Felder werden nicht verändert. Ältere/fehlende Revisionen können
bekannte Werte oder Revisionen nicht ersetzen. Gleiche Revision mit anderem Wert
bricht die ganze Transaktion als Inkonsistenz ab.

`info.generation` ist für jeden Refresh mit Revisionen sowie für jeden bereits
versionierten/generationsgebundenen Cache zwingend. Fehlt sie, erfolgt
`generation-required` ohne Änderung. Eine andere Generation führt zu
`generation-mismatch`; auch ein zusätzliches `replacesGeneration` kann diese
Schranke des normalen Refreshs nicht umgehen.

Ein bewusster Lebenszykluswechsel hat eine separate API:
`replaceServerGeneration(context, values, fieldRevisions, info)`. Sie benötigt
Revisionen für alle vier Scorefelder und
`{ generation: neueGeneration, replacesGeneration: zuvorGeleseneGeneration }`.
Die erwartete alte Generation muss vor dem Server-Read erfasst werden. Die Prüfung
und der Austausch erfolgen atomar; veraltete Erwartungen führen zu
`stale-generation-transition`. Lokale Pending-Operationen werden dabei nicht
entfernt oder auf die neue Generation umgebucht.

Rein unversionierte Legacy-Daten (ohne Generation und bekannte Revisionen) bleiben
als Kompatibilitätscache les-/aktualisierbar und erzeugen keine erfundenen
Revisionen. Sobald ein Legacy-Record an eine Generation gebunden werden soll,
ist ein vollständiger bestätigter Snapshot mit Revisionen aller Scorefelder
erforderlich; alte unbekannte Werte werden dabei nicht übernommen. Bereits
versionierte Legacy-Records ohne Generation dürfen nicht mit unversionierten
Daten aktualisiert werden. Das IndexedDB-Upgrade allein bindet/migriert keine
Bearbeitungsbasis und löscht keine alten Datensätze.
Der Server bindet neue Generationskennungen zusätzlich über einen privaten,
gleichzeitig erzeugten Beleg an den tatsächlichen Dokument-Erstellungszeitpunkt.
Eine kopierte alte Generationskennung legitimiert daher keine neu erzeugte Karte.

## Requests und mehrere Tabs

`createRequestSnapshot(context, { protocol: 'score-v2' })` sucht und reserviert
innerhalb EINER IndexedDB-Transaktion einen vorbereiteten Request. Zwei Tabs
verwenden deshalb denselben persistenten `requestId`/Wire-Request für dieselben
Operationen. Nach Absturz/Reload kann jeder Tab diesen Request wiederholen.
Eine Lease ist dafür nicht nötig: Es gibt keinen exklusiven Sender, dessen Tod
Fortschritt verhindern könnte. Zwei parallele Übertragungen desselben Requests
bleiben durch die serverseitigen Mutation-Belege idempotent.

Unbekannter Request-Ausgang bleibt `prepared`; er wird vor neuem Arbeitsvorrat
wiederholt. Nach einer vollständigen Serverantwort ist der Request `completed`
oder `acknowledged`. Konflikte und Ablehnungen bleiben pro `changeId` in
`operationIssues`; unabhängige Felder desselben Flights können weiter senden.
Pro Feld wird die älteste offene Operation übertragen, höchstens 100 je Request.
Die Sperre im Adapter gilt nur für gleichzeitig laufende Aufrufe derselben Instanz
und desselben Flight-Kontexts, nicht für andere Flights.

ACK aktualisiert Werte/Revisionen, eigene angewandte Revisionsbelege, exakte
Pending-Löschungen, Issues und Requeststatus atomar. Der Anzeigezustand wird erst
anschließend aus Cache plus Pending-Overlay abgeleitet. Ältere ACK-Revisionen oder
ACKs einer inzwischen ersetzten Dokumentgeneration setzen keinen neueren Cache
zurück. Ein lokaler Schreibfehler rollt die komplette ACK-Transaktion zurück.

## Öffentliche Adapter-API und explizite Auflösung

`createScoreSyncV2Adapter({ store, transport, getIdentity })` injiziert alle
Abhängigkeiten. `createFirebaseScoreSyncV2Adapter()` erzeugt auf ausdrücklichen
Aufruf den Produktionstransport zum Callable in `europe-west1`.

Der Kontext benötigt `ownerUid`, `playerId`, `spieltagId`, `flightId` und `mode`
(`ownFlight` oder `selectedFlight`). Es gibt keinen Flight-Fallback.

- `sync(context)` erzeugt/recycelt atomar den nächsten sendbaren Request.
- `retry(context, requestId)` wiederholt exakt den gespeicherten Request.
- `resolveField(cardContext, field, 'rebase' | 'discard', expectation)` ist eine ausdrückliche
  Benutzerentscheidung über EIN Feld. `cardContext` enthält zusätzlich
  `documentId`, `spielerId`, `hole`. Ein Rebase fasst die offene lokale Kette auf
  ihren zuletzt eingegebenen Wert zusammen und erzeugt eine NEUE `changeId` mit
  aktuell ausdrücklich bestätigter Basis. Alte Operationen bleiben als
  `superseded`/`discarded` samt Inhalt archiviert. Andere Felder werden nicht berührt.

Die verpflichtende `expectation` stammt aus derselben Leseoperation wie die
angezeigten Werte: `readScorecard(cardContext).resolutionExpectations[field]`.
Sie enthält die geordneten offenen `changeIds`, die beobachtete `generation`
und die bestätigte `fieldRevision` (jeweils `null`, falls unbekannt). Diese Werte
werden in derselben IndexedDB-Transaktion wie Rebase/Discard mit dem aktuellen
Zustand verglichen. Die Erwartung wird schon beim Aufruf kopiert, bevor eine
asynchrone Identitätsprüfung beginnt.

Bei einer neuen lokalen Änderung, bestätigten Revision oder Generation erfolgt
`stale-resolution`: Kein Pending-Eintrag, Beleg, Issue oder Cachewert wird geändert.
Der Aufrufer muss neu anzeigen und erneut entscheiden lassen. Er darf nicht
automatisch frische Erwartungen einlesen und dieselbe Entscheidung wiederholen.
Fehlende/unvollständige Erwartungen werden als `invalid-resolution-expectation`
abgewiesen. Die gleiche Sicherung gilt auch bei direkter Nutzung des Speicherdienstes.

Ein unklarer vorbereiteter Request muss vor einer Auflösung durch Retry geklärt
werden. Die Auflösungsfunktion wird noch von keiner produktiven View aufgerufen.
Auch ein manueller Retry wird vor dem Senden atomar als vorbereitet reserviert.
Er darf keine ausdrücklich verworfenen/ersetzten Operationen erneut senden;
gleichzeitige Auflösung in einem anderen Tab wird dadurch verhindert. Definitive
Server-Ablehnungen/Konflikte werden am unveränderlichen Request gespeichert,
damit verspätete Duplikate diese Entscheidung nicht zu einem neuen Schreiben
umdeuten. Eine neue Benutzerentscheidung erzeugt neue IDs.
Fehlende Basis wird erst durch eine solche explizite Entscheidung aufgelöst.
`readScorecard(context).syncIssues` und `inspect(context)` zeigen offene Probleme.

## Lokale Tests ohne Firebase/Firestore

Voraussetzungen: Node 22 und bereits installiertes Chrome oder Edge unter Windows.
Es werden keine Pakete oder Browser heruntergeladen.

```powershell
node tests/run-score-sync-browser.cjs
$env:SCORE_SYNC_EMULATOR_TEST = '0'
node --test functions/test/score-operations-v2.test.js
```

Der Browser-Runner verwendet echte IndexedDB in einem temporären Profil und einen
Loopback-Testserver. Neben Fake-Transportfällen führt er gemeinsame Tests aus:
der echte Browseradapter ruft per lokalem HTTP-Testtransport die echte
`createScoreOperationsV2`-Kernlogik mit injizierter In-Memory-Datenbank auf. Die
Testendpunkte existieren nur im Testprozess; sie sind keine Anwendungsendpunkte.
Es werden weder Firebase SDK noch Zugangsdaten dafür benötigt.

Die Tests decken Bearbeitungsbasis, Cache-Monotonie, zwei Adapter/Verbindungen,
feldweise Blockierung/Auflösung, Verlust einer echten Serverbestätigung,
Vorgängerrevision versus fremde Revision, physische Löschung/Neuanlage und
ACK-Rollback ab. Die früheren Speicher-/Snapshot-Tests laufen ebenfalls.
Zusätzlich prüfen native IndexedDB-Upgrade-Tests vorbereitete Version-1-/Version-2-
Datenbanken gegen Version 3. Version 1 enthält historisch Pending und Cache;
Version 2 zusätzlich vorbereitete Requests. Die Datensätze bleiben beim Upgrade
unverändert. Weitere Tests decken veraltete Entscheidungen aus anderen Tabs,
Generations-Refresh ohne/mit fremder Generation, drei verkettete Eingaben mit
verspätetem Doppel-ACK sowie Logout/Login während eines Transports ab.

Nach Erfolg beschreibt `lastOutcome` den terminalen Status. Ein früherer Fehler
bleibt getrennt als `lastFailure` erhalten; eine späte Fehlerantwort eines
Duplikats überschreibt den erfolgreichen Status nicht.

Manuell ist `/tests/score-sync-storage.html` separat ausführbar.
`/tests/score-sync-v2.html` benötigt für seine Integrationstests den Testserver des
Runners; ein einfacher statischer Webserver stellt diese Testendpunkte nicht bereit.
Echte Firestore-SDK-/Lock-/Retry-Semantik bleibt Gegenstand der separaten
Emulator-Suite; dieser lokale Lauf verwendet keinen Emulator und keine Produktivdaten.
