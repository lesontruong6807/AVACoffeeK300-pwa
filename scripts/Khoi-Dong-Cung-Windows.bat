@echo off
cd /d "%~dp0"
echo Dang thiet lap dich vu in tu dong khoi dong cung Windows...
set "SCRIPT_DIR=%~dp0"
set "VBS_PATH=%SCRIPT_DIR%Chay-In-Ngam.vbs"
set "STARTUP_FOLDER=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "SHORTCUT_PATH=%STARTUP_FOLDER%\AVACoffeePrintBridge.lnk"

powershell -NoProfile -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut('%SHORTCUT_PATH%'); $s.TargetPath = 'wscript.exe'; $s.Arguments = '\"%VBS_PATH%\"'; $s.WorkingDirectory = '%SCRIPT_DIR%'; $s.Save()"

if exist "%SHORTCUT_PATH%" (
    echo ========================================================
    echo THANH CONG: Da them dich vu in vao thu muc Startup.
    echo Tu nay moi khi bat may POS, dich vu in se tu dong chay!
    echo ========================================================
) else (
    echo [Loi] Khong the tao shortcut trong thu muc Startup.
)
pause
