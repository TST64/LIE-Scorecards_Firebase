# Isolierter Score-Schreibpfad v2

Der neue Callable-Endpunkt `saveScoreOperationsV2` ist nur exportiert, nicht
deployt oder in Views, Bridge v1 oder Scheduler eingebunden. Die lokale v2-Queue
wird noch nicht automatisch in Netzwerk-Requests übersetzt.

## Vertrag

Ein Request enthält `requestId`, `ownerUid`, `playerId`, `spieltagId`, `flightId`,
`mode` (`ownFlight` oder `selectedFlight`) und `operations` (1 bis 100).
Jede Operation enthält denselben Besitzer-/Flight-Kontext sowie `spielerId`,
`hole`, `documentId`, `field`, `operation`, `value`, `changeId` und
`baseFieldRevision` und `baseDocumentGeneration`. Die erwartete Revision darf nicht stillschweigend ergänzt
werden. Der Request und jede Mutation werden mittels kanonischem SHA-256-Hash
an ihren ursprünglichen Inhalt gebunden.

Nur `strokes`, `puts`, `lady`, `maxscore` sind veränderbar. `delete` benötigt
`value: null`; `set` benötigt einen passenden Zahlen-/Booleanwert. Identitäten
werden serverseitig validiert und bei neuen Dokumenten separat initialisiert.
Berechnete Felder werden weder initialisiert noch neu berechnet.

Antwort: `requestId` und für jede Operation `changeId`, `documentId`, `field`,
`status` (`acknowledged`, `conflict`, `rejected`), `currentServerRevision`, `reason`.
Bei autorisiertem, gültigem Revisionszustand kommen `currentServerValue` und
`currentServerDeleted` hinzu, damit ein idempotenter Retry keinen historischen
Requestwert unter einer neueren Revision im Clientcache ablegt.
ACKs enthalten außerdem `appliedFieldRevision`, `appliedDocumentGeneration`
und `currentDocumentGeneration`. Eigene lokale Folgeänderungen dürfen nur auf
der tatsächlich angewandten Vorgängerrevision aufsetzen, niemals auf einer durch
fremde Mutationen erhöhten aktuellen Revision.
Die Revision entspricht dem finalen Transaktionszustand. Bei nicht autorisierten
oder ungültig adressierten Operationen ist sie `null`: Es wird keine Revision eines
fremden Dokuments offengelegt. Ungültige Request-Hüllen ohne Operationsliste
und technische Transaktionsfehler ergeben einen Callable-Fehler, niemals ACKs.

Pro Feld wird `_sync.fields.<field>.revision` und `lastMutationId` gepflegt.
Ohne Feldmetadaten gilt Revision 0. Zusätzliche private Collections
`scoreSyncV2Requests` und `scoreSyncV2Mutations` sichern unveränderliche
Request-Identitäten und dauerhafte Idempotenz, auch nach späteren Mutationen.
Definitive Konflikte/Ablehnungen werden außerdem pro Operation am Request
festgehalten. Verspätete Duplikate können eine nach der Ablehnung ausdrücklich
verworfene/ersetzte Operation nicht nachträglich anwenden. Bereits erfolgreich
gespeicherte Mutation-Belege haben nach erneuter Autorisierung weiterhin Vorrang.
Diese Belege dürfen nicht ohne eine gesonderte Aufbewahrungsstrategie gelöscht
werden. Wiederholungen ändern weder Feldwert noch Revision.

## Dokumentgenerationen und Metadaten

Ein Bestandsdokument ohne `_sync` hat Feldrevisionen 0 und eine Generation aus
seinem unveränderlichen Firestore-`createTime` (`legacy:<seconds>:<nanoseconds>`).
Alte gültige Feldmetadaten ohne Generation verwenden dieselbe Ableitung. Existiert
`_sync`, müssen es und `fields` gültige Maps sein; beschädigte Container, Feld-
Metadaten und Generationsangaben werden rejected, nicht als Revision 0 behandelt.

Ein bestätigtes Fehlen eines Dokuments wird als Generation `absent` mit bekannten
Feldrevisionen 0 dargestellt. Nur eine neue Mutation auf genau dieser expliziten
Basis darf eine Scorecard anlegen. Sie erhält eine frische `_sync.generation`
(`gen:<UUID>`), die auch im Mutation-Beleg gespeichert wird. Feldlöschung erhält
Dokument und Generation. Physische Dokumentlöschung beendet diese Generation.
Zusätzlich wird `scoreSyncV2Generations` als private Geburtsbindung im selben
atomaren Commit wie die neue Scorecard angelegt. Deren Firestore-`createTime`
muss bei späteren Transaktionen mit dem der Scorecard übereinstimmen. Eine
Wiederherstellung mit kopierter alter `_sync.generation` wird so ebenfalls
abgewiesen. Legacy-Generationen werden direkt gegen `createTime` geprüft.

