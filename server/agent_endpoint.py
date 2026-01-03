import os
from flask import request, Response
from .tools.agent_executor import execute_shell_command
from .tools.script_executor import resolve_path

def agent_execute():
    paths = request.args.getlist('path')
    use_numeric_prefixes = request.args.get('useNumericPrefixes', 'false').lower() == 'true'

    if not paths or not any(p.strip() for p in paths):
        return Response("Error: 'path' parameter is missing.", status=400, mimetype='text/plain')
    
    project_paths = [os.path.abspath(p.strip()) for p in paths if p.strip()]

    # Security/Validity check on paths
    for p_path in project_paths:
        if not os.path.exists(p_path):
            return Response(f"Error: Provided path '{p_path}' is not a valid directory or file.", status=400, mimetype='text/plain')

    try:
        data = request.get_json(force=True)
        if not data or 'command' not in data:
            return Response("Error: 'command' JSON field is missing.", status=400, mimetype='text/plain')
        
        command = data['command']
        
        # Determine Working Directory
        # Default to the first project path.
        # If the user provided a specific path context in the command logic (not implemented here), we could use it.
        # For now, we execute in the root of the first project.
        cwd = project_paths[0]
        if os.path.isfile(cwd):
            cwd = os.path.dirname(cwd)

        output = execute_shell_command(command, cwd)
        return Response(output, mimetype='text/plain')

    except Exception as e:
        return Response(f"Server Error: {str(e)}", status=500, mimetype='text/plain')