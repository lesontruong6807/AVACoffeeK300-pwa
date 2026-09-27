' Script khoi chay dich vu in ngam AVA Coffee K300 hoan toan an danh (khong hien cua so den CMD)
Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

' Duong dan toi file ava-print-bridge.exe cung thu muc
currentDir = fso.GetParentFolderName(WScript.ScriptFullName)
exeFile = currentDir & "\ava-print-bridge.exe"

' Chay ngam voi windowStyle = 0 (an hoan toan)
cmd = """" & exeFile & """"
WshShell.Run cmd, 0, False
