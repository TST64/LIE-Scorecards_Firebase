' mergeAll.vbs - Fügt alle JS/CSS/HTML-Dateien zu einer .code-Datei zusammen
' Berücksichtigt Unterordner, ignoriert Punkte-Dateien/Ordner (.*), generiert eine Strukturübersicht
Option Explicit

Dim fso, currentFolder, outputFile, outputPath
Dim baseName, codeFileName
Dim ignoreFilePath, ignoreFile, ignoreDict, ignoreEntry

Set fso = CreateObject("Scripting.FileSystemObject")
Set currentFolder = fso.GetFolder(".")

baseName = fso.GetBaseName(currentFolder.Path)
codeFileName = baseName & ".code"
outputPath = currentFolder.Path & "\" & codeFileName

Set ignoreDict = CreateObject("Scripting.Dictionary")
ignoreFilePath = currentFolder.Path & "\.mergeAll.ignore"

If fso.FileExists(ignoreFilePath) Then
    Set ignoreFile = fso.OpenTextFile(ignoreFilePath, 1)
    Do Until ignoreFile.AtEndOfStream
        ignoreEntry = Trim(ignoreFile.ReadLine)
        If ignoreEntry <> "" And Left(ignoreEntry, 1) <> "#" Then
            ignoreDict.Add ignoreEntry, True
        End If
    Loop
    ignoreFile.Close
End If

Set outputFile = fso.CreateTextFile(outputPath, True)

' 1. Kopfzeile / Beschreibung schreiben
outputFile.WriteLine "======================================================================"
outputFile.WriteLine "PROJEKT-DUMP: " & baseName
outputFile.WriteLine "======================================================================"
outputFile.WriteLine "Diese Datei enthält den zusammengesetzten Quellcode des Projekts."
outputFile.WriteLine "Inhalt:"
outputFile.WriteLine "1. Eine Übersicht der Projektstruktur."
outputFile.WriteLine "2. Die einzelnen Dateiinhalte, jeweils eingeleitet durch Pfad-Tags"
outputFile.WriteLine "   der Form: ##### <relativer/pfad/zur/datei.ext>:"
outputFile.WriteLine "======================================================================"
outputFile.WriteLine ""

' 2. Projektstruktur-Baum schreiben
outputFile.WriteLine "PROJEKTSTRUKTUR:"
outputFile.WriteLine "/" & baseName
WriteDirectoryTree currentFolder, "", outputFile, ignoreDict, fso
outputFile.WriteLine ""
outputFile.WriteLine "======================================================================"
outputFile.WriteLine ""

' 3. Dateiinhalte rekursiv zusammenführen
outputFile.WriteLine "DATEIINHALTE:"
outputFile.WriteLine ""
ProcessFolderRecursively currentFolder, currentFolder.Path, outputFile, ignoreDict, fso

outputFile.Close

WScript.Echo "Projekt erfolgreich in " & codeFileName & " zusammengeführt!"

' --- FUNKTIONEN ---

' Generiert die Baumansicht der Ordner und verarbeiteten Dateien
Sub WriteDirectoryTree(folder, indent, outFile, ignoreDict, fso)
    Dim files, subFolders, item, fileExt, relPath
    Dim validFiles, validFolders
    Set validFiles = CreateObject("Scripting.Dictionary")
    Set validFolders = CreateObject("Scripting.Dictionary")

    ' Relevant/Nicht-ignorierte Dateien filtern
    For Each item In folder.Files
        relPath = GetRelativePath(currentFolder.Path, item.Path)
        fileExt = LCase(fso.GetExtensionName(item.Name))

        ' Dateien ignorieren, die mit "." beginnen
        If Left(item.Name, 1) <> "." Then
            If Not ignoreDict.Exists(item.Name) And Not ignoreDict.Exists(relPath) Then
                If item.Name <> codeFileName And item.Name <> "mergeAll.vbs" Then
                    If fileExt = "js" Or fileExt = "css" Or fileExt = "html" Then
                        validFiles.Add item, True
                    End If
                End If
            End If
        End If
    Next

    ' Nicht-ignorierte Unterordner filtern (auch Ordner mit "." am Anfang ignorieren)
    For Each item In folder.SubFolders
        relPath = GetRelativePath(currentFolder.Path, item.Path)
        If Left(item.Name, 1) <> "." Then
            If Not ignoreDict.Exists(item.Name) And Not ignoreDict.Exists(relPath) Then
                validFolders.Add item, True
            End If
        End If
    Next

    Dim totalItems, currentIndex
    totalItems = validFolders.Count + validFiles.Count
    currentIndex = 0

    ' Unterordner im Baum ausgeben
    For Each item In validFolders.Keys
        currentIndex = currentIndex + 1
        If currentIndex = totalItems Then
            outFile.WriteLine indent & "└── " & item.Name & "/"
            WriteDirectoryTree item, indent & "    ", outFile, ignoreDict, fso
        Else
            outFile.WriteLine indent & "├── " & item.Name & "/"
            WriteDirectoryTree item, indent & "│   ", outFile, ignoreDict, fso
        End If
    Next

    ' Dateien im Baum ausgeben
    For Each item In validFiles.Keys
        currentIndex = currentIndex + 1
        If currentIndex = totalItems Then
            outFile.WriteLine indent & "└── " & item.Name
        Else
            outFile.WriteLine indent & "├── " & item.Name
        End If
    Next
End Sub

' Durchläuft Ordner und Unterordner zur Inhaltsextraktion
Sub ProcessFolderRecursively(folder, rootPath, outFile, ignoreDict, fso)
    Dim file, subFolder, fileExt, relPath, fileContent

    For Each file In folder.Files
        relPath = GetRelativePath(rootPath, file.Path)

        ' Dateien ignorieren, die mit "." beginnen
        If Left(file.Name, 1) <> "." Then
            If Not ignoreDict.Exists(file.Name) And Not ignoreDict.Exists(relPath) Then
                If file.Name <> codeFileName And file.Name <> "mergeAll.vbs" Then
                    fileExt = LCase(fso.GetExtensionName(file.Name))

                    If fileExt = "js" Or fileExt = "css" Or fileExt = "html" Then
                        outFile.WriteLine "##### <" & relPath & ">:"
                        outFile.WriteLine "----------------------------------------------------------------------"

                        If file.Size > 0 Then
                            fileContent = fso.OpenTextFile(file.Path, 1).ReadAll
                            outFile.WriteLine fileContent
                        End If

                        outFile.WriteLine ""
                        outFile.WriteLine ""
                    End If
                End If
            End If
        End If
    Next

    For Each subFolder In folder.SubFolders
        relPath = GetRelativePath(rootPath, subFolder.Path)

        ' Ordner ignorieren, die mit "." beginnen
        If Left(subFolder.Name, 1) <> "." Then
            If Not ignoreDict.Exists(subFolder.Name) And Not ignoreDict.Exists(relPath) Then
                ProcessFolderRecursively subFolder, rootPath, outFile, ignoreDict, fso
            End If
        End If
    Next
End Sub

' Erstellt relativen Pfad mit vorwärtsgerichteten Slashes (posix-style)
Function GetRelativePath(basePath, fullPath)
    Dim rel
    rel = Replace(fullPath, basePath, "")
    If Left(rel, 1) = "\" Or Left(rel, 1) = "/" Then
        rel = Mid(rel, 2)
    End If
    GetRelativePath = Replace(rel, "\", "/")
End Function