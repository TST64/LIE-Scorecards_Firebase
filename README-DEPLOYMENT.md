# LIE Scorecard 5.2.0 – Custom-Token-Authentifizierung

Diese Version basiert auf dem gelieferten Projekt-Dump und ersetzt die zuvor vorbereitete anonyme Firebase-Anmeldung.

## Bedienung

Für die Mitglieder bleibt alles unverändert:

1. Namen auswählen
2. PIN eingeben
3. fertig

## Technischer Ablauf

1. Vor dem Login ruft das Frontend `getLoginPlayers` auf. Die Cloud Function liefert nur ID, Nickname und Name.
2. Beim Login sendet das Frontend Spieler-ID und PIN an `verifyPlayerPin`.
3. Die PIN wird ausschließlich serverseitig geprüft.
4. Nur bei korrekter PIN erzeugt Firebase Admin ein Custom Token mit Spieler-ID und Rolle.
5. Das Frontend meldet sich mit `signInWithCustomToken()` bei Firebase Authentication an.
6. Erst danach erlauben die Firestore-Regeln den Zugriff auf die App-Daten.

**Anonymous Authentication muss NICHT aktiviert werden.**

## Vor dem Deployment

- Bestehende produktive App sichern.
- Den bisherigen `img`-Ordner ergänzen; Bilddateien waren nicht Bestandteil des Projekt-Dumps.
- Node.js und Firebase CLI installieren.
- `firebase login` ausführen.
- Im Projektordner mit `firebase use` prüfen, dass `liescorecard-70c5e` aktiv ist.

## Functions vorbereiten

```powershell
cd functions
npm install
cd ..
```

## Empfohlene Deployment-Reihenfolge

Zuerst die Functions:

```powershell
firebase deploy --only functions
```

Erst wenn das erfolgreich war, das neue Frontend auf den bisherigen App-Host bringen. Danach die Firestore-Regeln deployen:

```powershell
firebase deploy --only firestore:rules
```

Das getrennte Vorgehen verhindert, dass die produktive App durch neue Regeln ausgesperrt wird, bevor die neue Anmeldung verfügbar ist.

## Bestehende PINs

Bestehende Klartext-PINs werden beim ersten erfolgreichen Login in einen scrypt-Hash umgewandelt und das Klartextfeld wird gelöscht. Wenn bei einem Altbestand keine PIN vorhanden ist, akzeptiert die Migrationslogik einmalig `0000` und verlangt anschließend eine neue PIN.

## Temporärer PIN per E-Mail

`requestTempPin` erzeugt den Code serverseitig, speichert nur den Hash und verwendet weiterhin das bestehende Google-Apps-Script für den Versand.

## Wichtiger Hinweis zu Cloud Functions

Cloud Functions können je nach Firebase/Google-Cloud-Konfiguration einen abrechnungsfähigen Plan bzw. ein verknüpftes Abrechnungskonto erfordern. Prüfe die Firebase-Konsole, bevor du Functions deployest.

## Rechtliches

`impressum.html` und `datenschutz.html` sind enthalten. Die Texte sind für den beschriebenen privaten Betrieb vorbereitet und ersetzen keine individuelle Rechtsberatung.
