@echo off
setlocal
cd /d "%~dp0"

where python >nul 2>nul
if %errorlevel%==0 (
    set "PY_CMD=python"
) else (
    where py >nul 2>nul
    if %errorlevel%==0 (
        set "PY_CMD=py -3"
    ) else (
        echo [Error] Python 3.10+ not found on PATH.
        echo Please install Python 3 and run: pip install -r requirements.txt
        pause
        exit /b 1
    )
)

echo Starting MagnetronLab on http://127.0.0.1:8877/ ...
%PY_CMD% run.py --port 8877 --open
if not %errorlevel%==0 (
    echo.
    echo [Error] Failed to start. Make sure dependencies are installed:
    echo   pip install -r requirements.txt
    pause
)
