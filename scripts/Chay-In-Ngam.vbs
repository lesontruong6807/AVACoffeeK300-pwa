' Script khởi chạy dịch vụ in ngầm AVA Coffee K300 hoàn toàn ẩn danh (không hiện cửa sổ đen CMD)
Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

' Đường dẫn tới file ava-print-bridge.js cùng thư mục
currentDir = fso.GetParentFolderName(WScript.ScriptFullName)
jsFile = currentDir & "\ava-print-bridge.js"

' Chạy ngầm với windowStyle = 0 (ẩn hoàn toàn)
cmd = "node """ & jsFile & """"
WshShell.Run cmd, 0, False
