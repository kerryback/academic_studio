@echo off
REM Build Academic Studio for 64-bit Windows (x64). Double-click or run from cmd.
REM Pass an edition as the first arg (default: student):  build-windows-x64.cmd faculty
setlocal
set EDITION=%1
if "%EDITION%"=="" set EDITION=student

set "GITBASH=%ProgramFiles%\Git\bin\bash.exe"
if not exist "%GITBASH%" set "GITBASH=%ProgramFiles(x86)%\Git\bin\bash.exe"
if not exist "%GITBASH%" (
  echo Could not find Git Bash. Install Git for Windows from https://git-scm.com/download/win
  pause
  exit /b 1
)

cd /d "%~dp0\.."
"%GITBASH%" -lc "ARCH=x64 ./scripts/build-windows.sh %EDITION%"
echo.
echo Done. Installer (if built) is under build-engine\assets\
pause
