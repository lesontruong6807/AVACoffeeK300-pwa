Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
currentDir = fso.GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = currentDir
exeFile = currentDir & "\ava-print-bridge.exe"
WshShell.Run """" & exeFile & """", 0, False
