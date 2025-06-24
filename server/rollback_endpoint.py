import os
import traceback
from flask import request, Response
from .tools import get_rollback_filepath, execute_script

def rollback():
    path = request.args.get('path')
    if not path or not path.strip():
        return Response("Error: 'path' parameter is missing.", status=400, mimetype='text/plain')
    
    project_path = os.path.abspath(path.strip())
    if not os.path.isdir(project_path):
        return Response(f"Error: Provided path '{project_path}' is not a valid directory.", status=400, mimetype='text/plain')

    rollback_filepath = get_rollback_filepath(project_path)
    if not os.path.isfile(rollback_filepath):
        return Response("nothing to rollback deploy something first", status=404, mimetype='text/plain')

    with open(rollback_filepath, 'r', encoding='utf-8') as f:
        script_content = f.read()
    
    if not script_content.strip():
        os.remove(rollback_filepath)
        return Response("nothing to rollback deploy something first", status=404, mimetype='text/plain')
        
    try:
        output_log = execute_script(script_content, project_path)
        os.remove(rollback_filepath)
        success_message = f"Successfully rolled back changes.\n--- LOG ---\n" + "\n".join(output_log)
        return Response(success_message, mimetype='text/plain')
    except Exception as e:
        error_details = f"Error during rollback:\n{str(e)}\n{traceback.format_exc()}"
        print(error_details)
        return Response(error_details, status=500, mimetype='text/plain')