' moveAll.vbs - Verschiebt alle Dateien (außer .* und .vbs/.code) in ein neues Verzeichnis
Option Explicit

Dim fso, currentFolder
Dim file, newFolderName, newFolderPath
Dim excludePatterns, i, movedCount
Dim fileExt, excludeFile

Set fso = CreateObject("Scripting.FileSystemObject")
Set currentFolder = fso.GetFolder(".")

' Ausschlussmuster definieren (OHNE führenden Punkt!)
excludePatterns = Array("vbs", "code")

' Neues Verzeichnis mit Datumsformat erstellen (MMDD_HHMM)
newFolderName = Right("0" & Month(Date), 2) & Right("0" & Day(Date), 2) & "_" & _
                Right("0" & Hour(Time), 2) & Right("0" & Minute(Time), 2)
newFolderPath = currentFolder.Path & "\" & newFolderName

' Verzeichnis erstellen
If Not fso.FolderExists(newFolderPath) Then
    fso.CreateFolder(newFolderPath)
End If

movedCount = 0

' Alle Dateien durchlaufen
For Each file In currentFolder.Files
    fileExt = LCase(fso.GetExtensionName(file.Name))
    excludeFile = False

    ' 1. Versteckte Dateien (starten mit ".") ausschließen
    If Left(file.Name, 1) = "." Then
        excludeFile = True
    Else
        ' 2. Dateiendungen aus der Liste ausschließen
        For i = 0 To UBound(excludePatterns)
            If fileExt = excludePatterns(i) Then
                excludeFile = True
                Exit For
            End If
        Next
    End If

    ' Datei verschieben, wenn nicht ausgeschlossen
    If Not excludeFile Then
        file.Move newFolderPath & "\" & file.Name
        movedCount = movedCount + 1
    End If
Next

' Eine einzige Abschlussmeldung am Ende
WScript.Echo movedCount & " Datei(en) erfolgreich in den Ordner '" & newFolderName & "' verschoben."