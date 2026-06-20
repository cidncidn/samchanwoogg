@echo off
setlocal
cd /d "%~dp0"
title Last Bastion Launcher

rem Reuse a running server if one is already up.
call :probe
if "%SERVER_UP%"=="1" goto open

where npx >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js not found. Install LTS from https://nodejs.org and run again.
  pause
  exit /b 1
)

echo Starting game server (minimized window)...
start "castle-defense-server" /min cmd /c "npx vite --port 5173 --strictPort"

set /a TRIES=0
:wait
call :probe
if "%SERVER_UP%"=="1" goto open
set /a TRIES+=1
if %TRIES% geq 20 goto fail
timeout /t 1 /nobreak >nul
goto wait

:open
echo Opening game: http://localhost:5173
start "" "http://localhost:5173"
timeout /t 2 >nul
exit /b 0

:fail
echo.
echo [ERROR] Server did not respond within 20 seconds.
echo Check the minimized "castle-defense-server" window for errors,
echo or run "npm run dev" in this folder to see details.
pause
exit /b 1

:probe
set SERVER_UP=0
powershell -NoProfile -Command "try { $r = Invoke-WebRequest -Uri 'http://localhost:5173' -UseBasicParsing -TimeoutSec 2; if ($r.StatusCode -eq 200) { exit 0 } else { exit 1 } } catch { exit 1 }" >nul 2>&1
if not errorlevel 1 set SERVER_UP=1
exit /b 0
