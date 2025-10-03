import os
import fnmatch
import shlex
from .utils import here_doc_value

def is_binary(file_path):
    """
    Checks if a file is likely binary by reading a chunk and looking for null bytes.
    This mimics the logic from the JavaScript implementation.
    """
    try:
        with open(file_path, 'rb') as f:
            chunk = f.read(1024)
            return b'\x00' in chunk
    except OSError:
        return True # Cannot read, treat as binary/inaccessible

def get_file_stats(file_path):
    """
    Reads a single file and returns its content and stats if it's not binary.
    """
    if is_binary(file_path):
        return None, 0, 0
    try:
        with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read()
        content_length = len(content)
        # Align with JS logic: content.split('\n').length
        line_count = len(content.split('\n'))
        return content, content_length, line_count
    except OSError:
        return None, 0, 0

def generate_context_from_path(project_path, include_patterns, exclude_patterns, path_prefix=None):
    """
    Generates a project context string including a file tree and file contents,
    all implemented in pure Python to avoid shell command dependencies.
    """
    matching_files = []
    
    # Process patterns to mimic JS "startswith" behavior for directories
    processed_exclude_patterns = [p + '*' if p.endswith('/') else p for p in exclude_patterns]

    for dirpath, dirnames, filenames in os.walk(project_path, topdown=True):
        excluded_dirs = []
        for d in dirnames:
            dir_rel_path = os.path.relpath(os.path.join(dirpath, d), project_path)
            dir_rel_path_norm = dir_rel_path.replace('\\', '/')
            if any(fnmatch.fnmatch(dir_rel_path_norm, pat) for pat in processed_exclude_patterns):
                excluded_dirs.append(d)
        
        for d in excluded_dirs:
            dirnames.remove(d)

        for filename in filenames:
            file_full_path = os.path.join(dirpath, filename)
            
            if is_binary(file_full_path):
                continue

            file_rel_path = os.path.relpath(file_full_path, project_path)
            file_rel_path_norm = file_rel_path.replace('\\', '/')
            
            if any(fnmatch.fnmatch(file_rel_path_norm, pat) for pat in processed_exclude_patterns):
                continue
            
            if include_patterns and not any(fnmatch.fnmatch(filename, pat) for pat in include_patterns):
                continue
            
            matching_files.append(file_rel_path_norm)

    matching_files.sort()

    # Generate the tree structure from the list of files.
    tree_dict = {}
    for f in matching_files:
        parts = f.split('/')
        d = tree_dict
        for part in parts[:-1]:
            d = d.setdefault(part, {})
        d[parts[-1]] = None

    root_label = path_prefix if path_prefix else "."
    tree_lines = [root_label]
    def build_tree_str(d, prefix=""):
        # Sort items: directories first, then alphabetically by name
        items = sorted(d.keys(), key=lambda k: (d[k] is None, k))
        pointers = ['├── '] * (len(items) - 1) + ['└── ']
        for i, name in enumerate(items):
            pointer = pointers[i]
            is_dir = d[name] is not None
            tree_lines.append(f"{prefix}{pointer}{name}{'/' if is_dir else ''}")
            if is_dir:
                extension = '│   ' if pointer == '├── ' else '    '
                build_tree_str(d[name], prefix + extension)
    
    build_tree_str(tree_dict)
    tree_str = "\n".join(tree_lines)
    
    # Read file contents and format the final output string.
    output_parts = [tree_str, "\n\n"]
    for rel_path in matching_files:
        full_path = os.path.join(project_path, rel_path.replace('/', os.sep))
        try:
            with open(full_path, 'r', encoding='utf-8', errors='ignore') as f:
                content = f.read()
            
            if path_prefix:
                final_path_in_script = f"{path_prefix}/{rel_path}"
            else:
                final_path_in_script = './' + rel_path

            quoted_path = shlex.quote(final_path_in_script)
            output_parts.append(f"cat > {quoted_path} << '{here_doc_value}'\n")
            output_parts.append(content)
            output_parts.append(f"\n{here_doc_value}\n\n") # Added extra newline for spacing

        except Exception as e:
            print(f"Warning: Could not read file '{full_path}': {e}")
            continue
            
    return "".join(output_parts)


