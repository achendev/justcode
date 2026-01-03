import subprocess
import os

def execute_shell_command(command, cwd):
    """
    Executes an arbitrary shell command in the given directory.
    """
    try:
        # shell=True allows using pipes, redirects, and environment variables
        result = subprocess.run(
            command, 
            cwd=cwd, 
            shell=True, 
            capture_output=True, 
            text=True,
            timeout=120  # 2 minute timeout for safety
        )
        
        output = f"EXIT_CODE: {result.returncode}\n"
        if result.stdout:
            output += f"STDOUT:\n{result.stdout}\n"
        if result.stderr:
            output += f"STDERR:\n{result.stderr}\n"
            
        if not result.stdout and not result.stderr and result.returncode == 0:
            output += "(Command executed successfully with no output)"
            
        return output
    except subprocess.TimeoutExpired:
        return "Error: Command timed out after 120 seconds."
    except Exception as e:
        return f"Execution Error: {str(e)}"