import os
import re
import fnmatch
import shlex

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
            
            # Skip empty files and non-text files
            try:
                if os.path.getsize(file_full_path) == 0:
                    continue
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
            output_parts.append(f"cat > ./{rel_path} << '{here_doc_value}'\n")
            output_parts.append(content)
            output_parts.append(f"\n{here_doc_value}\n\n\n\n\n")

        except Exception as e:
            print(f"Warning: Could not read file '{full_path}': {e}")
            continue
            
    return "".join(output_parts)


def is_safe_path(base_dir, target_path):
    """
    Checks if a target path is safely within a base directory to prevent path traversal.
    `os.path.join` handles converting '/' from the LLM to the correct OS separator.
    """
    base_dir_abs = os.path.abspath(base_dir)
    target_path_abs = os.path.abspath(os.path.join(base_dir, target_path))
    return target_path_abs.startswith(base_dir_abs)

def get_rollback_filepath(project_path):
    """Creates a safe filepath for the rollback script."""
    rollback_dir = "rollback_scripts"
    os.makedirs(rollback_dir, exist_ok=True)
    sanitized_filename = re.sub(r'[\\/:\s]', '_', project_path).strip('_') + ".sh"
    return os.path.join(rollback_dir, sanitized_filename)

def execute_script(script_content, project_path):
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
                
                relative_path = match.group('path').strip("'\"").lstrip('./')
                if not is_safe_path(project_path, relative_path):
                    raise PermissionError(f"Path traversal attempt detected: {relative_path}")
                
                full_path = os.path.join(project_path, relative_path)
                
                content_lines = []
                while i < len(lines):
                    content_line = lines[i]
                    if content_line == here_doc_value:
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
            parts = shlex.split(line)
            if not parts: continue
            
            command, args = parts[0], parts[1:]

            if command == 'mkdir':
                for arg in args:
                    relative_path = arg.lstrip('./')
                    if not is_safe_path(project_path, relative_path): raise PermissionError(f"Traversal: {relative_path}")
                    os.makedirs(os.path.join(project_path, relative_path), exist_ok=True)
                    output_log.append(f"Created directory: {relative_path}")

            elif command == 'touch':
                for arg in args:
                    relative_path = arg.lstrip('./')
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
                    relative_path = relative_path.lstrip('./')
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
                    relative_path = arg.lstrip('./')
                    if not is_safe_path(project_path, relative_path): raise PermissionError(f"Traversal: {relative_path}")
                    full_path = os.path.join(project_path, relative_path)
                    try:
                        os.rmdir(full_path)
                        output_log.append(f"Removed directory: {relative_path}")
                    except OSError as e:
                        raise OSError(f"Could not rmdir '{relative_path}': {e}")

            elif command == 'mv':
                if len(args) != 2: raise ValueError("'mv' requires two arguments.")
                src, dest = args[0].lstrip('./'), args[1].lstrip('./')
                if not is_safe_path(project_path, src) or not is_safe_path(project_path, dest): raise PermissionError(f"Traversal: {src} or {dest}")
                full_src = os.path.join(project_path, src)
                full_dest = os.path.join(project_path, dest)
                os.makedirs(os.path.dirname(full_dest), exist_ok=True)
                os.rename(full_src, full_dest)
                output_log.append(f"Moved: {src} to {dest}")
            
            else:
                raise ValueError(f"Unsupported command: '{command}'")

        except (ValueError, PermissionError, OSError, IsADirectoryError) as e:
            raise type(e)(f"Failed on line {i}: '{line}'\n{str(e)}") from e

    return output_log