Ein alter Mutation-Beleg wirkt danach als Tombstone für genau diese Mutation:
bei fehlender Scorecard erfolgt `rejected/document-deleted`, bei einer neu
erzeugten fremden Generation `rejected/document-generation-mismatch`. Es gibt
kein ACK mit Revision 0 und keine automatische Wiederherstellung alter Werte.
Der Client behält solche Änderungen als feldbezogenes Problem und wiederholt
sie nicht automatisch endlos. Eine bewusste Neuanlage erfordert einen bestätigten
Absenz-Read und eine neue Mutation/ID. Wiederherstellungen mit kopierten alten
`_sync`-Generationen werden vor der Belegbestätigung erkannt und rejected.

Erlaubte Rundendaten sind exakt `18`/18 Bahnen, `9-Front`/9, `9-Back`/9 und das
explizite Legacy-Format `9`/9 (Loch 1–9). Unbekannte Typen, fehlende Pflichtangaben
und inkonsistente Anzahlen werden serverseitig abgewiesen.

## Autorisierung und bestehende Rules

Callable-Authentifizierung stellt Firebase bereit. Der Server prüft zusätzlich
UID = Token-playerId entsprechend dem bestehenden PIN-Login, Besitzkontext,
PIN-Wechselstatus, den aktuellen Spieler-Datensatz und dessen aktuelle Rolle,
Löschstatus, Spieltagsstatus, exakte Flight-Zugehörigkeit und Zielspieler.
`ownFlight` verlangt Mitgliedschaft des Aufrufers; `selectedFlight` verlangt
aktuell Admin/Spielleiter. Auch Spielleiter dürfen nur explizit ausgewählte,
existierende Flights bearbeiten. S05 sperrt neue Writes im Abschlussfenster
und nach Rundenschluss auch für Administratoren; historische Korrekturen bleiben
bis S07 gesperrt. Vorhandene Receipts dürfen ausschließlich den bereits
committeten Wert bestätigen. Abgebrochene/gelöschte Runden werden abgewiesen.

Das Admin SDK umgeht Firestore Rules. Deshalb erfolgen Whitelist-, Typ-,
Revisions-, Identitäts- und Berechtigungsprüfungen im Server und innerhalb
derselben Transaktion wie die Schreibvorgänge. Alle Reads erfolgen vor Writes.
Die bestehenden Rules bleiben unverändert und verweigern durch den Catch-all
Clientzugriff auf die drei privaten Collections für Requests, Mutationen und Generationen.

**Zwingender Blocker vor Produktionsfreigabe (Review-Befund 2):**
Die bestehenden Score-Rules erlauben weiterhin breite direkte v1-Schreibzugriffe
ohne Flight-/Revisionsprüfung, einschließlich Sync-Metadaten. Die Konfliktgarantie
gilt deshalb für konkurrierende v2-Schreibvorgänge, nicht für gleichzeitige
unversionierte v1-Schreibvorgänge auf denselben Dokumenten. Vor produktiver
Umschaltung müssen diese Schreibzugriffe kontrolliert abgelöst und die Rules
verschärft werden. Das ist ausdrücklich nicht Bestandteil dieses Schritts.

## Tests ohne Netzwerk

Im Repository-Root:

```powershell
node --test functions/test/score-operations-v2.test.js
```

Die Standardtests verwenden ausschließlich einen injizierten In-Memory-Adapter.
Er prüft insbesondere Read-before-Write und commitet Änderungen erst nach
erfolgreichem Transaktionsabschluss. Echte Firestore-Locks, Transaktions-Retries
und SDK-Merge-/Delete-Semantik sind erst durch den Emulator abgedeckt.

## Echte Firestore-Integration mit Emulator

Voraussetzungen: Node 22, installierte Dependencies in `functions`, Firebase CLI
und eine von der CLI unterstützte Java-Version (für aktuelle Emulatoren JDK 21+).
Gegebenenfalls lädt die CLI beim ersten Start den Emulator herunter.

Im Repository-Root, PowerShell:

```powershell
$env:SCORE_SYNC_EMULATOR_TEST = '1'
$env:GCLOUD_PROJECT = 'demo-score-sync-v2'
try
{
    firebase emulators:exec --config functions/test/firebase.json --project demo-score-sync-v2 --only firestore "node --test functions/test/score-operations-v2.test.js"
}
finally
{
    Remove-Item Env:SCORE_SYNC_EMULATOR_TEST -ErrorAction SilentlyContinue
    Remove-Item Env:GCLOUD_PROJECT -ErrorAction SilentlyContinue
}
```

Die Tests verweigern Emulator-Modus ohne Loopback-Host und `demo-`-Projekt-ID.
Der CLI-Befehl überschreibt bewusst das produktive Standardprojekt aus
`.firebaserc`. Testdaten erhalten zufällige IDs; es gibt keine Datenbankbereinigung,
keinen Import, Export oder Deploy. Der Emulator wird nach dem Test beendet.
Die identische Suite verwendet im Emulator-Modus echte Admin-SDK-Transaktionen.
Callable-Transport und Security-Rules-Clienttests sind damit nicht abgedeckt.
