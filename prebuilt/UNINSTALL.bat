@echo off
taskkill /f /im Discord.exe >nul 2>&1
set "VENCORD_USER_DATA_DIR=%~dp0"
set "VENCORD_DEV_INSTALL=1"
"%~dp0dist\Installer\VencordInstallerCli.exe" -uninstall -branch auto
pause
