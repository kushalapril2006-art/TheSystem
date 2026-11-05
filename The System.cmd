@echo off
setlocal
set "SYSTEM_ENTRY=%~dp0app\index.html"
if not exist "%SYSTEM_ENTRY%" (
    echo Extract the entire ZIP before opening The System.
    pause
    exit /b 1
)

set "SYSTEM_EDGE="
if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" set "SYSTEM_EDGE=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not defined SYSTEM_EDGE if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" set "SYSTEM_EDGE=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
if not defined SYSTEM_EDGE if exist "%LocalAppData%\Microsoft\Edge\Application\msedge.exe" set "SYSTEM_EDGE=%LocalAppData%\Microsoft\Edge\Application\msedge.exe"
if not defined SYSTEM_EDGE (
    echo Microsoft Edge is required to open the desktop window.
    echo You can also open app\index.html in a modern browser.
    pause
    exit /b 1
)

set "SYSTEM_URL="
for /f "delims=" %%U in ('powershell.exe -NoProfile -NonInteractive -Command "([uri]::new($env:SYSTEM_ENTRY)).AbsoluteUri"') do set "SYSTEM_URL=%%U"
if not defined SYSTEM_URL (
    echo Could not open the local app. Try opening app\index.html directly.
    pause
    exit /b 1
)

start "" "%SYSTEM_EDGE%" --no-first-run --user-data-dir="%LocalAppData%\The System\Profile" --app="%SYSTEM_URL%"
