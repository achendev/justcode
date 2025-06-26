@echo off
REM This script automates the setup and execution of the JustCode server.
REM It checks for a virtual environment, creates it if missing,
REM activates it, and installs dependencies if needed.

REM --- Create Virtual Environment if it doesn't exist ---
IF NOT EXIST "venv" (
    ECHO Virtual environment 'venv' not found. Creating...
    REM Use 'py -m venv' if available, as it's more reliable on Windows.
    REM Otherwise, fall back to 'python -m venv'.
    WHERE py >nul 2>nul
    IF %ERRORLEVEL% EQU 0 (
        py -m venv venv
    ) ELSE (
        python -m venv venv
    )
    
    IF %ERRORLEVEL% NEQ 0 (
        ECHO.
        ECHO --------------------------------------------------------------------
        ECHO ERROR: Failed to create the virtual environment.
        ECHO Please make sure Python 3.10+ is installed and in your PATH.
        ECHO --------------------------------------------------------------------
        ECHO.
        PAUSE
        EXIT /B 1
    )
)


REM --- Activate and Run ---
ECHO Activating virtual environment...
CALL venv\Scripts\activate.bat

ECHO Attempting to start JustCode server...

REM Try to run the server. If it fails (sets a non-zero ERRORLEVEL), run the block in parentheses.
python app.py || (
    ECHO.
    ECHO --------------------------------------------------------------------
    ECHO Initial server start failed. This may be due to missing packages.
    ECHO Attempting to install dependencies from requirements.txt...
    ECHO --------------------------------------------------------------------
    ECHO.
    
    REM Install dependencies. If it succeeds (sets ERRORLEVEL 0), run the next block.
    pip install -r requirements.txt && (
        ECHO.
        ECHO --------------------------------------------------------------------
        ECHO Dependencies installed successfully. Retrying to start the server...
        ECHO --------------------------------------------------------------------
        ECHO.
        python app.py
    ) || (
        ECHO.
        ECHO --------------------------------------------------------------------
        ECHO ERROR: Failed to install dependencies.
        ECHO Please activate the environment ('venv\Scripts\activate.bat')
        ECHO and run 'pip install -r requirements.txt' manually.
        ECHO --------------------------------------------------------------------
        ECHO.
    )
)

REM If any command in the script ultimately failed, pause to allow the user to see the error.
IF %ERRORLEVEL% NEQ 0 (
    ECHO Script finished with errors.
    PAUSE
)