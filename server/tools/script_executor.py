import os
import re
import shlex
import stat
from .utils import is_safe_path, here_doc_value

def execute_script(script_content, project_path, tolerate_errors=False):
    """Parses and executes a deployment script, returning logs."""
    lines = script_content.splitlines()
    i = 0
    output_log = []

    while i < len(lines):
        line = lines[i].strip()
        i += 1
        if not line:
            continue

        try:
            # Handle cat heredoc
            if line.startswith('cat >'):
                match = re.match(r"cat >\s+(?P<path>.*?)\s+<<\s+'" + re.escape(here_doc_value) + r"'", line)
                if not match:
                    raise ValueError(f"Invalid or unsupported 'cat' command format: {line}")
                
                relative_path = re.sub(r'^\./', '', match.group('path').strip("'\""))
                if not is_safe_path(project_path, relative_path):
                    raise PermissionError(f"Path traversal attempt detected: {relative_path}")
                
                full_path = os.path.join(project_path, relative_path.replace('/', os.sep))
                
                content_lines = []
                while i < len(lines):
                    content_line = lines[i]
                    if content_line.startswith(here_doc_value):
                        i += 1
                        break
                    content_lines.append(content_line)
                    i += 1
                else:
                    raise ValueError(f"Unterminated heredoc for file '{relative_path}'")
                
                file_content = "\n".join(content_lines)
                
                os.makedirs(os.path.dirname(full_path), exist_ok=True)
                with open(full_path, 'w', encoding='utf-8') as f:
                    f.write(file_content)
                output_log.append(f"Wrote file: {relative_path}")
                continue

            # Handle other commands
            try:
                parts = shlex.split(line)
            except ValueError as e:
                if tolerate_errors:
                    output_log.append(f"Skipped malformed line: {line}")
                    print(f"Warning (Execution): Tolerating malformed line: '{line}'. Error: {e}")
                    continue
                else:
                    raise ValueError(f"Invalid command format: {line}") from e
            
            if not parts: continue
            
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
                        try:
                            os.mkdir(full_path)
                            output_log.append(f"Created directory: {relative_path}")
                        except FileExistsError:
                            raise OSError(f"mkdir: cannot create directory ‘{relative_path}’: File exists")

            elif command == 'touch':
                for arg in args:
                    relative_path = re.sub(r'^\./', '', arg)
                    if not is_safe_path(project_path, relative_path): raise PermissionError(f"Traversal: {relative_path}")
                    full_path = os.path.join(project_path, relative_path.replace('/', os.sep))
                    os.makedirs(os.path.dirname(full_path), exist_ok=True)
                    with open(full_path, 'a'): os.utime(full_path, None)
                    output_log.append(f"Touched file: {relative_path}")

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
                    relative_path = re.sub(r'^\./', '', relative_path)
                    if not is_safe_path(project_path, relative_path): raise PermissionError(f"Traversal: {relative_path}")
                    full_path = os.path.join(project_path, relative_path.replace('/', os.sep))
                    try:
                        if os.path.isdir(full_path): raise IsADirectoryError(f"Cannot 'rm' a directory: {relative_path}")
                        os.remove(full_path)
                        output_log.append(f"Removed file: {relative_path}")
                    except FileNotFoundError:
                        output_log.append(f"Skipped removal (not found): {relative_path}")

            elif command == 'rmdir':
                for arg in args:
                    relative_path = re.sub(r'^\./', '', arg)
                    if not is_safe_path(project_path, relative_path): raise PermissionError(f"Traversal: {relative_path}")
                    full_path = os.path.join(project_path, relative_path.replace('/', os.sep))
                    try:
                        os.rmdir(full_path)
                        output_log.append(f"Removed directory: {relative_path}")
                    except OSError as e:
                        raise OSError(f"Could not rmdir '{relative_path}': {e}")
            
            elif command == 'chmod':
                if len(args) < 2:
                    raise ValueError("'chmod' requires a mode and at least one file.")
                
                mode_str = args[0]
                file_paths = args[1:]

                for relative_path_arg in file_paths:
                    relative_path = re.sub(r'^\./', '', relative_path_arg)
                    if not is_safe_path(project_path, relative_path):
                        raise PermissionError(f"Traversal: {relative_path}")
                    
                    full_path = os.path.join(project_path, relative_path.replace('/', os.sep))
                    if not os.path.exists(full_path):
                        raise FileNotFoundError(f"chmod: cannot access '{relative_path}': No such file or directory")

                    new_mode = 0
                    if mode_str.isdigit():
                        new_mode = int(mode_str, 8)
                    else:
                        current_mode = os.stat(full_path).st_mode
                        if mode_str == '+x':
                            new_mode = current_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH
                        else:
                            raise ValueError(f"Unsupported chmod mode: '{mode_str}'. Only octal and '+x' are supported.")
                    
                    os.chmod(full_path, new_mode)
                    output_log.append(f"Changed mode of {relative_path} to {mode_str}")

            elif command == 'mv':
                if len(args) != 2: raise ValueError("'mv' requires two arguments.")
                src, dest = re.sub(r'^\./', '', args[0]), re.sub(r'^\./', '', args[1])
                if not is_safe_path(project_path, src) or not is_safe_path(project_path, dest): raise PermissionError(f"Traversal: {src} or {dest}")
                full_src = os.path.join(project_path, src.replace('/', os.sep))
                full_dest = os.path.join(project_path, dest.replace('/', os.sep))
                os.makedirs(os.path.dirname(full_dest), exist_ok=True)
                os.rename(full_src, full_dest)
                output_log.append(f"Moved: {src} to {dest}")
            
            else:
                if tolerate_errors:
                    output_log.append(f"Skipped unsupported line: {line}")
                    print(f"Warning (Execution): Tolerating unsupported command in line: '{line}'")
                    continue
                else:
                    raise ValueError(f"Unsupported command: '{command}'")

        except (PermissionError, OSError, IsADirectoryError, FileNotFoundError) as e:
            raise type(e)(f"Failed on line {i}: '{line}'\n{str(e)}") from e
        except ValueError as e: # This will catch the `raise ValueError` from above if not tolerating.
            raise type(e)(f"Failed on line {i}: '{line}'\n{str(e)}") from e

    return output_log