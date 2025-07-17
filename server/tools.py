import os
import re
import fnmatch
import shlex
import time
import glob
import stat
import hashlib

here_doc_value = 'EOPROJECTFILE'

def generate_context_from_path(project_path, include_patterns, exclude_patterns):
    """
    Generates a project context string including a file tree and file contents,
    all implemented in pure Python to avoid shell command dependencies.
    """
    
    # 1. Walk the filesystem to get all files, respecting exclusions.
    matching_files = []
    for dirpath, dirnames, filenames in os.walk(project_path, topdown=True):
        # Exclude directories by modifying dirnames in place
        excluded_dirs = []
        for d in dirnames:
            dir_rel_path = os.path.relpath(os.path.join(dirpath, d), project_path)
            # Normalize path for matching, and match against patterns
            dir_rel_path_norm = dir_rel_path.replace('\\', '/')
            if any(fnmatch.fnmatch(dir_rel_path_norm, pat) or fnmatch.fnmatch(dir_rel_path_norm + '/', pat) for pat in exclude_patterns):
                excluded_dirs.append(d)
        
        for d in excluded_dirs:
            dirnames.remove(d)

        for filename in filenames:
            file_full_path = os.path.join(dirpath, filename)
            file_rel_path = os.path.relpath(file_full_path, project_path)
            # Normalize path for matching
            file_rel_path_norm = file_rel_path.replace('\\', '/')
            
            # Check exclusion patterns against relative path
            if any(fnmatch.fnmatch(file_rel_path_norm, pat) for pat in exclude_patterns):
                continue
            
            # Check inclusion patterns against filename (basename)
            if include_patterns:
                if not any(fnmatch.fnmatch(filename, pat) for pat in include_patterns):
                    continue
            
            # Skip non-text files, but allow empty text files (like __init__.py)
            try:
                # Simple check to avoid including binary files by trying to read it as text
                with open(file_full_path, 'r', encoding='utf-8') as f:
                    f.read(1024) # Try reading a small chunk
            except (OSError, UnicodeDecodeError):
                continue # Skip binary files or files we can't read

            matching_files.append(file_rel_path_norm)

    matching_files.sort()

    # 2. Generate the tree structure from the list of files.
    tree_dict = {}
    for f in matching_files:
        parts = f.split('/')
        d = tree_dict
        for part in parts[:-1]:
            d = d.setdefault(part, {})
        d[parts[-1]] = None  # Using None to signify a file

    tree_lines = ["."]
    def build_tree_str(d, prefix=""):
        items = sorted(d.keys())
        pointers = ['├── '] * (len(items) - 1) + ['└── ']
        for i, name in enumerate(items):
            pointer = pointers[i]
            tree_lines.append(f"{prefix}{pointer}{name}")
            if d[name] is not None:  # It's a directory, so recurse
                extension = '│   ' if pointer == '├── ' else '    '
                build_tree_str(d[name], prefix + extension)
    
    build_tree_str(tree_dict)
    tree_str = "\n".join(tree_lines)
    
    # 3. Read file contents and format the final output string.
    output_parts = [tree_str, "\n\n"]
    for rel_path in matching_files:
        # For reading, use the OS-specific path.
        full_path = os.path.join(project_path, rel_path.replace('/', os.sep))
        try:
            with open(full_path, 'r', encoding='utf-8', errors='ignore') as f:
                content = f.read()
            
            # For the command sent to the LLM, always use Unix-style paths.
            # Quote the path to handle spaces correctly.
            quoted_path = shlex.quote('./' + rel_path)
            output_parts.append(f"cat > {quoted_path} << '{here_doc_value}'\n")
            output_parts.append(content)
            output_parts.append(f"\n{here_doc_value}\n")

        except Exception as e:
            print(f"Warning: Could not read file '{full_path}': {e}")
            continue
            
    return "".join(output_parts)


