@echo off
REM This script activates the Python virtual environment and starts the Flask server.
REM If the server fails, it attempts to install dependencies and retries.

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