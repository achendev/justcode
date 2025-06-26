import os
import re
import shlex
import traceback
from flask import request, Response
from .tools import is_safe_path, create_new_rollback_filepath, get_sorted_rollback_files, execute_script, here_doc_value

def deploy_code():
    path = request.args.get('path')
    if not path or not path.strip():
        return Response("Error: 'path' parameter is missing.", status=400, mimetype='text/plain')
    
    project_path = os.path.abspath(path.strip())
    if not os.path.isdir(project_path):
        return Response(f"Error: Provided path '{project_path}' is not a valid directory.", status=400, mimetype='text/plain')
    
    script_content = request.get_data(as_text=True)
    if not script_content:
        return Response("Error: No deploy script provided in the request body.", status=400, mimetype='text/plain')
    
    # --- Pass 1: Generate Rollback Script ---
    rollback_commands = []
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
                relative_path = match.group('path').strip("'\"").lstrip('./')
                if not is_safe_path(project_path, relative_path): raise PermissionError(f"Traversal: {relative_path}")
                
                full_path = os.path.join(project_path, relative_path)
                if os.path.isfile(full_path):
                    with open(full_path, 'r', encoding='utf-8', errors='ignore') as f:
                        original_content = f.read()
                    rollback_cmd = f"cat > ./{relative_path} << '{here_doc_value}'\n{original_content}\n{here_doc_value}"
                else:
                    rollback_cmd = f"rm -f ./{relative_path}"
                rollback_commands.insert(0, rollback_cmd)

                while i < len(lines) and lines[i] != here_doc_value: i += 1
                if i < len(lines): i += 1
                continue

            parts = shlex.split(line)
            if not parts: continue
            command, args = parts[0], parts[1:]

            if command == 'mkdir':
                for arg in args:
                    relative_path = arg.lstrip('./')
                    if not is_safe_path(project_path, relative_path): raise PermissionError(f"Traversal: {relative_path}")
                    if not os.path.isdir(os.path.join(project_path, relative_path)):
                        rollback_commands.insert(0, f"rmdir ./{relative_path}")
            elif command == 'touch':
                for arg in args:
                    relative_path = arg.lstrip('./')
                    if not is_safe_path(project_path, relative_path): raise PermissionError(f"Traversal: {relative_path}")
                    if not os.path.exists(os.path.join(project_path, relative_path)):
                        rollback_commands.insert(0, f"rm -f ./{relative_path}")
            elif command == 'rm':
                # Check for any unsupported flags.
                for arg in args:
                    if arg.startswith('-') and arg != '-f':
                        raise ValueError(f"Unsupported flag for 'rm': '{arg}'. Only '-f' is supported.")
                
                if args.count('-f') > 1:
                    raise ValueError("Multiple '-f' flags are not allowed for 'rm'.")

                file_paths = [arg for arg in args if not arg.startswith('-')]

                if not file_paths:
                    raise ValueError("'rm' command requires at least one file path.")

                for relative_path in file_paths:
                    relative_path = relative_path.lstrip('./')
                    if not is_safe_path(project_path, relative_path): raise PermissionError(f"Traversal: {relative_path}")
                    full_path = os.path.join(project_path, relative_path)
                    if os.path.isfile(full_path):
                        with open(full_path, 'r', encoding='utf-8', errors='ignore') as f:
                            original_content = f.read()
                        rollback_cmd = f"cat > ./{relative_path} << '{here_doc_value}'\n{original_content}\n{here_doc_value}"
                        rollback_commands.insert(0, rollback_cmd)
            elif command == 'rmdir':
                for arg in args:
                    relative_path = arg.lstrip('./')
                    if not is_safe_path(project_path, relative_path): raise PermissionError(f"Traversal: {relative_path}")
                    if os.path.isdir(os.path.join(project_path, relative_path)):
                        rollback_commands.insert(0, f"mkdir ./{relative_path}")
            elif command == 'mv':
                if len(args) != 2: raise ValueError("'mv' requires two arguments.")
                src, dest = args[0].lstrip('./'), args[1].lstrip('./')
                if not is_safe_path(project_path, src) or not is_safe_path(project_path, dest): raise PermissionError(f"Traversal: {src} or {dest}")
                rollback_commands.insert(0, f"mv ./{dest} ./{src}")
            else:
                raise ValueError(f"Unsupported command: '{command}'")
    except (ValueError, PermissionError, OSError) as e:
        error_details = f"Error during rollback script generation: {str(e)}"
        print(error_details)
        return Response(error_details, status=500, mimetype='text/plain')

    # Create the new rollback script.
    rollback_filepath = create_new_rollback_filepath(project_path)
    with open(rollback_filepath, 'w', encoding='utf-8') as f:
        f.write("\n".join(rollback_commands))

    # Clean up old rollback scripts if there are more than 10.
    all_rollbacks = get_sorted_rollback_files(project_path)
    if len(all_rollbacks) > 10:
        for old_script in all_rollbacks[:-10]: # Keep the 10 newest
            try:
                os.remove(old_script)
            except OSError as e:
                print(f"Warning: Could not delete old rollback script '{old_script}': {e}")
    
    # --- Pass 2: Execute Deployment Script ---
    try:
        output_log = execute_script(script_content, project_path)
        success_message = f"Successfully deployed code.\n--- LOG ---\n" + "\n".join(output_log)
        return Response(success_message, mimetype='text/plain')
    except Exception as e:
        error_details = f"Error during deployment:\n{str(e)}\n{traceback.format_exc()}"
        error_details += f"\n\nNOTE: A rollback script was saved to '{rollback_filepath}'. You can use the 'Rollback' button to undo partial changes."
        print(error_details)
        return Response(error_details, status=500, mimetype='text/plain')