def generate_tree_with_char_counts(project_path, include_patterns, exclude_patterns, path_prefix=None):
    """
    Generates a file tree string with character and line counts for each file and directory.
    Returns the formatted tree string and the total character count.
    This version is aligned with the JavaScript implementation's counting and matching logic.
    """
    matching_files_data = []
    
    # Process patterns to mimic JS "startswith" behavior for directories
    processed_exclude_patterns = [p + '*' if p.endswith('/') else p for p in exclude_patterns]

    for dirpath, dirnames, filenames in os.walk(project_path, topdown=True):
        excluded_dirs = []
        for d in dirnames:
            dir_rel_path = os.path.relpath(os.path.join(dirpath, d), project_path)
            dir_rel_path_norm = dir_rel_path.replace('\\', '/')
            if any(fnmatch.fnmatch(dir_rel_path_norm, pat) for pat in processed_exclude_patterns):
                excluded_dirs.append(d)
        for d in excluded_dirs:
            dirnames.remove(d)

        for filename in filenames:
            file_full_path = os.path.join(dirpath, filename)
            
            if is_binary(file_full_path):
                continue
            
            file_rel_path = os.path.relpath(file_full_path, project_path)
            file_rel_path_norm = file_rel_path.replace('\\', '/')
            
            if any(fnmatch.fnmatch(file_rel_path_norm, pat) for pat in processed_exclude_patterns):
                continue
            if include_patterns and not any(fnmatch.fnmatch(filename, pat) for pat in include_patterns):
                continue
            
            try:
                with open(file_full_path, 'r', encoding='utf-8', errors='ignore') as f:
                    content = f.read()
                content_length = len(content)
                # Align with JS logic: content.split('\n').length
                line_count = len(content.split('\n'))
                matching_files_data.append((file_rel_path_norm, content_length, line_count))
            except OSError:
                continue
    
    file_stats = {path: {'chars': chars, 'lines': lines} for path, chars, lines in matching_files_data}
    total_chars = sum(stats['chars'] for stats in file_stats.values())
    total_lines = sum(stats['lines'] for stats in file_stats.values())
    
    tree_dict = {}
    dir_stats = {}

    for path, stats in file_stats.items():
        parts = path.split('/')
        current_path_prefix = ''
        for i, part in enumerate(parts[:-1]):
            current_path_prefix = '/'.join(parts[:i+1])
            
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
    
    root_label = path_prefix if path_prefix else "."
    tree_lines = [f"{root_label} {format_stats(total_chars, total_lines)}"]

    def build_tree_str(d, current_dir_path="", prefix=""):
        items = sorted(d.keys(), key=lambda k: (d[k] is None, k))
        pointers = ['├── '] * (len(items) - 1) + ['└── ']
        for i, name in enumerate(items):
            pointer = pointers[i]
            
            rel_path = f"{current_dir_path}/{name}" if current_dir_path else name
            
            if d[name] is not None:
                stats = dir_stats.get(rel_path, {'chars': 0, 'lines': 0})
                stats_str = format_stats(stats['chars'], stats['lines'])
                tree_lines.append(f"{prefix}{pointer}{name}/ {stats_str}")
                extension = '│   ' if pointer == '├── ' else '    '
                build_tree_str(d[name], rel_path, prefix + extension)
            else:
                stats = file_stats.get(rel_path, {'chars': 0, 'lines': 0})
                stats_str = format_stats(stats['chars'], stats['lines'])
                tree_lines.append(f"{prefix}{pointer}{name} {stats_str}")
                
    build_tree_str(tree_dict)
    
    return "\n".join(tree_lines), total_chars