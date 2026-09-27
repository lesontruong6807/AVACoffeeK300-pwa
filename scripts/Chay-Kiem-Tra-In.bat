@echo off
chcp 65001 >nul
title AVA Coffee K300 - Máy Chủ In Wi-Fi
cd /d "%~dp0"
ava-print-bridge.exe
pause
