import os
import re
import hashlib

# Default fallback if no delimiter is provided
here_doc_value = 'EOPROJECTFILE'

# In-memory cache for file stats (Context Manager)
# Key: project_id (hash of absolute paths)
# Value: { 'non_excluded_stats': list, 'excluded_stats': list, 'status': str, 'exclude_hash': str }
STATS_CACHE = {}

def invalidate_stats_cache(project_paths):
    """Invalidates the context manager file stats cache for the given project paths."""
    try:
        project_id = get_project_id(project_paths)
        if project_id in STATS_CACHE:
            del STATS_CACHE[project_id]
            print(f"Stats cache invalidated for project: {project_id}")
    except Exception as e:
        print(f"Error invalidating stats cache: {e}")

def is_safe_path(base_dir, target_path):
    """
    Checks if a target path is safely within a base directory to prevent path traversal.
    """
    base_dir_abs = os.path.abspath(base_dir)
    target_path_abs = os.path.abspath(os.path.join(base_dir, target_path))
    return target_path_abs.startswith(base_dir_abs)

def get_justcode_root():
    """Gets the root directory of the JustCode application itself."""
    return os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))

def get_project_id(project_path_or_paths):
    """Creates a stable, filesystem-safe ID from a project path or list of paths."""
    if isinstance(project_path_or_paths, list):
        sorted_paths = sorted([os.path.abspath(p) for p in project_path_or_paths])
        path_string = ";".join(sorted_paths)
    else:
        path_string = os.path.abspath(project_path_or_paths)
        
    sanitized_path = re.sub(r'[^a-zA-Z0-9_.-]', '_', path_string)
    
    # Filesystems typically limit directory names to 255 characters.
    # To prevent 'OSError: [Errno 36] File name too long' on multi-project or deep paths,
    # we truncate the name and append an MD5 hash of the original path string if it exceeds 100 characters.
    # MD5 is 32 chars, meaning the total length will be safely 100 + 1 + 32 = 133 chars.
    if len(sanitized_path) > 100:
        hashed = hashlib.md5(path_string.encode('utf-8')).hexdigest()
        return f"{sanitized_path[:100]}_{hashed}"
        
    return sanitized_path