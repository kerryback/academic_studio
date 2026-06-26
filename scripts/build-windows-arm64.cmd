@echo off
REM Build Academic Studio for ARM64 Windows. Double-click or run from cmd.
setlocal

set "GITBASH=%ProgramFiles%\Git\bin\bash.exe"
if not exist "%GITBASH%" set "GITBASH=%ProgramFiles(x86)%\Git\bin\bash.exe"
if not exist "%GITBASH%" (
  echo Could not find Git Bash. Install Git for Windows from https://git-scm.com/download/win
  pause
  exit /b 1
)

cd /d "%~dp0\.."
REM tee runs inside Git Bash, so the build always writes build-win.log automatically.
"%GITBASH%" -lc "set -o pipefail; ARCH=arm64 ./scripts/build-windows.sh 2>&1 | tee build-win.log"
if errorlevel 1 (
  echo.
  echo BUILD FAILED. The full log is in build-win.log -- send that file to Claude.
) else (
  echo.
  echo Build OK. App + installer are under build-engine\  ^(log: build-win.log^)
)
pause
