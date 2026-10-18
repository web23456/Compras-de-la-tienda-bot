@echo off
title Compras de la Tienda - Bot Karel
color 0b
echo =======================================================
echo          COMPRAS DE LA TIENDA - INICIANDO BOT
echo =======================================================
echo Conectando con GitHub API (web23456/Compras-de-la-tienda)...
echo.
cd /d "%~dp0"
if not exist node_modules (
  echo Instalando dependencias de Node.js por primera vez...
  call npm install
)
echo.
echo Abriendo aplicacion en el navegador...
start http://localhost:3060
echo Servidor en ejecucion en el puerto 3060...
node server.js
pause
