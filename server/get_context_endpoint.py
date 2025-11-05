import os
import traceback
import json
import subprocess
import shlex
import re
from flask import request, Response
from .tools.context_generator import generate_context_from_path, generate_tree_with_char_counts, get_file_stats
from .tools.utils import here_doc_value

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
    is_single_path = len(project_paths) == 1

    if not use_numeric_prefixes and not is_single_path:
        # Check for unique basenames for directories, and unique "parent/file" for files
        names_to_check = []
        for p in project_paths:
            if os.path.isdir(p):
                names_to_check.append(os.path.basename(p))
            elif os.path.isfile(p):
                parent_dir_name = os.path.basename(os.path.dirname(p))
                file_name = os.path.basename(p)
                names_to_check.append(f"{parent_dir_name}/{file_name}")

        if len(names_to_check) != len(set(names_to_check)):
            return Response("Error: Multiple project paths result in the same name in the context. Please enable 'Name by order number' in profile settings to resolve ambiguity.", status=400)

    exclude_patterns = [p.strip() for p in exclude_str.split(',') if p.strip()]
    include_patterns = [p.strip() for p in include_str.split(',') if p.strip()]

    try:
        all_trees_with_counts = []
        all_trees_for_context = []
        all_contents_for_script = []
        total_size = 0

        for i, p_path in enumerate(project_paths):
            if os.path.isdir(p_path):
                prefix = None
                if not is_single_path:
                    prefix = f"./{i}" if use_numeric_prefixes else f"./{os.path.basename(p_path)}"
                
                # For size checking and exclusion suggestions, we still need the combined tree with stats
                tree_with_stats, size = generate_tree_with_char_counts(p_path, include_patterns, exclude_patterns, path_prefix=prefix)
                all_trees_with_counts.append(tree_with_stats)
                total_size += size
                
                # For the actual context, generate the string and then split it
                full_context_for_path = generate_context_from_path(p_path, include_patterns, exclude_patterns, path_prefix=prefix)
                
                # Split the string into tree and content parts using a robust regex
                parts = re.split(r'\n\n(?=cat >)', full_context_for_path, 1)

                if len(parts) == 2:
                    tree_part, content_part = parts
                    all_trees_for_context.append(tree_part)
                    all_contents_for_script.append(content_part)
                elif parts: # Handles case with an empty directory (only a tree part)
                    all_trees_for_context.append(parts[0])

            elif os.path.isfile(p_path):
                content, size, lines = get_file_stats(p_path)
                if content is None:
                    continue
                
                total_size += size
                filename = os.path.basename(p_path)

                def format_stats(s_chars, s_lines):
                    return f"({s_chars:,} chars, {s_lines:,} lines)"
                
                if is_single_path:
                    tree_line = f"./{filename} {format_stats(size, lines)}"
                    path_in_script = f"./{filename}"
                else:
                    if use_numeric_prefixes:
                        prefix_part = str(i)
                    else:
                        parent_dir_name = os.path.basename(os.path.dirname(p_path))
                        prefix_part = f"{parent_dir_name}/{filename}"
                    
                    tree_line = f"./{prefix_part} {format_stats(size, lines)}"
                    path_in_script = f"./{prefix_part}"
                
                all_trees_with_counts.append(tree_line)
                all_trees_for_context.append(tree_line)
                
                quoted_path = shlex.quote(path_in_script)
                content_string = f"cat > {quoted_path} << '{here_doc_value}'\n{content}\n{here_doc_value}\n\n"
                all_contents_for_script.append(content_string)

            else:
                 return Response(f"Error: Provided path '{p_path}' is not a valid directory or file.", status=400, mimetype='text/plain')
        
        tree_with_counts = "\n\n".join(all_trees_with_counts)

        if suggest_exclusions:
            response_data = {"treeString": tree_with_counts, "totalChars": total_size}
            return Response(json.dumps(response_data), mimetype='application/json')

        if total_size > context_size_limit:
            error_message = f"Context size (~{total_size:,}) exceeds limit ({context_size_limit:,})."
            return Response(error_message, status=413, mimetype='text/plain')
        
        # Correctly assemble the final context string from the separated parts
        final_tree = "\n\n".join(all_trees_for_context)
        final_content = "".join(all_contents_for_script)
        file_contents = (final_tree + "\n\n" + final_content) if final_content else final_tree
        
        if gather_context and context_script:
            main_project_path = project_paths[0]
            if os.path.isfile(main_project_path): main_project_path = os.path.dirname(main_project_path)
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