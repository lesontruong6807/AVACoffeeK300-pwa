@echo off
chcp 65001 >nul
echo Đang thiết lập dịch vụ in ngầm tự động chạy khi bật máy tính POS...
set "SCRIPT_DIR=%~dp0"
set "VBS_PATH=%SCRIPT_DIR%Chay-In-Ngam.vbs"
set "STARTUP_FOLDER=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"

set "SHORTCUT_PATH=%STARTUP_FOLDER%\AVACoffeePrintBridge.lnk"

powershell -NoProfile -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut('%SHORTCUT_PATH%'); $s.TargetPath = 'wscript.exe'; $s.Arguments = '\"%VBS_PATH%\"'; $s.WorkingDirectory = '%SCRIPT_DIR%'; $s.Save()"

if exist "%SHORTCUT_PATH%" (
    echo ========================================================
    echo THÀNH CÔNG: Dịch vụ in ngầm AVA Coffee K300 đã được thêm
    echo vào thư mục Startup của Windows.
    echo Từ nay, mỗi khi bật máy tính POS, dịch vụ in sẽ tự động
    echo chạy ngầm để nhận lệnh in từ điện thoại của nhân viên!
    echo ========================================================
) else (
    echo [Lỗi] Không thể tạo shortcut trong thư mục Startup.
)
pause
