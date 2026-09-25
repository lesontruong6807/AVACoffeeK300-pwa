@echo off
chcp 65001 >nul
echo ========================================================
echo   AVA COFFEE K300 - BUILD DESKTOP WINDOWS POS (TAURI v2)
echo   Target: May POS CPOS 603 (Windows 10 64-bit)
echo ========================================================

REM Kiem tra link.exe (C++ Build Tools)
where link.exe >nul 2>nul
if %errorlevel% neq 0 (
    echo.
    echo [!] Chu y: He thong chua tim thay link.exe cua Visual C++ Build Tools.
    echo [!] Dang mo trinh cai dat Microsoft Visual C++ Build Tools...
    echo     (Vui long tich chon muc: "Desktop development with C++" / "Phat trien cho may tinh de ban voi C++")
    echo.
    start https://aka.ms/vs/17/release/vs_BuildTools.exe
    pause
)

echo.
echo [1/3] Dang bien dich Frontend Next.js sang thu muc out/...
call npm run build
if %errorlevel% neq 0 (
    echo [X] Loi khi bien dich Next.js Frontend.
    pause
    exit /b 1
)

echo.
echo [2/3] Dang dong bo icon logo AVA Coffee vao src-tauri/icons/...
call npx tauri icon "public/logo.jpg" -o "src-tauri/icons"

echo.
echo [3/3] Dang dong goi file .exe va bo cai .msi bang Tauri v2...
call npx tauri build
if %errorlevel% neq 0 (
    echo [X] Loi dong goi Tauri v2.
    pause
    exit /b 1
)

echo.
echo ========================================================
echo   [THANH CONG 100%] DA DONG GOI UNG DUNG DESKTOP POS!
echo   File cai dat .exe / .msi nam tai thu muc:
echo   src-tauri\target\release\bundle\
echo ========================================================
pause
