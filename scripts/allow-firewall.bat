@echo off
:: Batch script to add Windows Defender Firewall rule for ShareX port 7788
:: Automatically prompts for Administrator UAC if not already elevated

net session >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo Requesting Administrator privileges to add firewall rule...
    powershell -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)

echo Adding Windows Firewall rule for ShareX (Port 7788 TCP)...
netsh advfirewall firewall add rule name="ShareX" protocol=TCP dir=in localport=7788 action=allow profile=any

if %ERRORLEVEL% equ 0 (
    echo.
    echo [SUCCESS] Port 7788 is now allowed through Windows Firewall!
    echo Other devices on your Wi-Fi or hotspot can now connect.
) else (
    echo.
    echo [ERROR] Failed to add firewall rule.
)

echo.
pause
