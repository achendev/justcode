import os
import fnmatch
import shlex
from .utils import here_doc_value

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