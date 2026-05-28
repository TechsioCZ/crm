@echo off
setlocal EnableExtensions EnableDelayedExpansion
title CRM MVP - Start

set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"
set "BACKEND_DIR=%ROOT%\backend"
set "FRONTEND_DIR=%ROOT%\frontend"

echo.
echo ==========================================
echo   CRM MVP Launcher
echo ==========================================
echo Root: %ROOT%
echo.

if not exist "%BACKEND_DIR%\package.json" (
  echo [ERROR] Missing backend\package.json
  echo [HINT] Run this script from project root.
  pause
  exit /b 1
)

if not exist "%FRONTEND_DIR%\package.json" (
  echo [ERROR] Missing frontend\package.json
  echo [HINT] Run this script from project root.
  pause
  exit /b 1
)

where npm.cmd >nul 2>nul
if errorlevel 1 (
  echo [ERROR] npm.cmd was not found in PATH.
  echo [HINT] Reinstall Node.js or restart terminal after install.
  pause
  exit /b 1
)

call :ensure_node_modules "%BACKEND_DIR%" "backend"
if errorlevel 1 exit /b 1

call :ensure_node_modules "%FRONTEND_DIR%" "frontend"
if errorlevel 1 exit /b 1

call :is_port_listening 4000
if errorlevel 1 (
  set "BACKEND_ALREADY_RUNNING=0"
  call :prepare_backend "%BACKEND_DIR%"
  if errorlevel 1 exit /b 1
  echo [START] Starting backend on port 4000...
  start "CRM Backend" cmd /k "cd /d ""%BACKEND_DIR%"" && npm.cmd run dev"
) else (
  set "BACKEND_ALREADY_RUNNING=1"
  echo [OK] Backend already running on port 4000.
  echo [INFO] Skipping Prisma prepare because backend is already running.
)

call :is_port_listening 5173
if errorlevel 1 (
  echo [START] Starting frontend on port 5173...
  start "CRM Frontend" cmd /k "cd /d ""%FRONTEND_DIR%"" && npm.cmd run dev -- --host 127.0.0.1 --port 5173"
) else (
  echo [OK] Frontend already running on port 5173.
)

call :wait_for_port 4000 60
if errorlevel 1 (
  echo [WARN] Backend did not start on port 4000 within 60 seconds.
) else (
  echo [OK] Backend is listening on port 4000.
)

call :wait_for_port 5173 60
if errorlevel 1 (
  echo [WARN] Frontend did not start on port 5173 within 60 seconds.
) else (
  echo [OK] Frontend is listening on port 5173.
)

echo.
echo [OPEN] Launching browser...
start "" "http://127.0.0.1:5173/"

echo.
echo Login credentials:
echo - admin@crm.local / Admin123^^!
echo - novak@crm.local / Sales123^^!
echo - svoboda@crm.local / Sales123^^!
echo.
echo To stop the app, run: Stop-CRM.cmd
echo.
exit /b 0

:prepare_backend
set "TARGET_DIR=%~1"
echo [SETUP] Preparing backend database and Prisma client...
pushd "%TARGET_DIR%" >nul
call npx.cmd prisma migrate deploy
if errorlevel 1 (
  popd >nul
  echo [ERROR] Prisma migrate deploy failed.
  pause
  exit /b 1
)
call npm.cmd run prisma:generate
if errorlevel 1 (
  popd >nul
  echo [ERROR] Prisma generate failed.
  pause
  exit /b 1
)
popd >nul
echo [OK] Backend Prisma setup completed.
exit /b 0

:ensure_node_modules
set "TARGET_DIR=%~1"
set "TARGET_NAME=%~2"
if exist "%TARGET_DIR%\node_modules" (
  echo [OK] Dependencies ready for %TARGET_NAME%.
  exit /b 0
)

echo [SETUP] Installing dependencies for %TARGET_NAME%...
pushd "%TARGET_DIR%" >nul
call npm.cmd install
set "INSTALL_RC=%ERRORLEVEL%"
popd >nul

if not "%INSTALL_RC%"=="0" (
  echo [ERROR] npm install failed for %TARGET_NAME%.
  pause
  exit /b 1
)

echo [OK] Dependencies installed for %TARGET_NAME%.
exit /b 0

:is_port_listening
set "PORT=%~1"
powershell -NoProfile -Command "if (Get-NetTCPConnection -State Listen -LocalPort %PORT% -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }" >nul 2>nul
exit /b %ERRORLEVEL%

:wait_for_port
set "WAIT_PORT=%~1"
set "MAX_SECONDS=%~2"
set /a "ELAPSED=0"

:wait_loop
call :is_port_listening %WAIT_PORT%
if "%ERRORLEVEL%"=="0" exit /b 0

if !ELAPSED! GEQ !MAX_SECONDS! exit /b 1
set /a "ELAPSED+=1"
timeout /t 1 /nobreak >nul
goto :wait_loop
