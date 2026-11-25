@echo off
title Launch Pixelle Ecosystem
echo ========================================================
echo         Launching PIXELLE Companion Ecosystem
echo ========================================================

start "Pixelle Backend API" cmd /k "run_backend.bat"
timeout /t 3 /nobreak >nul

start "Pixelle Web Studio" cmd /k "run_frontend.bat"
timeout /t 3 /nobreak >nul

start "Pixelle Desktop Companion" cmd /k "run_desktop.bat"

echo.
echo All components started!
echo - Web Studio: http://localhost:5173
echo - Backend API Docs: http://localhost:8000/docs
echo - Desktop Companion: Transparent overlay active on screen
echo ========================================================
pause
