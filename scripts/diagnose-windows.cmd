@echo off
REM Gather Windows build diagnostics. Double-click this, then send diagnose-win.log to Claude.
setlocal

set "GITBASH=%ProgramFiles%\Git\bin\bash.exe"
if not exist "%GITBASH%" set "GITBASH=%ProgramFiles(x86)%\Git\bin\bash.exe"
if not exist "%GITBASH%" (
  echo Could not find Git Bash. Install Git for Windows from https://git-scm.com/download/win
  pause
  exit /b 1
)

cd /d "%~dp0\.."
"%GITBASH%" -lc "./scripts/diagnose-windows.sh"
echo.
echo ============================================================
echo  Diagnostics saved to:  diagnose-win.log
echo  Send that file to Claude.
echo ============================================================
pause
