#!/bin/sh
# This script automates the setup and execution of the JustCode server.
# It checks for a virtual environment, creates it if missing,
# activates it, and installs dependencies if needed.

# --- Create Virtual Environment if it doesn't exist ---
if [ ! -d "venv" ]; then
    echo "Virtual environment 'venv' not found. Creating..."
    # Use python3 if available, otherwise fall back to python
    if command -v python3 &> /dev/null; then
        PYTHON_CMD=python3
    else
        PYTHON_CMD=python
    fi
    
    $PYTHON_CMD -m venv venv
    if [ $? -ne 0 ]; then
        echo "------------------------------------------------------------"
        echo "ERROR: Failed to create the virtual environment."
        echo "Please make sure Python 3.10+ is installed and accessible."
        echo "------------------------------------------------------------"
        exit 1
    fi
fi

# --- Activate and Run ---
source venv/bin/activate

echo "Attempting to start JustCode server..."

# Try to run the server. If it fails, try to install dependencies and run again.
python app.py || {
    echo
    echo "------------------------------------------------------------"
    echo "Initial server start failed. This might be due to missing"
    echo "dependencies. Trying to install them from requirements.txt..."
    echo "------------------------------------------------------------"
    echo
    
    pip install -r requirements.txt && {
        echo
        echo "------------------------------------------------------------"
        echo "Dependencies installed successfully. Retrying to start server..."
        echo "------------------------------------------------------------"
        echo
        python app.py
    } || {
        echo
        echo "------------------------------------------------------------"
        echo "ERROR: Failed to install dependencies."
        echo "Please run 'pip install -r requirements.txt' manually"
        echo "after activating the virtual environment."
        echo "------------------------------------------------------------"
        echo
        exit 1
    }
}