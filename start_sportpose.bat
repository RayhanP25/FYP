@echo off
REM Double-click to start SportPose. The server and the app each open in their own window (leave both
REM open while you use SportPose), then the browser opens at http://localhost:5173.
REM To stop SportPose, close the two windows.
title SportPose
set "ROOT=%~dp0"

if not exist "%ROOT%backend\.venv\Scripts\activate.bat" (
    echo The server is not installed on this PC yet: backend\.venv is missing.
    echo See README.md, step 3.
    pause
    exit /b 1
)
if not exist "%ROOT%frontend\node_modules" (
    echo The app is not installed on this PC yet: frontend\node_modules is missing.
    echo See README.md, step 5.
    pause
    exit /b 1
)

start "SportPose server - leave open" /D "%ROOT%backend" cmd /k "call .venv\Scripts\activate.bat && uvicorn app:app --host 0.0.0.0 --port 8000"
start "SportPose app - leave open" /D "%ROOT%frontend" cmd /k "npm run dev"

echo Starting SportPose. The browser opens when the server is ready (up to 2 minutes)...
set /a tries=0
:wait
timeout /t 3 /nobreak >nul
set /a tries+=1
curl -s -o nul http://localhost:8000/api/ping && goto ready
if %tries% lss 40 goto wait
echo The server did not start. Look at the "SportPose server" window for the error.
pause
exit /b 1

:ready
start "" http://localhost:5173
exit /b 0
