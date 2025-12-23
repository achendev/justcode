import os
import re
import shlex
import stat
from .utils import is_safe_path, here_doc_value

def resolve_path(raw_path, project_paths, use_numeric_prefixes=False):
    """
    Resolves a path from a script, which may be prefixed for multi-root projects.
    Returns the absolute full path of the target and the project path it belongs to for security checks.
    """
    path = re.sub(r'^\./', '', raw_path)

    # SINGLE PATH LOGIC
    if len(project_paths) == 1:
        base_path = project_paths[0]
        script_relative_path = path
        
        if os.path.isfile(base_path):
            if os.path.basename(base_path) == script_relative_path:
                return base_path, base_path
            else:
                raise ValueError(f"Script path '{script_relative_path}' does not match the provided file path's name '{os.path.basename(base_path)}'.")
        
        full_path = os.path.join(base_path, script_relative_path.replace('/', os.sep))
        return full_path, base_path

    # NEW MULTI-PATH LOGIC
    prefix_map = []
    if use_numeric_prefixes:
        for i, p_path in enumerate(project_paths):
            prefix_map.append((str(i), p_path))
    else:
        for p_path in project_paths:
            if os.path.isdir(p_path):
                prefix_map.append((os.path.basename(p_path), p_path))
            elif os.path.isfile(p_path):
                parent = os.path.basename(os.path.dirname(p_path))
                fname = os.path.basename(p_path)
                prefix_map.append((f"{parent}/{fname}", p_path))

    prefix_map.sort(key=lambda item: len(item[0]), reverse=True)
    
    for prefix, base_path in prefix_map:
        if path == prefix:
            return base_path, base_path
        
        if path.startswith(prefix + '/'):
            script_relative_path = path[len(prefix) + 1:]
            
            if os.path.isfile(base_path):
                 raise ValueError(f"Cannot resolve path '{script_relative_path}' inside a file path '{base_path}'.")

            full_path = os.path.join(base_path, script_relative_path.replace('/', os.sep))
            return full_path, base_path

    known_prefixes = [p[0] for p in prefix_map]
    raise ValueError(f"Could not find a matching project for path '{raw_path}'. Known project prefixes: {known_prefixes}")


