@echo off
chcp 65001 >nul
echo Đang tắt máy chủ in ngầm AVA Coffee K300...
taskkill /f /im ava-print-bridge.exe >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3333 ^| findstr LISTENING') do (
    taskkill /f /pid %%a >nul 2>&1
)
echo.
echo ========================================================
echo Đã dừng máy chủ in ngầm trên cổng 3333 thành công.
echo ========================================================
pause
