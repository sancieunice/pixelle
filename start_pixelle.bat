@echo off
title Launch Pixelle Ecosystem
echo ========================================================
echo         Launching PIXELLE Companion Ecosystem
echo ========================================================

start "Pixelle Backend API" cmd /k "cd /d "%~dp0backend" && call "venv\Scripts\activate.bat" && python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload"
timeout /t 3 /nobreak >nul

start "Pixelle Web Studio" cmd /k "cd /d "%~dp0frontend" && npm run dev"
timeout /t 3 /nobreak >nul

start "Pixelle Desktop Companion" cmd /k "set "ELECTRON_RUN_AS_NODE=" && cd /d "%~dp0desktop" && npm start"

echo.
echo All components started!
echo - Web Studio: http://localhost:5173
echo - Backend API Docs: http://localhost:8000/docs
echo - Desktop Companion: Transparent overlay active on screen
echo ========================================================
pause
