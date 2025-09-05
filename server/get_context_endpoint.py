import os
import traceback
import json
import subprocess
from flask import request, Response
from .tools.context_generator import generate_context_from_path, generate_tree_with_char_counts

def get_context():
    paths = request.args.getlist('path')
    exclude_str = request.args.get('exclude', '')
    include_str = request.args.get('include', '')
    context_size_limit = int(request.args.get('limit', 3000000))
    suggest_exclusions = request.args.get('suggest_exclusions', 'false').lower() == 'true'
    gather_context = request.args.get('gather_context', 'false').lower() == 'true'
    context_script = request.args.get('context_script', '')
    use_numeric_prefixes = request.args.get('useNumericPrefixes', 'false').lower() == 'true'

    if not paths or not any(p.strip() for p in paths):
        return Response("Error: 'path' parameter is missing.", status=400, mimetype='text/plain')

    project_paths = [os.path.abspath(p.strip()) for p in paths if p.strip()]
    is_single_project = len(project_paths) == 1

    if not use_numeric_prefixes and not is_single_project:
        project_names = [os.path.basename(p) for p in project_paths]
        if len(project_names) != len(set(project_names)):
            return Response("Error: Multiple project paths have the same directory name. Please enable 'Name by order number' in profile settings to resolve ambiguity.", status=400, mimetype='text/plain')

    for p_path in project_paths:
        if not os.path.isdir(p_path):
            return Response(f"Error: Provided path '{p_path}' is not a valid directory.", status=400, mimetype='text/plain')
        print(f"Using project path: {p_path}")

    exclude_patterns = [p.strip() for p in exclude_str.split(',') if p.strip()]
    include_patterns = [p.strip() for p in include_str.split(',') if p.strip()]

    try:
        # --- Generate Tree and Check Size ---
        all_trees = []
        total_size = 0
        
        for i, p_path in enumerate(project_paths):
            prefix = None
            if not is_single_project:
                prefix = f"./{i}" if use_numeric_prefixes else f"./{os.path.basename(p_path)}"
            tree, size = generate_tree_with_char_counts(p_path, include_patterns, exclude_patterns, path_prefix=prefix)
            all_trees.append(tree)
            total_size += size
        
        tree_with_counts = "\n\n".join(all_trees)

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
        
        # --- Generate File Contents ---
        all_contents = []
        for i, p_path in enumerate(project_paths):
            prefix = None
            if not is_single_project:
                prefix = f"./{i}" if use_numeric_prefixes else f"./{os.path.basename(p_path)}"
            content = generate_context_from_path(p_path, include_patterns, exclude_patterns, path_prefix=prefix)
            all_contents.append(content)

        file_contents = "\n\n".join(all_contents).strip()
        
        # --- Gather Additional Context (if enabled and only for the first project path) ---
        if gather_context and context_script:
            main_project_path = project_paths[0]
            try:
                script_for_display = context_script.replace('\r\n', '\n')
                commands = [cmd for cmd in script_for_display.split('\n') if cmd.strip()]
                
                output_parts = [
                    "\n\n# Additional context from script:\n",
                    f"# CWD: {main_project_path}\n",
                    f"# SCRIPT:\n# ---\n",
                ]
                for s_line in script_for_display.split('\n'):
                    output_parts.append(f"# {s_line}\n")
                output_parts.append("# ---\n")
                
                for command in commands:
                    output_parts.append("\n")
                    output_parts.append(f"$ {command}\n")

                    result = subprocess.run(
                        command, shell=True, cwd=main_project_path,
                        capture_output=True, text=True, check=False
                    )
                    
                    if result.stdout:
                        output_parts.append(result.stdout)
                        if not result.stdout.endswith('\n'): output_parts.append('\n')
                    if result.stderr:
                        output_parts.append(result.stderr)
                        if not result.stderr.endswith('\n'): output_parts.append('\n')
                
                additional_context_output = "".join(output_parts)
                file_contents += additional_context_output
                
            except Exception as e:
                error_output = f"\n\n# --- ERROR EXECUTING ADDITIONAL CONTEXT SCRIPT ---\n# {e}\n# ---\n"
                file_contents += error_output
        
        return Response(file_contents, mimetype='text/plain')
        
    except Exception as e:
        error_message = f"An unexpected error occurred: {e}\n{traceback.format_exc()}"
        print(error_message)
        return Response(error_message, status=500, mimetype='text/plain')