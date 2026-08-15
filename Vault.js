/**
 * Sichert alle beendeten Runden serialisiert in ein separates Vault-Spreadsheet
 */
function syncToVault()
{
    try
    {
        // 1. Vault Spreadsheet öffnen (ID/URL in Script-Properties hinterlegen oder hier eintragen)
        const props = PropertiesService.getScriptProperties();
        const vaultUrl = props.getProperty("ssVault");
        if (!vaultUrl) return { success: false, error: "Script-Property 'ssVault' fehlt!" };
        
        const ssVault = SpreadsheetApp.openByUrl(vaultUrl);
        let tVault = ssVault.getSheetByName("Vault_Data");
        
        // Falls das Blatt noch nicht existiert, anlegen und Header schreiben
        if (!tVault)
        {
            tVault = ssVault.insertSheet("Vault_Data");
            tVault.appendRow([
                "spieltagId", "datum", "jahr", "monat", "kursName", 
                "spielerId", "spielerName", "flightSeq", "loch", "par", 
                "si", "vorgabeLoch", "strokes", "nettoPunkte", "puts", 
                "lady", "maxscore", "status", "syncedAt"
            ]);
        }

        // 2. Quelldaten aus der App holen
        const initData = getInitialAppData();
        if (!initData.success) return initData;

        const { spieltage, scoreCards, spieler, kurse, bahnen } = initData;

        // Nur beendete und nicht gelöschte Spieltage sichern
        const beendeteSpieltage = spieltage.filter(st => {
            const isDel = st.istGeloescht === true || String(st.istGeloescht).toUpperCase() === "TRUE";
            return st.status === "Beendet" && !isDel;
        });

        if (beendeteSpieltage.length === 0)
        {
            return { success: true, message: "Keine beendeten Runden zum Sichern vorhanden." };
        }

        // 3. Bestehende Daten im Vault einlesen (für überschreibungsfreie Upserts)
        const existingVaultData = tVault.getDataRange().getValues();
        const existingMap = {}; // Key: "spieltagId_spielerId_loch" -> Zeilenindex
        for (let i = 1; i < existingVaultData.length; i++)
        {
            const key = `${existingVaultData[i][0]}_${existingVaultData[i][5]}_${existingVaultData[i][8]}`;
            existingMap[key] = i + 1; // 1-basierte Zeile
        }

        const nowStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss");
        const rowsToAppend = [];

        // 4. Daten zusammenstellen & serialisieren
        beendeteSpieltage.forEach(st => {
            const d = new Date(st.date);
            const jahr = d.getFullYear();
            const monat = d.getMonth() + 1;
            
            const kurs = kurse.find(k => String(k.id).trim() === String(st.kursId).trim());
            const kursName = kurs ? kurs.name : "Unbekannt";
            const kursBahnen = bahnen.filter(b => String(b.kursId).trim() === String(st.kursId).trim());

            const rundenScores = scoreCards.filter(sc => String(sc.spieltagId).trim() === String(st.id).trim());

            rundenScores.forEach(sc => {
                const sp = spieler.find(s => String(s.id).trim() === String(sc.spielerId).trim());
                const bahn = kursBahnen.find(b => parseInt(b.nr) === parseInt(sc.hole)) || { par: 4, si: 10 };
                
                // --- KORREKTUR: Vorgabe direkt serverseitig berechnen ---
                let vorgabeLoch = calculateServerHoleVorgabe(sp, bahn.si);
                let nettoPkt = 0;
                
                if (sc.strokes > 0)
                {
                    let persoenlichesPar = parseInt(bahn.par) + parseInt(vorgabeLoch);
                    nettoPkt = Math.max(0, 2 + (persoenlichesPar - parseInt(sc.strokes)));
                }

                const vaultKey = `${st.id}_${sc.spielerId}_${sc.hole}`;
                const rowData = [
                    st.id, st.date, jahr, monat, kursName,
                    sc.spielerId, sp ? (sp.nickname || sp.name) : sc.spielerId, sc.flightSeq || 1, sc.hole, bahn.par,
                    bahn.si, vorgabeLoch, sc.strokes, nettoPkt, sc.puts || 2,
                    sc.lady ? "TRUE" : "FALSE", sc.maxscore ? "TRUE" : "FALSE", st.status, nowStr
                ];

                if (existingMap[vaultKey])
                {
                    // Zeile im Vault aktualisieren
                    tVault.getRange(existingMap[vaultKey], 1, 1, rowData.length).setValues([rowData]);
                }
                else
                {
                    // Neue Zeile vormerken
                    rowsToAppend.push(rowData);
                }
            });
        });

        if (rowsToAppend.length > 0)
        {
            const lastRow = tVault.getLastRow();
            tVault.getRange(lastRow + 1, 1, rowsToAppend.length, rowsToAppend[0].length).setValues(rowsToAppend);
        }

        SpreadsheetApp.flush();
        Logger.log("vaultSync: Erfolg " + rowsToAppend.length.toString() + " Zeilen hinzugefügt");
        return { success: true, count: rowsToAppend.length };
    }
    catch (err)
    {
        Logger.log("vaultSync: Fehler " + err.toString());
        return { success: false, error: err.toString() };
    }
}

/**
 * Serverseitige Hilfsfunktion zur Vorgaben-Berechnung pro Loch
 */
function calculateServerHoleVorgabe(spieler, strokeIndex)
{
    if (!spieler || !spieler.hcp) return 0;
    
    // Spielvorgabe (SpV) ermitteln/runden
    const hcp = parseFloat(spieler.hcp) || 0;
    const si = parseInt(strokeIndex) || 18;
    
    // Grund-Vorgabe pro Loch (z. B. bei SpV 18 -> jedes Loch 1 Schuss extra)
    let extraStrokes = Math.floor(hcp / 18);
    let remainder = hcp % 18;
    
    if (si <= remainder)
    {
        extraStrokes += 1;
    }
    
    return extraStrokes;
}
