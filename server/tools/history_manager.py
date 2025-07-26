import os
from .utils import get_justcode_root, get_project_id

def get_history_dir(project_path, stack_type):
    """Gets the path to the undo or redo stack directory for a specific project."""
    justcode_root = get_justcode_root()
    project_id = get_project_id(project_path)
    history_dir = os.path.join(justcode_root, ".justcode", project_id, f"{stack_type}_stack")
    os.makedirs(history_dir, exist_ok=True)
    return history_dir

def clear_stack(project_path, stack_type):
    """Deletes all scripts in a given stack for a specific project."""
    stack_dir = get_history_dir(project_path, stack_type)
    if os.path.exists(stack_dir):
        for f in os.listdir(stack_dir):
            os.remove(os.path.join(stack_dir, f))

def get_sorted_stack_timestamps(project_path, stack_type):
    """Gets a list of all script timestamps for a project stack, sorted oldest to newest."""
    stack_dir = get_history_dir(project_path, stack_type)
    if not os.path.exists(stack_dir):
        return []
    timestamps = set()
    for filename in os.listdir(stack_dir):
        parts = os.path.basename(filename).split('.')
        if len(parts) > 0 and parts[0].isdigit():
            timestamps.add(parts[0])
    
    sorted_timestamps = sorted(list(timestamps), key=int)
    return sorted_timestamps