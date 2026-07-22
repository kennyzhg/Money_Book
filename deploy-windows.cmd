@echo off
chcp 65001 >nul 2>&1

rem ============================================================
rem  Money Tracker - Windows Deployment Launcher
rem  Double-click to run: auto-elevate + bypass ExecutionPolicy
rem  For custom args, run .ps1 directly:
rem    powershell -ExecutionPolicy Bypass -File deploy-windows.ps1 -Port 8080
rem ============================================================

set "SCRIPT_DIR=%~dp0"
set "PS_SCRIPT=%SCRIPT_DIR%deploy-windows.ps1"

if not exist "%PS_SCRIPT%" (
    echo [ERROR] deploy-windows.ps1 not found in:
    echo   %PS_SCRIPT%
    echo.
    echo Please ensure deploy-windows.cmd and deploy-windows.ps1
    echo are in the same directory.
    pause
    exit /b 1
)

rem ---- Check admin privileges ----
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [INFO] Elevating to administrator (UAC prompt will appear)...
    powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)

rem ---- Already admin, run deployment ----
echo [INFO] Running as administrator
echo ============================================================
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%PS_SCRIPT%" %*
set "EXITCODE=%errorlevel%"

echo.
echo ============================================================
echo  Deploy finished. Exit code: %EXITCODE%
echo ============================================================
echo.
echo Press any key to close...
pause >nul
exit /b %EXITCODE%
