import os
import re

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
    # This file is in server/tools, so we go up two levels to the project root.
    return os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))

def get_project_id(project_path):
    """Creates a stable, filesystem-safe ID from a project path by sanitizing it."""
    sanitized_path = re.sub(r'[^a-zA-Z0-9_.-]', '_', os.path.abspath(project_path))
    return sanitized_path