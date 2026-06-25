@echo off
REM Build Academic Studio for ARM64 Windows. Double-click or run from cmd.
REM Pass an edition as the first arg (default: student):  build-windows-arm64.cmd faculty
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
"%GITBASH%" -lc "ARCH=arm64 ./scripts/build-windows.sh %EDITION%"
if errorlevel 1 (
  echo.
  echo BUILD FAILED. Scroll up for the error, or re-run capturing a log:
  echo   "%GITBASH%" -lc "ARCH=arm64 ./scripts/build-windows.sh %EDITION% 2>&1 | tee build-win.log"
) else (
  echo.
  echo Build OK. App folder + installer are under build-engine\
)
pause
