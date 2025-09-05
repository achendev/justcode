import os
import traceback
import shutil
from flask import request, Response
from .tools.history_manager import get_sorted_stack_timestamps, get_history_dir
from .tools.script_executor import execute_script

def undo(): # This is the UNDO action
    paths = request.args.getlist('path')
    if not paths or not any(p.strip() for p in paths):
        return Response("Error: 'path' parameter is missing.", status=400, mimetype='text/plain')
    
    project_paths = [os.path.abspath(p.strip()) for p in paths if p.strip()]
    for p_path in project_paths:
        if not os.path.isdir(p_path):
            return Response(f"Error: Provided path '{p_path}' is not a valid directory.", status=400, mimetype='text/plain')

    all_undo_timestamps = get_sorted_stack_timestamps(project_paths, 'undo')

    if request.method == 'GET':
        return Response(str(len(all_undo_timestamps)), mimetype='text/plain')
    
    if request.method == 'POST':
        tolerate_errors = request.args.get('tolerateErrors', 'true').lower() == 'true'
        if not all_undo_timestamps:
            return Response("No actions to undo.", status=404, mimetype='text/plain')

        latest_timestamp = all_undo_timestamps[-1]
        
        undo_stack_dir = get_history_dir(project_paths, 'undo')
        redo_stack_dir = get_history_dir(project_paths, 'redo')

        undo_script_path = os.path.join(undo_stack_dir, f"{latest_timestamp}.sh")
        redo_script_path = os.path.join(undo_stack_dir, f"{latest_timestamp}.redo")

        if not os.path.exists(undo_script_path) or not os.path.exists(redo_script_path):
             return Response(f"History is corrupt. Missing files for timestamp {latest_timestamp}.", status=500, mimetype='text/plain')

        with open(undo_script_path, 'r', encoding='utf-8') as f:
            script_content = f.read()
        
        try:
            output_log, error_log = execute_script(script_content, project_paths, tolerate_errors)
            
            # Move the script pair to the redo stack
            shutil.move(undo_script_path, os.path.join(redo_stack_dir, f"{latest_timestamp}.sh"))
            shutil.move(redo_script_path, os.path.join(redo_stack_dir, f"{latest_timestamp}.redo"))
            
            message = ""
            if error_log:
                message += "Undo completed with some ignored errors:\n\n"
                message += "\n---\n".join(error_log)
                message += "\n\n--- SUCCESSFUL ACTIONS LOG ---\n"
            else:
                message = "Successfully undone changes.\n--- LOG ---\n"
            message += "\n".join(output_log)

            return Response(message, mimetype='text/plain')
            
        except Exception as e:
            error_details = f"Error during undo operation:\n{str(e)}\n{traceback.format_exc()}"
            print(error_details)
            return Response(error_details, status=500, mimetype='text/plain')
    
    return Response("Unsupported method.", status=405, mimetype='text/plain')