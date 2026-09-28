@echo off
cd /d "%~dp0"
wscript.exe "%~dp0Chay-In-Ngam.vbs"
echo ========================================================
echo DICH VU IN NGAM AVA COFFEE K300 DANG CHAY AN TRONG NEN!
echo May in Wi-Fi: 192.168.1.167 : Port 9100
echo ========================================================
ping 127.0.0.1 -n 3 >nul
