@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo Đang kích hoạt dịch vụ in ngầm AVA Coffee K300...
wscript.exe "%~dp0Chay-In-Ngam.vbs"
echo.
echo ========================================================
echo THÀNH CÔNG: Dịch vụ in ngầm đang chạy ẩn danh trong nền!
echo Máy in Wi-Fi (192.168.1.167) đã sẵn sàng nhận lệnh từ
echo điện thoại của nhân viên.
echo ========================================================
timeout /t 4 >nul
