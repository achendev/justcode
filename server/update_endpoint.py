import os
import subprocess
from flask import Response

def update_app():
    try:
        # The project root is the parent directory of the 'server' directory where this script is located.
        project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))

        # Check if it's a git repository by looking for the .git directory.
        if not os.path.isdir(os.path.join(project_root, '.git')):
            return Response("Error: The application's directory is not a git repository.", status=400, mimetype='text/plain')

        command = ['git', 'pull']

        # Execute the 'git pull' command from the project's root directory.
        result = subprocess.run(
            command,
            cwd=project_root,
            capture_output=True,
            text=True,
            check=False  # We'll check the returncode manually to provide better error messages.
        )

        if result.returncode != 0:
            # git pull failed.
            error_message = f"Error during 'git pull' (exit code {result.returncode}):\n{result.stderr}"
            return Response(error_message, status=500, mimetype='text/plain')

        # Check the output to see if it was already up-to-date or if changes were pulled.
        if "Already up to date." in result.stdout:
             output = "JustCode is already up to date."
        else:
            output = f"Update successful!\n\n{result.stdout}"
        
        return Response(output, mimetype='text/plain')

    except FileNotFoundError:
        return Response("Error: 'git' command not found. Please ensure Git is installed and in your system's PATH.", status=500, mimetype='text/plain')
    except Exception as e:
        return Response(f"An unexpected error occurred during the update process: {str(e)}", status=500, mimetype='text/plain')