@echo off
title Install Vencord + AutoAcceptQuests
echo Closing Discord...
taskkill /f /im Discord.exe >nul 2>&1
set "VENCORD_USER_DATA_DIR=%~dp0"
set "VENCORD_DEV_INSTALL=1"
"%~dp0dist\Installer\VencordInstallerCli.exe" -install -branch auto
echo.
echo Done. Open Discord, go to Settings - Vencord - Plugins, switch on AutoAcceptQuests.
echo Do NOT move or delete this folder afterwards.
pause