def generate_tree_with_char_counts(project_path, include_patterns, exclude_patterns):
    """
    Generates a file tree string with character and line counts for each file and directory.
    Returns the formatted tree string and the total character count.
    """
    matching_files_data = [] # List of tuples (rel_path_norm, content_length, line_count)
    for dirpath, dirnames, filenames in os.walk(project_path, topdown=True):
        # Exclude directories by modifying dirnames in place
        excluded_dirs = []
        for d in dirnames:
            dir_rel_path = os.path.relpath(os.path.join(dirpath, d), project_path)
            dir_rel_path_norm = dir_rel_path.replace('\\', '/')
            if any(fnmatch.fnmatch(dir_rel_path_norm, pat) or fnmatch.fnmatch(dir_rel_path_norm + '/', pat) for pat in exclude_patterns):
                excluded_dirs.append(d)
        for d in excluded_dirs:
            dirnames.remove(d)

        for filename in filenames:
            file_full_path = os.path.join(dirpath, filename)
            file_rel_path = os.path.relpath(file_full_path, project_path)
            file_rel_path_norm = file_rel_path.replace('\\', '/')
            
            if any(fnmatch.fnmatch(file_rel_path_norm, pat) for pat in exclude_patterns):
                continue
            if include_patterns and not any(fnmatch.fnmatch(filename, pat) for pat in include_patterns):
                continue
            
            try:
                with open(file_full_path, 'r', encoding='utf-8', errors='ignore') as f:
                    content = f.read()
                    content_length = len(content)
                    line_count = len(content.splitlines())
                matching_files_data.append((file_rel_path_norm, content_length, line_count))
            except (OSError, UnicodeDecodeError):
                continue
    
    file_stats = {path: {'chars': chars, 'lines': lines} for path, chars, lines in matching_files_data}
    total_chars = sum(stats['chars'] for stats in file_stats.values())
    total_lines = sum(stats['lines'] for stats in file_stats.values())
    
    tree_dict = {}
    dir_stats = {}

    for path, stats in file_stats.items():
        parts = path.split('/')
        current_path_prefix = ''
        for part in parts[:-1]:
            if current_path_prefix:
                current_path_prefix = f"{current_path_prefix}/{part}"
            else:
                current_path_prefix = part
            
            current_dir_stat = dir_stats.get(current_path_prefix, {'chars': 0, 'lines': 0})
            current_dir_stat['chars'] += stats['chars']
            current_dir_stat['lines'] += stats['lines']
            dir_stats[current_path_prefix] = current_dir_stat

        d = tree_dict
        for part in parts[:-1]:
            d = d.setdefault(part, {})
        d[parts[-1]] = None

    def format_stats(s_chars, s_lines):
        return f"({s_chars:,} chars, {s_lines:,} lines)"
    
    tree_lines = [f". {format_stats(total_chars, total_lines)}"]

    def build_tree_str(d, current_dir_path="", prefix=""):
        # Sort items: directories first, then alphabetically by name
        items = sorted(d.keys(), key=lambda k: (d[k] is None, k))
        pointers = ['├── '] * (len(items) - 1) + ['└── ']
        for i, name in enumerate(items):
            pointer = pointers[i]
            
            if current_dir_path:
                rel_path = f"{current_dir_path}/{name}"
            else:
                rel_path = name
            
            if d[name] is not None:  # It's a directory
                stats = dir_stats.get(rel_path, {'chars': 0, 'lines': 0})
                stats_str = format_stats(stats['chars'], stats['lines'])
                tree_lines.append(f"{prefix}{pointer}{name}/ {stats_str}")
                extension = '│   ' if pointer == '├── ' else '    '
                build_tree_str(d[name], rel_path, prefix + extension)
            else: # It's a file
                stats = file_stats.get(rel_path, {'chars': 0, 'lines': 0})
                stats_str = format_stats(stats['chars'], stats['lines'])
                tree_lines.append(f"{prefix}{pointer}{name} {stats_str}")
                
    build_tree_str(tree_dict)
    
    return "\n".join(tree_lines), total_chars


def is_safe_path(base_dir, target_path):
    """
    Checks if a target path is safely within a base directory to prevent path traversal.
    """
    base_dir_abs = os.path.abspath(base_dir)
    target_path_abs = os.path.abspath(os.path.join(base_dir, target_path))
    return target_path_abs.startswith(base_dir_abs)

def _get_justcode_root():
    """Gets the root directory of the JustCode application itself."""
    return os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))

def _get_project_id(project_path):
    """Creates a stable, filesystem-safe ID from a project path by sanitizing it."""
    sanitized_path = re.sub(r'[^a-zA-Z0-9_.-]', '_', os.path.abspath(project_path))
    return sanitized_path

def _get_history_dir(project_path, stack_type):
    """Gets the path to the undo or redo stack directory for a specific project."""
    justcode_root = _get_justcode_root()
    project_id = _get_project_id(project_path)
    history_dir = os.path.join(justcode_root, ".justcode", project_id, f"{stack_type}_stack")
    os.makedirs(history_dir, exist_ok=True)
    return history_dir

def clear_stack(project_path, stack_type):
    """Deletes all scripts in a given stack for a specific project."""
    stack_dir = _get_history_dir(project_path, stack_type)
    if os.path.exists(stack_dir):
        for f in os.listdir(stack_dir):
            os.remove(os.path.join(stack_dir, f))

def get_sorted_stack_timestamps(project_path, stack_type):
    """Gets a list of all script timestamps for a project stack, sorted oldest to newest."""
    stack_dir = _get_history_dir(project_path, stack_type)
    if not os.path.exists(stack_dir):
        return []
    timestamps = set()
    for filename in os.listdir(stack_dir):
        parts = os.path.basename(filename).split('.')
        if len(parts) > 0 and parts[0].isdigit():
            timestamps.add(parts[0])
    
    sorted_timestamps = sorted(list(timestamps), key=int)
    return sorted_timestamps


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
                
                full_path = os.path.join(project_path, relative_path)
                
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
                    full_path = os.path.join(project_path, relative_path)
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
                    full_path = os.path.join(project_path, relative_path)
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
                    full_path = os.path.join(project_path, relative_path)
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
                    full_path = os.path.join(project_path, relative_path)
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
                    
                    full_path = os.path.join(project_path, relative_path)
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
                full_src = os.path.join(project_path, src)
                full_dest = os.path.join(project_path, dest)
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