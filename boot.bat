@echo off
setlocal
cd /d "%~dp0"
if not exist "data\logs" mkdir "data\logs"
call pm2 startOrReload ecosystem.config.cjs --only ingemat >> data\logs\boot.log 2>&1
if errorlevel 1 exit /b 1
call pm2 save >> data\logs\boot.log 2>&1
