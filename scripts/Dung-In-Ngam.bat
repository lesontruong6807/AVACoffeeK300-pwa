@echo off
chcp 65001 >nul
echo Đang tắt máy chủ in ngầm AVA Coffee...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3333 ^| findstr LISTENING') do (
    taskkill /f /pid %%a >nul 2>&1
)
echo Đã dừng máy chủ in ngầm trên cổng 3333 thành công.
pause
