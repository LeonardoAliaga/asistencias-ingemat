@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
  echo Instala Node.js 24 LTS o 26 LTS y vuelve a abrir esta ventana.
  pause
  exit /b 1
)
if not exist "node_modules" (
  echo Primero ejecuta npm ci. Consulta README.md para configurar Python y WhatsApp.
  pause
  exit /b 1
)
where pm2 >nul 2>&1
if errorlevel 1 (
  echo PM2 no esta instalado. La app se iniciara con Node; manten esta ventana abierta.
  node app.js
) else (
  if not exist "data\logs" mkdir "data\logs"
  call pm2 startOrReload ecosystem.config.cjs --only ingemat
  if errorlevel 1 exit /b 1
  call pm2 save
  echo INGEMAT iniciado. Usa pm2 logs ingemat para consultar el registro.
)
pause