def execute_script(script_content, project_paths, tolerate_errors=False, use_numeric_prefixes=False, add_empty_line=True):
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
            if not line or line.startswith('#'):
                i += 1
                continue
            
            raw_path_for_command = '' # For error messages

            if line.startswith('cat >'):
                match = re.match(r"cat >\s+(?P<path>.*?)\s+<<\s+'" + re.escape(here_doc_value) + r"'", line)
                if not match: raise ValueError(f"Invalid 'cat' command format")
                
                raw_path_for_command = match.group('path').strip("'\"")
                full_path, owning_project_path = resolve_path(raw_path_for_command, project_paths, use_numeric_prefixes)
                
                base_dir_for_safety = os.path.dirname(owning_project_path) if os.path.isfile(owning_project_path) else owning_project_path
                if not os.path.abspath(full_path).startswith(os.path.abspath(base_dir_for_safety)):
                    raise PermissionError(f"Path traversal attempt detected: {raw_path_for_command}")
                
                content_lines = []
                heredoc_found = False
                
                content_start_index = i + 1
                temp_i = content_start_index
                while temp_i < len(lines):
                    if lines[temp_i].startswith(here_doc_value):
                        heredoc_found = True
                        content_lines = lines[content_start_index:temp_i]
                        i = temp_i + 1
                        break
                    temp_i += 1
                
                if not heredoc_found:
                    i += 1
                    raise ValueError(f"Unterminated heredoc for file '{raw_path_for_command}'")
                
                file_content = "\n".join(content_lines)
                if add_empty_line:
                    file_content += "\n"
                
                os.makedirs(os.path.dirname(full_path), exist_ok=True)
                with open(full_path, 'w', encoding='utf-8') as f: f.write(file_content)
                output_log.append(f"Wrote file: {raw_path_for_command}")
                continue
            
            try:
                parts = shlex.split(line)
            except ValueError as e: raise ValueError(f"Invalid command format: {line}") from e
            
            if not parts:
                i += 1
                continue
            
            command, args = parts[0], parts[1:]

            def check_safety_for_arg(arg):
                full_path, owning_project_path = resolve_path(arg, project_paths, use_numeric_prefixes)
                base_dir = os.path.dirname(owning_project_path) if os.path.isfile(owning_project_path) else owning_project_path
                if not os.path.abspath(full_path).startswith(os.path.abspath(base_dir)):
                    raise PermissionError(f"Path traversal attempt detected: {arg}")
                return full_path
            
            if command == 'mkdir':
                use_p_flag = '-p' in args
                paths_to_create = [arg for arg in args if arg != '-p']
                for arg in paths_to_create:
                    full_path = check_safety_for_arg(arg)
                    if use_p_flag:
                        os.makedirs(full_path, exist_ok=True)
                        output_log.append(f"Created directory (with -p): {arg}")
                    else:
                        os.mkdir(full_path)
                        output_log.append(f"Created directory: {arg}")
            elif command == 'rm':
                use_f_flag = '-f' in args
                file_paths = [p for p in args if not p.startswith('-')]
                if any(p.startswith('-') and p != '-f' for p in args): raise ValueError("Unsupported flag for rm")
                for path in file_paths:
                    full_path = check_safety_for_arg(path)
                    try:
                        if os.path.isdir(full_path): raise IsADirectoryError(f"Cannot 'rm' a directory: {path}")
                        os.remove(full_path)
                        output_log.append(f"Removed file: {path}")
                    except FileNotFoundError:
                        if use_f_flag or tolerate_errors: output_log.append(f"Skipped removal (not found): {path}")
                        else: raise
            elif command == 'rmdir':
                 for arg in args:
                    full_path = check_safety_for_arg(arg)
                    try:
                        os.rmdir(full_path)
                        output_log.append(f"Removed directory: {arg}")
                    except OSError as e:
                        if tolerate_errors: output_log.append(f"Skipped rmdir for '{arg}', ignoring error: {e}")
                        else: raise OSError(f"Could not rmdir '{arg}': {e}") from e
            elif command == 'mv':
                if len(args) != 2: raise ValueError("'mv' requires two arguments.")
                full_src = check_safety_for_arg(args[0])
                full_dest = check_safety_for_arg(args[1])
                os.makedirs(os.path.dirname(full_dest), exist_ok=True)
                os.rename(full_src, full_dest)
                output_log.append(f"Moved: {args[0]} to {args[1]}")
            elif command == 'touch':
                for arg in args:
                    full_path = check_safety_for_arg(arg)
                    os.makedirs(os.path.dirname(full_path), exist_ok=True)
                    with open(full_path, 'a'): os.utime(full_path, None)
                    output_log.append(f"Touched file: {arg}")
            elif command == 'chmod':
                if len(args) < 2: raise ValueError("'chmod' requires a mode and at least one file.")
                mode_str, file_paths = args[0], args[1:]
                for relative_path_arg in file_paths:
                    full_path = check_safety_for_arg(relative_path_arg)
                    if not os.path.exists(full_path): raise FileNotFoundError(f"chmod: cannot access '{relative_path_arg}': No such file or directory")
                    new_mode = 0
                    if mode_str.isdigit(): new_mode = int(mode_str, 8)
                    else:
                        current_mode = os.stat(full_path).st_mode
                        if mode_str == '+x': new_mode = current_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH
                        else: raise ValueError(f"Unsupported chmod mode: '{mode_str}'. Only octal and '+x' are supported.")
                    os.chmod(full_path, new_mode)
                    output_log.append(f"Changed mode of {relative_path_arg} to {mode_str}")
            else:
                raise ValueError(f"Unsupported command: '{command}'")
            
            i += 1

        except Exception as e:
            error_message = f"Error on line {line_num_for_error}: '{original_line_ref}'\n  -> {str(e)}"
            if tolerate_errors:
                error_log.append(error_message)
                print(f"Warning (Tolerated): {error_message}")
                if i < line_num_for_error:
                    i = line_num_for_error
            else:
                raise type(e)(error_message) from e

    return output_log, error_log