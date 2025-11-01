@echo off

:: 1. Cambiar al directorio donde se encuentra este script (.bat)
::    (Soluciona el error de C:\Windows\System32)
cd /d %~dp0

:: 2. Verificar permisos de Administrador
::    (Soluciona el error 'EPERM' y 'EBUSY')
net session >nul 2>&1
if %errorLevel% NEQ 0 (
    echo ERROR: Este script debe ser ejecutado como Administrador.
    echo.
    echo Por favor, cierra esta ventana, haz clic derecho en el archivo .bat
    echo y selecciona "Ejecutar como administrador".
    echo.
    pause
    goto :eof
)

:: 3. Bucle del Menu
:menu
cls
echo ===========================================
echo  ADMINISTRADOR DE PROYECTO (app.js) CON PM2
echo ===========================================
echo.
echo Ubicacion actual: %cd%
echo.
echo Elige una opcion:
echo.
echo   [1] Reiniciar (Mata, borra, inicia 'mi-app' y guarda)
echo   [2] Ver Logs en vivo (de 'mi-app')
echo   [3] Detener todo (Mata el servicio y borra la lista)
echo   [4] Salir
echo.

set /p opcion="Escribe el numero (1, 2, 3 o 4) y presiona Enter: "

if "%opcion%"=="1" goto reiniciar
if "%opcion%"=="2" goto logs
if "%opcion%"=="3" goto detener
if "%opcion%"=="4" goto :eof

echo.
echo Opcion invalida. Intentalo de nuevo.
pause
goto menu

:: --- Seccion REINICIAR ---
:reiniciar
cls
echo --- [1] REINICIANDO EL PROYECTO 'mi-app' ---
echo.
echo 1. Matando el servicio de PM2 (pm2 kill)...
call pm2 kill
echo.
echo 2. Borrando todos los procesos antiguos (pm2 delete all)...
call pm2 delete all
echo.
echo 3. Iniciando 'app.js' con el nombre 'mi-app' (pm2 start)...
call pm2 start app.js --name "mi-app"
echo.
echo 4. Guardando la lista de procesos (pm2 save)...
call pm2 save
echo.
echo ----------------------------------------------------
echo  PROCESO REINICIADO Y GUARDADO CORRECTAMENTE.
echo ----------------------------------------------------
echo.
pause
goto menu

:: --- Seccion LOGS ---
:logs
cls
echo --- [2] MOSTRANDO LOGS EN VIVO PARA 'mi-app' ---
echo.
echo (Presiona CTRL+C para detener los logs y volver al menu)
echo.
call pm2 logs "mi-app"
echo.
echo (Volviendo al menu...)
timeout /t 1 >nul
goto menu

:: --- Seccion DETENER ---
:detener
cls
echo --- [3] DETENIENDO TODOS LOS SERVICIOS DE PM2 ---
echo.
echo 1. Matando el servicio de PM2 (pm2 kill)...
call pm2 kill
echo.
echo 2. Borrando todos los procesos de la lista (pm2 delete all)...
call pm2 delete all
echo.
echo ----------------------------------------------------
echo  TODOS LOS PROCESOS HAN SIDO DETENIDOS.
echo ----------------------------------------------------
echo.
pause
goto menu