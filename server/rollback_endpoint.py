import os
import traceback
from flask import request, Response
from .tools import get_sorted_rollback_files, execute_script

def rollback():
    path = request.args.get('path')
    if not path or not path.strip():
        return Response("Error: 'path' parameter is missing.", status=400, mimetype='text/plain')
    
    project_path = os.path.abspath(path.strip())
    if not os.path.isdir(project_path):
        return Response(f"Error: Provided path '{project_path}' is not a valid directory.", status=400, mimetype='text/plain')

    all_rollback_files = get_sorted_rollback_files(project_path)

    if request.method == 'GET':
        return Response(str(len(all_rollback_files)), mimetype='text/plain')
    
    if request.method == 'POST':
        if not all_rollback_files:
            return Response("No rollback script found for this project.", status=404, mimetype='text/plain')

        latest_rollback_filepath = all_rollback_files[-1] # Get the newest one

        with open(latest_rollback_filepath, 'r', encoding='utf-8') as f:
            script_content = f.read()
        
        if not script_content.strip():
            os.remove(latest_rollback_filepath)
            return Response("The latest rollback script was empty, nothing to do.", status=404, mimetype='text/plain')
            
        try:
            output_log = execute_script(script_content, project_path)
            os.remove(latest_rollback_filepath) # Clean up after successful rollback
            success_message = f"Successfully rolled back changes.\n--- LOG ---\n" + "\n".join(output_log)
            return Response(success_message, mimetype='text/plain')
        except Exception as e:
            error_details = f"Error during rollback:\n{str(e)}\n{traceback.format_exc()}"
            print(error_details)
            return Response(error_details, status=500, mimetype='text/plain')
    
    # Should not be reached
    return Response("Unsupported method.", status=405, mimetype='text/plain')