import os
import re
import shlex
import traceback
import stat
import time
import subprocess
from flask import request, Response
from .tools.utils import is_safe_path, here_doc_value
from .tools.script_executor import execute_script, resolve_path
from .tools.history_manager import get_history_dir, clear_stack, get_sorted_stack_timestamps

def deploy_code():
    paths = request.args.getlist('path')
    tolerate_errors = request.args.get('tolerateErrors', 'true').lower() == 'true'
    run_script_on_deploy = request.args.get('runScript', 'false').lower() == 'true'
    post_deploy_script = request.args.get('scriptToRun', '')
    verbose_log = request.args.get('verbose', 'true').lower() == 'true'
    hide_errors_on_success = request.args.get('hideErrorsOnSuccess', 'false').lower() == 'true'
    use_numeric_prefixes = request.args.get('useNumericPrefixes', 'false').lower() == 'true'
    add_empty_line = request.args.get('addEmptyLine', 'true').lower() == 'true'
    delimiter = request.args.get('delimiter', here_doc_value)

    if not paths or not any(p.strip() for p in paths):
        return Response("Error: 'path' parameter is missing.", status=400, mimetype='text/plain')
    
    project_paths = [os.path.abspath(p.strip()) for p in paths if p.strip()]

    # (Skipping validation boilerplate for brevity, same as before) ...
    for p_path in project_paths:
        if not os.path.exists(p_path):
            return Response(f"Error: Provided path '{p_path}' is not a valid directory or file.", status=400, mimetype='text/plain')
    
    script_content = request.get_data(as_text=True)
    if not script_content:
        return Response("Error: No deploy script provided in the request body.", status=400, mimetype='text/plain')
    
    # --- Pass 1: Generate Undo Script (Updated with delimiter) ---
    rollback_commands = []
    lines = script_content.splitlines()
    i = 0
    
    delim_pattern = re.escape(delimiter)
    
    try:
        while i < len(lines):
            line = lines[i].strip()
            i += 1
            if not line: continue

            def check_safety_and_get_path(raw_path):
                full_path, owning_path = resolve_path(raw_path, project_paths, use_numeric_prefixes)
                base_dir = os.path.dirname(owning_path) if os.path.isfile(owning_path) else owning_path
                if not os.path.abspath(full_path).startswith(os.path.abspath(base_dir)):
                    raise PermissionError(f"Path traversal attempt detected: {raw_path}")
                return full_path

            if line.startswith('cat >'):
                match = re.match(r"cat >\s+(?P<path>.*?)\s+<<\s+'" + delim_pattern + r"'", line)
                if not match: 
                    # If mismatch, skip it (will be caught in execute pass if invalid)
                    continue 
                
                raw_path = match.group('path').strip("'\"")
                full_path = check_safety_and_get_path(raw_path)

                quoted_rel_path = shlex.quote(raw_path)
                if os.path.isfile(full_path):
                    with open(full_path, 'r', encoding='utf-8', errors='ignore') as f:
                        original_content = f.read()
                    rollback_cmd = f"cat > {quoted_rel_path} << '{delimiter}'\n{original_content}\n{delimiter}"
                else:
                    rollback_cmd = f"rm -f {quoted_rel_path}"
                rollback_commands.insert(0, rollback_cmd)

                while i < len(lines) and not lines[i].startswith(delimiter):
                    i += 1
                if i < len(lines):
                    i += 1
                continue

            try:
                parts = shlex.split(line)
            except ValueError: continue # Skip malformed lines

            if not parts: continue
            command, args = parts[0], parts[1:]

            if command == 'mkdir':
                paths_to_create = [arg for arg in args if arg != '-p']
                for arg in paths_to_create:
                    full_path = check_safety_and_get_path(arg)
                    if not os.path.isdir(full_path):
                        rollback_commands.insert(0, f"rmdir {shlex.quote(arg)}")
            elif command == 'rm':
                file_paths = [arg for arg in args if not arg.startswith('-')]
                for relative_path_arg in file_paths:
                    full_path = check_safety_and_get_path(relative_path_arg)
                    if os.path.isfile(full_path):
                        with open(full_path, 'r', encoding='utf-8', errors='ignore') as f:
                            original_content = f.read()
                        rollback_cmd = f"cat > {shlex.quote(relative_path_arg)} << '{delimiter}'\n{original_content}\n{delimiter}"
                        rollback_commands.insert(0, rollback_cmd)
            elif command == 'rmdir':
                for arg in args:
                    full_path = check_safety_and_get_path(arg)
                    if os.path.isdir(full_path):
                        rollback_commands.insert(0, f"mkdir {shlex.quote(arg)}")
            elif command == 'mv':
                if len(args) == 2:
                    src, dest = args[0], args[1]
                    rollback_commands.insert(0, f"mv {shlex.quote(dest)} {shlex.quote(src)}")
            
    except (ValueError, PermissionError, OSError) as e:
        return Response(f"Error during undo script generation: {str(e)}", status=500, mimetype='text/plain')

    # ... (Rest of history logic matches previous implementation, just passing args) ...
    clear_stack(project_paths, 'redo')
    timestamp = str(int(time.time() * 1000))
    undo_stack_dir = get_history_dir(project_paths, 'undo')
    undo_script_content = "\n".join(rollback_commands)
    undo_filepath = os.path.join(undo_stack_dir, f"{timestamp}.sh")
    redo_filepath = os.path.join(undo_stack_dir, f"{timestamp}.redo")

    with open(undo_filepath, 'w', encoding='utf-8') as f: f.write(undo_script_content)
    with open(redo_filepath, 'w', encoding='utf-8') as f: f.write(script_content)

    all_undo_timestamps = get_sorted_stack_timestamps(project_paths, 'undo')
    if len(all_undo_timestamps) > 10:
        for old_ts in all_undo_timestamps[:-10]:
            try:
                os.remove(os.path.join(undo_stack_dir, f"{old_ts}.sh"))
                os.remove(os.path.join(undo_stack_dir, f"{old_ts}.redo"))
            except OSError: pass
    
    try:
        output_log, error_log = execute_script(script_content, project_paths, tolerate_errors, use_numeric_prefixes, add_empty_line, delimiter)
        
        deployment_message = ""
        if error_log:
            deployment_message = f"Deployment completed with {len(error_log)} ignored error(s)."
            if verbose_log and not hide_errors_on_success:
                 deployment_message += "\n\n" + "\n---\n".join(error_log) + "\n\n--- SUCCESSFUL ACTIONS LOG ---\n"
        else:
            deployment_message = "Code deployed successfully."

        if verbose_log:
            deployment_message += "\n--- LOG ---\n" + "\n".join(output_log)

        if run_script_on_deploy and post_deploy_script:
            # (Post script logic unchanged)
            main_project_path = project_paths[0]
            if os.path.isfile(main_project_path): main_project_path = os.path.dirname(main_project_path)
            try:
                post_script_result = subprocess.run(post_deploy_script, shell=True, cwd=main_project_path, capture_output=True, text=True, check=False)
                if post_script_result.returncode != 0:
                    return Response(deployment_message + f"\nPost-deploy failed: {post_script_result.stderr}", status=400, mimetype='text/plain')
                if verbose_log:
                    deployment_message += "\nPost-deploy succeeded."
            except Exception as e:
                 return Response(f"Failed to execute post-deploy script: {str(e)}", status=500, mimetype='text/plain')
        
        return Response(deployment_message, mimetype='text/plain')

    except Exception as e:
        try:
            if os.path.exists(undo_filepath): os.remove(undo_filepath)
            if os.path.exists(redo_filepath): os.remove(redo_filepath)
        except OSError: pass
        return Response(f"Error during deployment: {str(e)}", status=500, mimetype='text/plain')