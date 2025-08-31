import os
import traceback
import json
import subprocess
from flask import request, Response
from .tools.context_generator import generate_context_from_path, generate_tree_with_char_counts

def get_context():
    path = request.args.get('path')
    exclude_str = request.args.get('exclude', '')
    include_str = request.args.get('include', '')
    context_size_limit = int(request.args.get('limit', 3000000))
    suggest_exclusions = request.args.get('suggest_exclusions', 'false').lower() == 'true'
    gather_context = request.args.get('gather_context', 'false').lower() == 'true'
    context_script = request.args.get('context_script', '')

    if not path or not path.strip():
        return Response("Error: 'path' parameter is missing.", status=400, mimetype='text/plain')

    project_path = os.path.abspath(path.strip())

    if not os.path.isdir(project_path):
        return Response(f"Error: Provided path '{project_path}' is not a valid directory.", status=400, mimetype='text/plain')

    print(f"Set project path to: {project_path}")

    exclude_patterns = [p.strip() for p in exclude_str.split(',') if p.strip()]
    include_patterns = [p.strip() for p in include_str.split(',') if p.strip()]

    try:
        tree_with_counts, total_size = generate_tree_with_char_counts(project_path, include_patterns, exclude_patterns)

        if suggest_exclusions:
            print("Exclusion suggestion data requested. Returning tree and size.")
            response_data = {
                "treeString": tree_with_counts,
                "totalChars": total_size
            }
            return Response(json.dumps(response_data), mimetype='application/json')

        if total_size > context_size_limit:
            print(f"Context size ({total_size}) exceeds limit ({context_size_limit}). Returning error.")
            error_message = f"Context size (~{total_size:,}) exceeds limit ({context_size_limit:,})."
            return Response(error_message, status=413, mimetype='text/plain')
        
        file_contents = generate_context_from_path(project_path, include_patterns, exclude_patterns)
        
        if gather_context and context_script:
            try:
                # Normalize line endings and split into individual commands
                script_for_display = context_script.replace('\r\n', '\n')
                commands = [cmd for cmd in script_for_display.split('\n') if cmd.strip()]
                
                output_parts = [
                    "\n\n# Additional context from script:\n",
                    f"# CWD: {project_path}\n",
                    f"# SCRIPT:\n# ---\n",
                ]
                # Add the original script content to the header for clarity
                for s_line in script_for_display.split('\n'):
                    output_parts.append(f"# {s_line}\n")
                output_parts.append("# ---\n")
                
                # Execute each command individually and format output to look like a terminal
                for command in commands:
                    output_parts.append("\n") # Add spacing between commands
                    output_parts.append(f"$ {command}\n") # The command prompt

                    result = subprocess.run(
                        command,
                        shell=True,
                        cwd=project_path,
                        capture_output=True,
                        text=True,
                        check=False # We show stderr manually
                    )
                    
                    if result.stdout:
                        output_parts.append(result.stdout)
                        if not result.stdout.endswith('\n'):
                            output_parts.append('\n')

                    if result.stderr:
                        output_parts.append(result.stderr)
                        if not result.stderr.endswith('\n'):
                            output_parts.append('\n')
                
                additional_context_output = "".join(output_parts)
                file_contents += additional_context_output
                
            except Exception as e:
                error_output = f"\n\n# --- ERROR EXECUTING ADDITIONAL CONTEXT SCRIPT ---\n# {e}\n# ---\n"
                file_contents += error_output
        
        return Response(file_contents, mimetype='text/plain')
        
    except Exception as e:
        error_message = f"An unexpected error occurred in '{project_path}': {e}\n{traceback.format_exc()}"
        print(error_message)
        return Response(error_message, status=500, mimetype='text/plain')