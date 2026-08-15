' splittAll.vbs - Teilt eine .code-Datei in einzelne Dateien auf
Option Explicit

Dim fso, currentFolder, inputFile, outputFolder
Dim line, fileName, fileExt, filePath
Dim inFileSection, currentContent

' Dateisystemobjekt erstellen
Set fso = CreateObject("Scripting.FileSystemObject")

' Aktuelles Verzeichnis ermitteln
Set currentFolder = fso.GetFolder(".")

' Eingabedatei abfragen
inputFile = InputBox("Geben Sie den Namen der .code-Datei ein:", "Datei auswählen", "*.code")

' Datei existiert?
If Not fso.FileExists(inputFile) Then
    WScript.Echo "Fehler: Die Datei '" & inputFile & "' existiert nicht."
    WScript.Quit(1)
End If

' Dateiinhalt einlesen
currentContent = fso.OpenTextFile(inputFile, 1).ReadAll

' Alle Zeilen durchlaufen
Dim lines, line
lines = Split(currentContent, vbCrLf)

inFileSection = False
currentContent = ""

For Each line In lines
    ' Prüfen, ob eine neue Datei beginnt
    If InStr(line, "##### <") > 0 And InStr(line, ">") > 0 Then
        ' Vorherige Datei speichern, falls vorhanden
        If inFileSection And currentContent <> "" Then
            fso.CreateTextFile(filePath, True).Write currentContent
            WScript.Echo "Datei erstellt: " & filePath
        End If

        ' Neue Datei extrahieren
        fileName = Mid(line, InStr(line, "##### <") + 9)
        fileName = Left(fileName, InStr(fileName, ">") - 1)

        ' Dateiendung extrahieren
        fileExt = fso.GetExtensionName(fileName)

        ' Dateipfad erstellen
        filePath = currentFolder.Path & "\" & fileName

        ' Status für nächste Datei setzen
        inFileSection = True
        currentContent = ""
    Else
        ' Inhalt zur aktuellen Datei hinzufügen
        If inFileSection Then
            currentContent = currentContent & line & vbCrLf
        End If
    End If
Next

' Letzte Datei speichern
If inFileSection And currentContent <> "" Then
    fso.CreateTextFile(filePath, True).Write currentContent
    WScript.Echo "Datei erstellt: " & filePath
End If

WScript.Echo "Die Datei wurde erfolgreich aufgeteilt."