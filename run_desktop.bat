@echo off
title Pixelle Desktop Companion
echo Launching Pixelle Desktop Companion overlay...
set "ELECTRON_RUN_AS_NODE="
cd /d "%~dp0desktop"
npm start
