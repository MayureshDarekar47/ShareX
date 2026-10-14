@echo off
chcp 65001 >nul
title ShareX - Local File Sharing
setlocal enabledelayedexpansion

for %%I in ("%~dp0..") do set "ROOT=%%~fI"
set "BACKEND=%ROOT%\backend"
set "FRONTEND=%ROOT%\frontend"

echo.
echo  ShareX - Local File Sharing
echo  ============================
echo.

:: Check Node.js
where node >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo  ERROR: Node.js is not installed.
    echo  Download from: https://nodejs.org/
    pause
    exit /b 1
)

:: Install backend deps if missing
if not exist "%BACKEND%\node_modules" (
    echo  Installing backend dependencies...
    pushd "%BACKEND%"
    call npm install
    popd
    echo.
)

:: Build backend if dist is missing
if not exist "%BACKEND%\dist\server.js" (
    echo  Building backend...
    pushd "%BACKEND%"
    call npm run build
    popd
    echo.
)

:: Build frontend if dist is missing
if not exist "%FRONTEND%\dist\index.html" (
    echo  Building frontend...
    if not exist "%FRONTEND%\node_modules" (
        pushd "%FRONTEND%"
        call npm install
        popd
    )
    pushd "%FRONTEND%"
    call npm run build
    popd
    echo.
)

:: Auto-configure Windows Firewall if running elevated
net session >nul 2>&1
if %ERRORLEVEL% equ 0 (
    netsh advfirewall firewall show rule name="ShareX" >nul 2>&1
    if !ERRORLEVEL! neq 0 (
        echo  Configuring Windows Firewall for port 7788...
        netsh advfirewall firewall add rule name="ShareX" protocol=TCP dir=in localport=7788 action=allow profile=any >nul 2>&1
        echo  [OK] Firewall rule created.
        echo.
    )
) else (
    echo  Tip: If mobile devices cannot connect, double-click scripts\allow-firewall.bat
    echo.
)
echo  Starting ShareX server...
echo  Open http://localhost:7788 in your browser.
echo.

:: Start server
pushd "%BACKEND%"
node dist\server.js
popd
