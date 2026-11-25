@echo off
title Pixelle Web Studio
echo Starting Pixelle Web Studio on http://localhost:5173 ...
cd /d "%~dp0frontend"
npm run dev
pause
