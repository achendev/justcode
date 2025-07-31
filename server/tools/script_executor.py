import os
import re
import shlex
import stat
from .utils import is_safe_path, here_doc_value

def execute_script(script_content, project_path, tolerate_errors=False):
    """Parses and executes a deployment script, returning logs and errors."""
    lines = script_content.replace('\r\n', '\n').split('\n')
    i = 0
    output_log = []
    error_log = []

    while i < len(lines):
        line = lines[i].strip()
        original_line_ref = lines[i] # For error message
        line_num_for_error = i + 1
        
        try:
            # We must advance `i` *after* a command is fully processed.
            
            if not line or line.startswith('#'):
                i += 1
                continue
            
            # --- CAT HEREDOC ---
            if line.startswith('cat >'):
                match = re.match(r"cat >\s+(?P<path>.*?)\s+<<\s+'" + re.escape(here_doc_value) + r"'", line)
                if not match: raise ValueError(f"Invalid 'cat' command format")
                
                relative_path = re.sub(r'^\./', '', match.group('path').strip("'\""))
                if not is_safe_path(project_path, relative_path): raise PermissionError(f"Path traversal attempt detected: {relative_path}")
                
                full_path = os.path.join(project_path, relative_path.replace('/', os.sep))
                
                content_lines = []
                heredoc_found = False
                
                content_start_index = i + 1
                temp_i = content_start_index
                while temp_i < len(lines):
                    if lines[temp_i].startswith(here_doc_value):
                        heredoc_found = True
                        content_lines = lines[content_start_index:temp_i]
                        i = temp_i + 1 # Set main counter past the heredoc block
                        break
                    temp_i += 1
                
                if not heredoc_found:
                    i += 1 # Only advance past the broken 'cat' line
                    raise ValueError(f"Unterminated heredoc for file '{relative_path}'")
                
                file_content = "\n".join(content_lines)
                os.makedirs(os.path.dirname(full_path), exist_ok=True)
                with open(full_path, 'w', encoding='utf-8') as f: f.write(file_content)
                output_log.append(f"Wrote file: {relative_path}")
                continue
            
            # --- OTHER COMMANDS (all single-line) ---
            try:
                parts = shlex.split(line)
            except ValueError as e: raise ValueError(f"Invalid command format: {line}") from e
            
            if not parts:
                i += 1
                continue
            
            command, args = parts[0], parts[1:]
            
            if command == 'mkdir':
                use_p_flag = '-p' in args
                paths_to_create = [arg for arg in args if arg != '-p']
                for arg in paths_to_create:
                    relative_path = re.sub(r'^\./', '', arg)
                    if not is_safe_path(project_path, relative_path): raise PermissionError(f"Traversal: {relative_path}")
                    full_path = os.path.join(project_path, relative_path.replace('/', os.sep))
                    if use_p_flag:
                        os.makedirs(full_path, exist_ok=True)
                        output_log.append(f"Created directory (with -p): {relative_path}")
                    else:
                        os.mkdir(full_path)
                        output_log.append(f"Created directory: {relative_path}")
            elif command == 'rm':
                use_f_flag = '-f' in args
                file_paths = [p for p in args if not p.startswith('-')]
                if any(p.startswith('-') and p != '-f' for p in args): raise ValueError("Unsupported flag for rm")
                for path in file_paths:
                    relative_path = re.sub(r'^\./', '', path)
                    if not is_safe_path(project_path, relative_path): raise PermissionError(f"Traversal: {relative_path}")
                    full_path = os.path.join(project_path, relative_path.replace('/', os.sep))
                    try:
                        if os.path.isdir(full_path): raise IsADirectoryError(f"Cannot 'rm' a directory: {relative_path}")
                        os.remove(full_path)
                        output_log.append(f"Removed file: {relative_path}")
                    except FileNotFoundError:
                        if use_f_flag or tolerate_errors: output_log.append(f"Skipped removal (not found): {relative_path}")
                        else: raise
            elif command == 'rmdir':
                 for arg in args:
                    relative_path = re.sub(r'^\./', '', arg)
                    if not is_safe_path(project_path, relative_path): raise PermissionError(f"Traversal: {relative_path}")
                    full_path = os.path.join(project_path, relative_path.replace('/', os.sep))
                    try:
                        os.rmdir(full_path)
                        output_log.append(f"Removed directory: {relative_path}")
                    except OSError as e:
                        if tolerate_errors: output_log.append(f"Skipped rmdir for '{relative_path}', ignoring error: {e}")
                        else: raise OSError(f"Could not rmdir '{relative_path}': {e}") from e
            elif command == 'mv':
                if len(args) != 2: raise ValueError("'mv' requires two arguments.")
                src, dest = re.sub(r'^\./', '', args[0]), re.sub(r'^\./', '', args[1])
                if not is_safe_path(project_path, src) or not is_safe_path(project_path, dest): raise PermissionError(f"Traversal: {src} or {dest}")
                full_src = os.path.join(project_path, src.replace('/', os.sep))
                full_dest = os.path.join(project_path, dest.replace('/', os.sep))
                os.makedirs(os.path.dirname(full_dest), exist_ok=True)
                os.rename(full_src, full_dest)
                output_log.append(f"Moved: {src} to {dest}")
            elif command == 'touch':
                for arg in args:
                    relative_path = re.sub(r'^\./', '', arg)
                    if not is_safe_path(project_path, relative_path): raise PermissionError(f"Traversal: {relative_path}")
                    full_path = os.path.join(project_path, relative_path.replace('/', os.sep))
                    os.makedirs(os.path.dirname(full_path), exist_ok=True)
                    with open(full_path, 'a'): os.utime(full_path, None)
                    output_log.append(f"Touched file: {relative_path}")
            elif command == 'chmod':
                if len(args) < 2: raise ValueError("'chmod' requires a mode and at least one file.")
                mode_str, file_paths = args[0], args[1:]
                for relative_path_arg in file_paths:
                    relative_path = re.sub(r'^\./', '', relative_path_arg)
                    if not is_safe_path(project_path, relative_path): raise PermissionError(f"Traversal: {relative_path}")
                    full_path = os.path.join(project_path, relative_path.replace('/', os.sep))
                    if not os.path.exists(full_path): raise FileNotFoundError(f"chmod: cannot access '{relative_path}': No such file or directory")
                    new_mode = 0
                    if mode_str.isdigit(): new_mode = int(mode_str, 8)
                    else:
                        current_mode = os.stat(full_path).st_mode
                        if mode_str == '+x': new_mode = current_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH
                        else: raise ValueError(f"Unsupported chmod mode: '{mode_str}'. Only octal and '+x' are supported.")
                    os.chmod(full_path, new_mode)
                    output_log.append(f"Changed mode of {relative_path} to {mode_str}")
            else:
                raise ValueError(f"Unsupported command: '{command}'")
            
            i += 1 # Consume this single line

        except Exception as e:
            error_message = f"Error on line {line_num_for_error}: '{original_line_ref}'\n  -> {str(e)}"
            if tolerate_errors:
                error_log.append(error_message)
                print(f"Warning (Tolerated): {error_message}")
                # Ensure `i` advances past the line that caused the error.
                if i < line_num_for_error:
                    i = line_num_for_error
            else:
                raise type(e)(error_message) from e

    return output_log, error_log