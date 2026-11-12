# Mission Samstag – drei Smartphones über Mobilfunk

Stand: 12.11.2026. **Vorbereitung, keine angelegte oder freigegebene Online-Umgebung.** Keine produktiven Zugriffe, Migrationen, Projektanlage, Deployments oder Merges. Die funktionierende V2-Score-Eingabe und ihr Synchronisationsvertrag bleiben erhalten. Android/iPhone gemischt sind vorgesehen; tatsächliche Geräte und Safari-Verhalten sind noch ungeprüft.

## Bereitstehende Konfiguration und verbleibende Sperren

Ziel ist das bereits vorgeschlagene, eigenständige Firebase-Projekt **`lie-scorecards-preprod`** mit Firebase Hosting unter **`https://lie-scorecards-preprod.web.app`**, Functions in `europe-west1`, eigener Auth, eigenem Firestore und ausschließlich synthetischen Spielern. Projekt-/Subdomain-Verfügbarkeit wurden nicht abgefragt. Die Standard-Subdomain ist verbindlich; kein Produktions-DNS, keine eigene Domain, kein Tunnel in lokale oder produktive Firebase-Dienste.

Die lokale Konfigurationsvorlage steht in [config/fieldtest/proposal.json](../config/fieldtest/proposal.json); das bestehende [Hosting-Konzept](../config/preprod/hosting/firebase.proposal.json) und die [PreProd-Policy](../config/preprod/policy.json) bleiben unverändert und gesperrt. Offline prüfen:

```powershell
node tools/preprod/fieldtest-review.cjs
```

Der Prüfer kann weder eine Cloud-Verbindung herstellen noch etwas bereitstellen. Sein Ergebnis muss `cloudExecutionAuthorized:false` und `onlineReady:false` enthalten. Die Vorlage enthält keine PINs, Tokens, privaten Schlüssel oder angeblich gültigen Firebase-Web-App-Werte.

**Bestätigter technischer Freigabepunkt:** Der aktuelle RC ist absichtlich nur lokal ausführbar. `App_Environment.js` akzeptiert ausschließlich Loopback, HTTP und das Demo-Projekt; `App_Start.js` verlangt `/__local/ready`; `functions/index.js` initialisiert über `functions/local-guard.js` ausschließlich Emulatoren mit synthetischer Credential und aktiviert den lokalen Netzwerkschutz. `tools/preprod/gate.cjs.execute()` verweigert Cloud-Ausführung grundsätzlich. Ein Kopieren nach Hosting oder ein Austausch von `config.js` reicht deshalb ausdrücklich nicht.

Vor einer späteren Bereitstellung ist ein kleiner, gesondert geprüfter **PreProd-Bootstrap** erforderlich: exakt freigegebene HTTPS-Origin und Projekt-ID, ausschließlich dessen Firebase-Web-App, echte Runtime-Identität nur dieses Testprojekts, kein Emulatoraufruf, keine lokalen synthetischen Credentials, kein Produktions-Fallback. Lokale Guards bleiben unverändert strikt. Der bestehende V2-Sender, die Score-Oberfläche und die Backend-Verträge werden dabei nicht neu entworfen. Dieser Bootstrap wurde hier nicht implementiert oder aktiviert; dafür darf keine Sicherheitssperre lediglich entfernt werden.

## Zugang für genau drei ausgegebene Test-Schreiber

Eine frische synthetische Saison mit zwölf Spielern, synthetischem 18-Loch-Kurs samt gültigen Vorgabentabellen und einer über die normale UI angelegten **9-Front-Runde** verwenden. Keine Scorecard-/Auth-Exporte aus Produktion oder aus fremden Emulatoren importieren. Die Start-Snapshots entstehen durch `createRoundStart`; keine vorab aktive Demo-Runde erzeugen.

| Smartphone | Ausgegebener Zugang | Flight | Rolle |
| --- | --- | --- | --- |
| A | MS01 | MS01–MS04 | Admin / Abschluss |
| B | MS05 | MS05–MS08 | Spielleiter |
| C | MS09 | MS09–MS12 | Spieler |

