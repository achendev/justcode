import os
import re
import shlex
import traceback
import stat
import time
import subprocess
from flask import request, Response
from .tools.utils import is_safe_path, here_doc_value
from .tools.script_executor import execute_script
from .tools.history_manager import get_history_dir, clear_stack, get_sorted_stack_timestamps

def deploy_code():
    path = request.args.get('path')
    tolerate_errors = request.args.get('tolerateErrors', 'true').lower() == 'true'
    run_script_on_deploy = request.args.get('runScript', 'false').lower() == 'true'
    post_deploy_script = request.args.get('scriptToRun', '')

    if not path or not path.strip():
        return Response("Error: 'path' parameter is missing.", status=400, mimetype='text/plain')
    
    project_path = os.path.abspath(path.strip())
    if not os.path.isdir(project_path):
        return Response(f"Error: Provided path '{project_path}' is not a valid directory.", status=400, mimetype='text/plain')
    
    script_content = request.get_data(as_text=True)
    if not script_content:
        return Response("Error: No deploy script provided in the request body.", status=400, mimetype='text/plain')
    
    # --- Pass 1: Generate Undo Script ---
    rollback_commands = [] # This is the content of the "undo" script
    lines = script_content.splitlines()
    i = 0
    try:
        while i < len(lines):
            line = lines[i].strip()
            i += 1
            if not line: continue

            if line.startswith('cat >'):
                match = re.match(r"cat >\s+(?P<path>.*?)\s+<<\s+'" + re.escape(here_doc_value) + r"'", line)
                if not match: raise ValueError(f"Invalid 'cat' format: {line}")
                relative_path = re.sub(r'^\./', '', match.group('path').strip("'\""))
                if not is_safe_path(project_path, relative_path): raise PermissionError(f"Traversal: {relative_path}")
                
                full_path = os.path.join(project_path, relative_path.replace('/', os.sep))
                quoted_rel_path = shlex.quote('./' + relative_path)
                if os.path.isfile(full_path):
                    with open(full_path, 'r', encoding='utf-8', errors='ignore') as f:
                        original_content = f.read()
                    rollback_cmd = f"cat > {quoted_rel_path} << '{here_doc_value}'\n{original_content}\n{here_doc_value}"
                else:
                    rollback_cmd = f"rm -f {quoted_rel_path}"
                rollback_commands.insert(0, rollback_cmd)

                while i < len(lines) and not lines[i].startswith(here_doc_value):
                    i += 1
                if i < len(lines):
                    i += 1
                continue

            try:
                parts = shlex.split(line)
            except ValueError as e:
                if tolerate_errors:
                    print(f"Warning (Undo Gen): Tolerating and skipping malformed line: '{line}'. Error: {e}")
                    continue
                else:
                    raise ValueError(f"Invalid command format: {line}") from e

            if not parts: continue
            command, args = parts, parts[1:]

            if command == 'mkdir':
                paths_to_create = [arg for arg in args if arg != '-p']
                for arg in paths_to_create:
                    relative_path = re.sub(r'^\./', '', arg)
                    if not is_safe_path(project_path, relative_path): raise PermissionError(f"Traversal: {relative_path}")
                    if not os.path.isdir(os.path.join(project_path, relative_path.replace('/', os.sep))):
                        rollback_commands.insert(0, f"rmdir {shlex.quote('./' + relative_path)}")
            elif command == 'touch':
                for arg in args:
                    relative_path = re.sub(r'^\./', '', arg)
                    if not is_safe_path(project_path, relative_path): raise PermissionError(f"Traversal: {relative_path}")
                    if not os.path.exists(os.path.join(project_path, relative_path.replace('/', os.sep))):
                        rollback_commands.insert(0, f"rm -f {shlex.quote('./' + relative_path)}")
            elif command == 'rm':
                for arg in args:
                    if arg.startswith('-') and arg != '-f': raise ValueError(f"Unsupported flag for 'rm': '{arg}'.")
                file_paths = [arg for arg in args if not arg.startswith('-')]
                if not file_paths: raise ValueError("'rm' command requires a file path.")
                for relative_path_arg in file_paths:
                    relative_path = re.sub(r'^\./', '', relative_path_arg)
                    if not is_safe_path(project_path, relative_path): raise PermissionError(f"Traversal: {relative_path}")
                    full_path = os.path.join(project_path, relative_path.replace('/', os.sep))
                    if os.path.isfile(full_path):
                        with open(full_path, 'r', encoding='utf-8', errors='ignore') as f:
                            original_content = f.read()
                        rollback_cmd = f"cat > {shlex.quote('./' + relative_path)} << '{here_doc_value}'\n{original_content}\n{here_doc_value}"
                        rollback_commands.insert(0, rollback_cmd)
            elif command == 'rmdir':
                for arg in args:
                    relative_path = re.sub(r'^\./', '', arg)
                    if not is_safe_path(project_path, relative_path): raise PermissionError(f"Traversal: {relative_path}")
                    if os.path.isdir(os.path.join(project_path, relative_path.replace('/', os.sep))):
                        rollback_commands.insert(0, f"mkdir {shlex.quote('./' + relative_path)}")
            elif command == 'mv':
                if len(args) != 2: raise ValueError("'mv' requires two arguments.")
                src, dest = re.sub(r'^\./', '', args), re.sub(r'^\./', '', args)
                if not is_safe_path(project_path, src) or not is_safe_path(project_path, dest): raise PermissionError(f"Traversal: {src} or {dest}")
                rollback_commands.insert(0, f"mv {shlex.quote('./' + dest)} {shlex.quote('./' + src)}")
            elif command == 'chmod':
                file_args = args[1:]
                for arg in file_args:
                    relative_path = re.sub(r'^\./', '', arg)
                    if not is_safe_path(project_path, relative_path): raise PermissionError(f"Traversal: {relative_path}")
                    full_path = os.path.join(project_path, relative_path.replace('/', os.sep))
                    if os.path.exists(full_path) and not os.path.isdir(full_path):
                        try:
                            original_permissions = stat.S_IMODE(os.stat(full_path).st_mode)
                            rollback_commands.insert(0, f"chmod {oct(original_permissions)[2:]} {shlex.quote('./' + relative_path)}")
                        except FileNotFoundError: pass
            else:
                if tolerate_errors:
                    print(f"Warning (Undo Gen): Tolerating and skipping unsupported command in line: '{line}'")
                    continue
                else:
                    raise ValueError(f"Unsupported command: '{command}'")
    except (ValueError, PermissionError, OSError) as e:
        return Response(f"Error during undo script generation: {str(e)}", status=500, mimetype='text/plain')

    # A new deployment clears the redo history.
    clear_stack(project_path, 'redo')

    # Create new script files in the undo_stack.
    timestamp = str(int(time.time() * 1000))
    undo_stack_dir = get_history_dir(project_path, 'undo')
    undo_script_content = "\n".join(rollback_commands)
    undo_filepath = os.path.join(undo_stack_dir, f"{timestamp}.sh")
    redo_filepath = os.path.join(undo_stack_dir, f"{timestamp}.redo") # The redo file is the original deploy script

    with open(undo_filepath, 'w', encoding='utf-8') as f: f.write(undo_script_content)
    with open(redo_filepath, 'w', encoding='utf-8') as f: f.write(script_content)

    # Clean up old undo scripts if there are more than 10.
    all_undo_timestamps = get_sorted_stack_timestamps(project_path, 'undo')
    if len(all_undo_timestamps) > 10:
        for old_ts in all_undo_timestamps[:-10]: # Keep the 10 newest
            try:
                os.remove(os.path.join(undo_stack_dir, f"{old_ts}.sh"))
                os.remove(os.path.join(undo_stack_dir, f"{old_ts}.redo"))
            except OSError as e:
                print(f"Warning: Could not delete old undo script for ts '{old_ts}': {e}")
    
    # --- Pass 2: Execute Deployment Script ---
    try:
        output_log, error_log = execute_script(script_content, project_path, tolerate_errors)
        
        message = ""
        if error_log:
            message += "Deployed with some ignored errors:\n\n"
            message += "\n---\n".join(error_log)
            message += "\n\n--- SUCCESSFUL ACTIONS LOG ---\n"
        else:
            message = "Successfully deployed code.\n--- LOG ---\n"

        message += "\n".join(output_log)

        # --- Pass 3: Execute Post-Deploy Script ---
        if run_script_on_deploy and post_deploy_script:
            message += "\n\n--- POST-DEPLOY SCRIPT OUTPUT ---\n"
            try:
                # Execute the script in the project's root directory
                post_script_result = subprocess.run(
                    post_deploy_script,
                    shell=True,
                    cwd=project_path,
                    capture_output=True,
                    text=True,
                    check=False # We will handle non-zero exit codes manually
                )
                if post_script_result.stdout:
                    message += f"Output:\n{post_script_result.stdout}\n"
                if post_script_result.stderr:
                    message += f"Errors:\n{post_script_result.stderr}\n"
                
                if post_script_result.returncode != 0:
                    message += f"Script exited with code {post_script_result.returncode}."
                else:
                    message += "Script finished successfully."

            except Exception as e:
                message += f"Failed to execute post-deploy script: {str(e)}"

        
        return Response(message, mimetype='text/plain')

    except Exception as e:
        # This block will now only be reached if tolerate_errors is false and an error occurs.
        try:
            if os.path.exists(undo_filepath): os.remove(undo_filepath)
            if os.path.exists(redo_filepath): os.remove(redo_filepath)
        except OSError: pass # Best effort cleanup
        
        error_details = f"Error during deployment:\n{str(e)}\n{traceback.format_exc()}"
        error_details += "\n\nNOTE: The action failed to execute. The undo history has not been changed."
        print(error_details)
        return Response(error_details, status=500, mimetype='text/plain')