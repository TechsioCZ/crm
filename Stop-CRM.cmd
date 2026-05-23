@echo off
setlocal EnableExtensions
title CRM MVP - Stop

echo.
echo ==========================================
echo   CRM MVP Stopper
echo ==========================================
echo.

set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"

echo [INFO] Stopping CRM backend/frontend node processes...
powershell -NoProfile -Command ^
  "$root = '%ROOT%';" ^
  "$procs = Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -and $_.CommandLine -match [Regex]::Escape($root) };" ^
  "if (-not $procs) { Write-Output '[OK] No CRM node processes found.'; exit 0 };" ^
  "$procs | ForEach-Object { Write-Output ('Stopping PID ' + $_.ProcessId); Stop-Process -Id $_.ProcessId -Force };" ^
  "Write-Output '[OK] CRM processes stopped.'"

echo.
echo [DONE] You can close this window.
echo.
exit /b 0