Diese Aufteilung bei der Rundenerstellung **manuell** setzen und prüfen; eine Zufallsauslosung garantiert sie nicht. Jedes Gerät schreibt nur seinen Flight. Drei Schreiber sind die Betriebsvereinbarung, keine vorhandene serverseitige Drei-Geräte-Quote.

Notwendige Zugangsvorbereitung nach Freigabe:

1. Für **alle zwölf Spieler** unabhängige zufällige sechsstellige PINs mit kryptographischer Zufallsquelle erzeugen. Nur Salt/Scrypt-Hash im privaten `spieler`-Dokument speichern; keine Klartext- oder bekannten Demo-/Initial-PINs verwenden. Ohne Hash kann der bestehende Login eine bekannte Legacy-Initial-PIN akzeptieren; deshalb darf **kein** synthetischer Spieler ohne privaten Hash online gehen.
2. Nur die drei individuellen Schreiber-PINs persönlich über einen getrennten privaten Kanal aushändigen. Keine PIN in Repository, Manifest, Screenshot, URL, Cloud-Log oder öffentlicher Anleitung. Die übrigen neun Zugänge nicht ausgeben. Niemals `rc-fixture.seed()` mit seiner bekannten lokalen Fixture-PIN für Cloud-Daten verwenden.
3. Eigene Auth-UIDs/Custom-Claims nur im Testprojekt: `uid === playerId`, korrekte Rolle, konsistenter PIN-Wechselstatus in Firestore und Claims. Public-Projektion ohne Hash oder PIN. Rollenwechsel oder Sperren müssen auch über Claims wirksam werden; echte produktive Accounts oder Identitäten nicht übernehmen.
4. Vor Hosting-Freigabe gezielt nachweisen: falsche PIN abgewiesen, bestehende Login-Fehlversuchssperre greift, bekannte Demo-/Initial-PINs scheitern bei allen zwölf Spielern, kein Zugriff ohne gültige Anmeldung, keine direkten Score-Schreibrechte, kein fremder Flight im normalen V2-Pfad. Die vorhandene Fehlversuchssperre ist kein nachgewiesener Schutz gegen alle verteilten Angriffe; die Freigabe muss die öffentliche PIN-Oberfläche bewerten.
5. Die URL ist kein Zugangsschutz, eine erlaubte Auth-Domain ebenso wenig. Firebase-Web-Konfiguration ist öffentlich; Schutz erfolgt über Auth, serverseitige Prüfungen und Rules. App Check, soweit für die gewählte Web-/Callable-Konfiguration passend, gesondert konfigurieren und gezielt prüfen; keine Debug-Tokens veröffentlichen. [Firebase zu API-Keys und Schutzgrenzen](https://firebase.google.com/docs/projects/api-keys).

Mail und Google Apps Script bleiben abgeschaltet. Keine öffentliche Selbstregistrierung, kein SMS-Versand, keine PIN-Ausgabe über E-Mail/GAS. Der Betreiber behält ein ausschließlich für dieses Testprojekt gültiges Recovery-Verfahren und widerruft nach Testende die drei Test-Sitzungen. Keine automatischen Geräte-/Pending-Löschungen.

## Bereitstellung – erst nach gesonderten Freigaben

1. **Projekt-/Kostenfreigabe:** konkrete Projekt-ID, Region, Testzeitraum, Eigentümer und Billing-Verantwortlichen bestätigen. Erst danach eigenes Cloud-/Firebase-Projekt und Billing anlegen. IAM-Vererbung prüfen: Runtime- und Bereitstellungsidentitäten erhalten keinerlei Zugriff auf Produktion. Keine produktiven Service-Account-Dateien oder Default-Credentials verwenden.
2. **Konfigurationsfreigabe:** Web-App-Werte ausschließlich aus dem neuen Testprojekt, genehmigte Origin, Auth-Domain, HTTPS-Callable-URLs, Projekt, Region und Service-Account müssen übereinstimmen. Kein Standard-Projekt-Alias. Dauerhaft sichtbarer Banner **PREPROD — SYNTHETIC TEST DATA**, eigener Storage-Namespace `preprod:<projectId>`, neue Origin und eigener Browserkontext. Legacy-Buffer nicht übernehmen, Service Worker weiterhin aus; keine Produktions-Caches migrieren.
3. **Artefaktfreigabe:** geprüften PreProd-Bootstrap, unveränderte V2-Verträge und aktuelle UI in ein getrenntes Hosting-Artefakt bündeln. Lokale Vendor-/SDK-Assets tatsächlich mitliefern: `/__vendor/…` und `/__sdk/…` werden bisher vom lokalen Server bereitgestellt und müssen im Hosting-Artefakt vorhanden sein. Keine Tests, `.env`, PIN-Hashes, Backups, Node-Module, Quell-Worktrees oder lokalen Demo-Konfigurationen veröffentlichen. CSP nur eigene Assets und notwendige Firebase-Endpunkte; kein GAS, kein produktiver Host. Der bestehende Hosting-Vorschlag ist kein bereits gebautes Release-Artefakt.
4. **Explizite Deployment-Freigabe:** Regeln, Functions und Hosting getrennt gegen den konkreten Artefakt-Digest und das Testprojekt prüfen und genehmigen. Regeln zuerst, sichere Functions mit dedizierter Runtime-Identität danach, Hosting zuletzt. Erst nach diesen Freigaben bereitstellen. Die hier vorhandenen Offline-Gates werden nicht zur Cloud-Ausführung umfunktioniert.
5. **Synthetische Initialisierung:** nur leeres Testprojekt befüllen, Hashes/Claims wie oben prüfen, keine alte Runde/Scorecards importieren. Gezielt genau einen Anmelde-/Rundenstart-/Score-/Live-Aufruf prüfen und dann die drei Geräte einladen. Bei fehlender Gerätefreigabe oder unsicheren Claims bleibt der Feldtest gesperrt.

## Einfacher Feldablauf – neun Löcher

Vor dem Losgehen alle drei Geräte über Mobilfunk auf der **genehmigten Test-URL** anmelden. Sichtbaren Testbanner, richtigen Spieler und richtigen Flight prüfen. Normale Browser-Tabs mit beständigem Speicher verwenden, keinen privaten Modus und keine Produktions-Tabs. Eine neue Seite kann offline derzeit nicht zuverlässig gestartet werden: den vorbereiteten Tab offen lassen, während Offline-Eingabe weder neu laden noch abmelden oder Browserdaten löschen.

| Zeitpunkt | Aufgabe | Erwartung |
| --- | --- | --- |
| Start | MS01 legt 9-Front an, manuelle Flights wie oben. Alle öffnen „Mein Flight“. | Zwölf Start-Snapshots, drei richtige Flights. |
| Loch1–2 | Jeder Schreiber erfasst vier synthetische Spieler. Einer betrachtet danach das Live-Scoreboard. | Bestätigte Rohscores/Netto entsprechen der Eingabe; neue Bestätigungen erscheinen ohne F5. Laufende Rangfolge ausdrücklich vorläufig. |
| Loch3 | Nur Gerät B: Flugmodus, Schläge/Putts für seine vier synthetischen Spieler ändern. | „Lokal gespeichert/offline“, keine Serverbestätigung. Andere Geräte zeigen diese Änderungen noch nicht. |
| Wieder online | Mobilfunk B aktivieren, Tab geöffnet lassen und Synchronisation abwarten. | „Serverbestätigt“, nichts ausstehend. Die Rangliste übernimmt dieselben Werte automatisch. |
| Loch4–8 | Normal fortsetzen. Bei Konflikt sofort Pause, aktuellen Serverstand vergleichen. | Kein stilles Überschreiben, keine lokale Pending-Löschung. |
| Loch9 | Alle neun Löcher für alle zwölf Spieler bestätigen. Auf jedem Gerät ausstehend0, keine Konflikte, keine unklaren Requests prüfen. | 108 Spieler-Loch-Scorecards. Gleiches Netto in Score-Eingabe, Rangliste und Rundenschluss. |
| Abschluss | MS01 öffnet Abschlussfenster. Jeder Flight prüft persönlich alle verwendeten Geräte und gibt den aktuellen Stand frei. MS01 bestätigt erst nach drei Freigaben. | Genau ein offizieller Netto-Abschluss, einmalige HCP-Fortschreibung; Brutto/Putts nicht veröffentlicht. |

Wenn Mobilfunk fehlt: Eingaben im offenen Tab belassen und später online synchronisieren. Bei Datenabweichung, unklarem Status, falschem Projektbanner, fehlendem Geräteabgleich oder Loginproblem **keinen Abschluss bestätigen**. Falls bereits ein Abschlussfenster geöffnet ist, durch die Spielleitung abbrechen, dann synchronisieren. Nicht mehrfach blind bestätigen, nicht in Produktion ausweichen, keine App-Daten löschen. Ein zweiter Schreiber desselben Flights wird nicht absichtlich für diesen einfachen Feldtest eingesetzt.

Ein einziges kurzes Protokoll genügt: Gerät/Browser, Flight, Loch, lokaler Status, bestätigter Serverwert, Live-Netto, Abschluss-Netto; Screenshots nur synthetisch und ohne PINs/Tokens. Physische Geräte, iOS-Speicherverhalten, reale Mobilfunklatenz und Hintergrundverhalten sind erst bei diesem Feldtest bestätigt.

## Kosten und Ende des Tests

Cloud Functions erfordern einen **Blaze-/Billing-Zugang**. Hosting, Firestore, Function-Aufrufe/Rechenzeit, Build-/Artefaktspeicher und ausgehender Traffic können Kosten verursachen; auch kleine Tests sind nicht pauschal kostenlos. [Firebase-Tarife](https://firebase.google.com/docs/projects/billing/firebase-pricing-plans), [aktuelle Preisliste](https://firebase.google.com/pricing/).

Die Live-Ansicht lädt derzeit zwei bestehende autoritative Leseverträge im Abstand von fünf Sekunden nach Abschluss des vorherigen Abrufs. Bei drei dauerhaft offenen Ranglisten und 30Minuten sind höchstens ungefähr **2160 Callable-Aufrufe** aus diesem Polling zu erwarten (ohne Retries, Login, Score-Sync und Abschluss). Nahe vollständiger Runde lesen diese Verträge Größenordnung 350 Dokumente pro Aktualisierung inklusive Generation-Bindings: im ungünstigen Rechenbeispiel rund **378000 Dokumentlesungen**. Das ist eine konservative Volumenrechnung, keine gemessene Cloud-Nutzung oder Kostenprognose; tatsächlich hängt es von Sichtdauer, Latenz, Datenumfang und Retries ab. Die Rangliste nur zum Beobachten offen halten und nach dem Vergleich schließen; keine unbegrenzte Test-Saison aufbauen.

Vor Freigabe Budgetverantwortlichen und beispielsweise **5€ Planungsbudget** mit Warnungen bei50/80/100% bestimmen; dies ist ein Vorschlag, keine eingerichtete Obergrenze. Alerts-only-Budgets unterbrechen Dienste nicht. Nach aktueller Firebase-Dokumentation sind servicebezogene Spend Caps unter anderem für Cloud Functions verfügbar, aber keine allgemeine Kostengarantie für Firestore/Firebase Hosting. Verfügbarkeit/Abdeckung im neuen Projekt vor Freigabe prüfen. [Budgetwarnungen und Grenzen](https://firebase.google.com/docs/projects/billing/budget-alerts).

Nach dem Feldtest zuerst alle drei Geräte online synchronisieren und protokollieren; anschließend Testzugänge widerrufen, Testhosting offline nehmen oder auf eine geschlossene Hinweisseite zurücksetzen und Functions/IAM des Testprojekts nach genehmigtem Betriebsplan sperren. Kein Rollback durch Löschen lokaler Eingaben. Synthetische Daten nur nach abgeschlossener Auswertung und gesonderter Löschentscheidung entfernen. Kein Rückfall oder Datenimport in Produktion.

## Noch ausdrücklich offen

Projekt-/Subdomain-Verfügbarkeit, Cloud-Projektanlage, Budget/IAM, PreProd-Bootstrap und Hosting-Artefakt, private Erzeugung/Verteilung der PINs, Cloud-Claims, Zugriffsprüfung, Bereitstellungsfreigabe sowie tatsächliche drei Smartphones. **Es existiert aus diesem Auftrag noch keine online nutzbare Test-URL.** Öffentliche Firebase-Dokumentation wurde gelesen; keine Projektkonsole und keine Firebase-Projektdaten wurden aufgerufen.
