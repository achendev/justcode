import subprocess
import os
import platform
import shutil

def execute_shell_command(command, cwd):
    """
    Executes an arbitrary shell command in the given directory.
    """
    try:
        executable = None
        wrapped_command = command
        
        # Enhancing output for POSIX systems with Bash
        # This adds a trap to echo commands before execution, simulating a terminal session.
        # This helps the LLM distinguish which output belongs to which command in the STDOUT block.
        if platform.system() != "Windows" and shutil.which("bash"):
            executable = shutil.which("bash")
            # The trap command echoes "$ " followed by the command being executed ($BASH_COMMAND).
            # We use single quotes for the trap body to prevent immediate expansion by the shell parsing the trap line.
            wrapped_command = f"trap 'echo \"$ $BASH_COMMAND\"' DEBUG\n{command}"

        # shell=True allows using pipes, redirects, and environment variables
        result = subprocess.run(
            wrapped_command, 
            cwd=cwd, 
            shell=True,
            executable=executable,
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