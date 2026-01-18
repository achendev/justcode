import os
import re

# Default fallback if no delimiter is provided
here_doc_value = 'EOPROJECTFILE'

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
    return sanitized_path