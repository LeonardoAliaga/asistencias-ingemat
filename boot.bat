@echo off

:: Cambia al directorio donde se encuentra este script
cd /d %~dp0

:: Añade una marca de tiempo a un log para saber que se ejecuto
echo Inicio automatico ejecutado el %date% a las %time% >> boot_log.txt

:: Ejecuta los comandos de reinicio
call pm2 kill >> boot_log.txt 2>&1
call pm2 delete all >> boot_log.txt 2>&1
call pm2 start app.js --name "mi-app" >> boot_log.txt 2>&1
call pm2 save >> boot_log.txt 2>&1

echo. >> boot_log.txt