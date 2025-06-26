#!/bin/sh

# This script activates the Python virtual environment and starts the Flask server.
# If the server fails to start, it attempts to install dependencies and retries.

# Activate virtual environment
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