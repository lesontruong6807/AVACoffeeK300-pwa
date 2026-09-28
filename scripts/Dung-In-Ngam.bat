@echo off
cd /d "%~dp0"
echo Dang tat may chu in ngam AVA Coffee K300...
taskkill /f /im ava-print-bridge.exe >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3333 ^| findstr LISTENING') do (
    taskkill /f /pid %%a >nul 2>&1
)
echo.
echo ========================================================
echo Da dung may chu in ngam tren cong 3333 thanh cong.
echo ========================================================
pause
