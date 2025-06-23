import os
import subprocess
import re
import fnmatch
import shlex
from flask import Flask, request, Response
from flask_cors import CORS

app = Flask(__name__)
CORS(app)
here_doc_value = 'EOPROJECTFILE'
three_brackets = '```'

def generate_context_from_path(project_path, include_patterns, exclude_patterns):
    """
    Generates a project context string including a file tree and file contents,
    all implemented in pure Python to avoid shell command dependencies.
    """
    
    # 1. Walk the filesystem to get all files, respecting exclusions.
    matching_files = []
    for dirpath, dirnames, filenames in os.walk(project_path, topdown=True):
        # Exclude directories by modifying dirnames in place
        excluded_dirs = []
        for d in dirnames:
            dir_rel_path = os.path.relpath(os.path.join(dirpath, d), project_path)
            # Normalize path for matching, and match against patterns
            dir_rel_path_norm = dir_rel_path.replace('\\', '/')
            if any(fnmatch.fnmatch(dir_rel_path_norm, pat) or fnmatch.fnmatch(dir_rel_path_norm + '/', pat) for pat in exclude_patterns):
                excluded_dirs.append(d)
        
        for d in excluded_dirs:
            dirnames.remove(d)

        for filename in filenames:
            file_full_path = os.path.join(dirpath, filename)
            file_rel_path = os.path.relpath(file_full_path, project_path)
            # Normalize path for matching
            file_rel_path_norm = file_rel_path.replace('\\', '/')
            
            # Check exclusion patterns against relative path
            if any(fnmatch.fnmatch(file_rel_path_norm, pat) for pat in exclude_patterns):
                continue
            
            # Check inclusion patterns against filename (basename)
            if include_patterns:
                if not any(fnmatch.fnmatch(filename, pat) for pat in include_patterns):
                    continue
            
            # Skip empty files and non-text files
            try:
                if os.path.getsize(file_full_path) == 0:
                    continue
                # Simple check to avoid including binary files by trying to read it as text
                with open(file_full_path, 'r', encoding='utf-8') as f:
                    f.read(1024) # Try reading a small chunk
            except (OSError, UnicodeDecodeError):
                continue # Skip binary files or files we can't read

            matching_files.append(file_rel_path_norm)

    matching_files.sort()

    # 2. Generate the tree structure from the list of files.
    tree_dict = {}
    for f in matching_files:
        parts = f.split('/')
        d = tree_dict
        for part in parts[:-1]:
            d = d.setdefault(part, {})
        d[parts[-1]] = None  # Using None to signify a file

    tree_lines = ["."]
    def build_tree_str(d, prefix=""):
        items = sorted(d.keys())
        pointers = ['├── '] * (len(items) - 1) + ['└── ']
        for i, name in enumerate(items):
            pointer = pointers[i]
            tree_lines.append(f"{prefix}{pointer}{name}")
            if d[name] is not None:  # It's a directory, so recurse
                extension = '│   ' if pointer == '├── ' else '    '
                build_tree_str(d[name], prefix + extension)

    build_tree_str(tree_dict)
    tree_str = "\n".join(tree_lines)
    
    # 3. Read file contents and format the final output string.
    output_parts = [tree_str, "\n\n"]
    for rel_path in matching_files:
        full_path = os.path.join(project_path, rel_path.replace('/', os.sep))
        try:
            with open(full_path, 'r', encoding='utf-8', errors='ignore') as f:
                content = f.read()
            
            output_parts.append(f"cat > ./{rel_path} << '{here_doc_value}'\n")
            output_parts.append(content)
            output_parts.append(f"\n{here_doc_value}\n\n\n\n\n")

        except Exception as e:
            print(f"Warning: Could not read file '{full_path}': {e}")
            continue
            
    return "".join(output_parts)

@app.route('/getcode', methods=['GET'])
def get_code():
    path = request.args.get('path')
    exclude_str = request.args.get('exclude', '')
    include_str = request.args.get('include', '')

    if not path or not path.strip():
        return Response("Error: 'path' parameter is missing.", status=400, mimetype='text/plain')
    
    project_path = os.path.abspath(path.strip())

    if not os.path.isdir(project_path):
        return Response(f"Error: Provided path '{project_path}' is not a valid directory.", status=400, mimetype='text/plain')
    
    print(f"Set project path to: {project_path}")
    
    exclude_patterns = [p.strip() for p in exclude_str.split(',') if p.strip()]
    include_patterns = [p.strip() for p in include_str.split(',') if p.strip()]
    try:
        file_contents = generate_context_from_path(project_path, include_patterns, exclude_patterns)
        
        prompt_template = f"""This is current state of project files:
{three_brackets}bash
{file_contents}
{three_brackets}


### CRITICAL INSTRUCTIONS ###
You MUST follow these rules without exception. Failure to do so will render the output unusable.
1.  **OUTPUT FORMAT:** The entire response MUST be a single `bash` code block. Do not include any explanations, apologies, or text outside the ````bash...```` block. Do not use canvas mode, just simple markdown code block.
2.  **NO RECURSIVE DELETION:** You are strictly forbidden from using `rm -r` or `rm -rf`. This is a critical security rule.
    *   **To delete a file:** You MUST use `rm -f ./path/to/file.ext`.
    *   **To delete an empty directory:** You MUST use `rmdir ./path/to/directory`.
3.  **ALLOWED COMMANDS:** You MUST ONLY use the following commands: `mkdir`, `rmdir`, `rm -f`, `touch`, and `cat`.
4.  **FILE CONTENT:** All new files or full file modifications MUST be written using a `cat` heredoc in this exact format: `cat > ./path/to/file << '{here_doc_value}'`.
5.  **NO NESTED CODE FENCES:** Inside a file's content (between `{here_doc_value}` delimiters), no line can begin with ` ``` ` as it will break the script.

### EXAMPLE OF A PERFECT RESPONSE ###
{three_brackets}bash
mkdir ./path/to/new_directory
cat > ./path/to/changed_file.py << '{here_doc_value}'
# full content of the changed python file
# every line is exactly as it should be in the final file
def new_function():
    pass
{here_doc_value}
cat > ./path/to/new_file.txt << '{here_doc_value}'
This is a new file.
{here_doc_value}
rm -f ./path/to/old_file_to_remove.txt
rmdir ./path/to/empty_directory_to_remove
{three_brackets}
"""
        return Response(prompt_template, mimetype='text/plain')
        
    except Exception as e:
        import traceback
        error_message = f"An unexpected error occurred in '{project_path}': {e}\n{traceback.format_exc()}"
        print(error_message)
        return Response(error_message, status=500, mimetype='text/plain')

def is_safe_path(base_dir, target_path):
    """
    Checks if a target path is safely within a base directory to prevent path traversal.
    """
    base_dir_abs = os.path.abspath(base_dir)
    target_path_abs = os.path.abspath(os.path.join(base_dir, target_path))
    return target_path_abs.startswith(base_dir_abs)

@app.route('/deploycode', methods=['POST'])
def deploy_code():
    path = request.args.get('path')
    if not path or not path.strip():
        return Response("Error: 'path' parameter is missing.", status=400, mimetype='text/plain')
    
    project_path = os.path.abspath(path.strip())
    if not os.path.isdir(project_path):
        return Response(f"Error: Provided path '{project_path}' is not a valid directory.", status=400, mimetype='text/plain')
    
    script_content = request.get_data(as_text=True)
    if not script_content:
        return Response("Error: No deploy script provided in the request body.", status=400, mimetype='text/plain')
    
    lines = script_content.splitlines()
    i = 0
    output_log = []

    while i < len(lines):
        line = lines[i].strip()
        i += 1
        if not line:
            continue

        try:
            # Handle cat heredoc
            if line.startswith('cat >'):
                match = re.match(r"cat >\s+(?P<path>.*?)\s+<<\s+'" + re.escape(here_doc_value) + r"'", line)
                if not match:
                    raise ValueError(f"Invalid or unsupported 'cat' command format: {line}")
                
                relative_path = match.group('path').strip("'\"")
                if not is_safe_path(project_path, relative_path):
                    raise PermissionError(f"Path traversal attempt detected: {relative_path}")

                full_path = os.path.join(project_path, relative_path)
                
                content_lines = []
                while i < len(lines):
                    content_line = lines[i]
                    if content_line == here_doc_value:
                        i += 1
                        break
                    content_lines.append(content_line)
                    i += 1
                else: # Loop finished without break, means EOF was reached before delimiter
                    raise ValueError(f"Unterminated heredoc for file '{relative_path}' (missing {here_doc_value})")
                
                file_content = "\n".join(content_lines)
                
                os.makedirs(os.path.dirname(full_path), exist_ok=True)
                with open(full_path, 'w', encoding='utf-8') as f:
                    f.write(file_content)
                output_log.append(f"Wrote file: {relative_path}")
                continue

            # Handle other commands
            parts = shlex.split(line)
            if not parts:
                continue
            
            command = parts[0]
            args = parts[1:]

            if command == 'mkdir':
                if not args: raise ValueError("'mkdir' requires at least one argument.")
                for arg in args:
                    relative_path = arg
                    if not is_safe_path(project_path, relative_path):
                        raise PermissionError(f"Path traversal attempt detected: {relative_path}")
                    full_path = os.path.join(project_path, relative_path)
                    os.makedirs(full_path, exist_ok=True)
                    output_log.append(f"Created directory: {relative_path}")

            elif command == 'touch':
                if not args: raise ValueError("'touch' requires at least one argument.")
                for arg in args:
                    relative_path = arg
                    if not is_safe_path(project_path, relative_path):
                        raise PermissionError(f"Path traversal attempt detected: {relative_path}")
                    full_path = os.path.join(project_path, relative_path)
                    dir_name = os.path.dirname(full_path)
                    if dir_name:
                        os.makedirs(dir_name, exist_ok=True)
                    with open(full_path, 'a'):
                        os.utime(full_path, None)
                    output_log.append(f"Touched file: {relative_path}")

            elif command == 'rm':
                if not args or args[0] != '-f':
                    raise ValueError("Only 'rm -f' is supported for file deletion.")
                
                paths_to_remove = args[1:]
                if not paths_to_remove: raise ValueError("'rm -f' requires a file path.")
                for relative_path in paths_to_remove:
                    if not is_safe_path(project_path, relative_path):
                        raise PermissionError(f"Path traversal attempt detected: {relative_path}")
                    full_path = os.path.join(project_path, relative_path)
                    try:
                        if os.path.isdir(full_path):
                             raise IsADirectoryError(f"Cannot remove directory with 'rm -f': {relative_path}. Use 'rmdir'.")
                        os.remove(full_path)
                        output_log.append(f"Removed file: {relative_path}")
                    except FileNotFoundError:
                        output_log.append(f"File not found, skipped removal: {relative_path}")

            elif command == 'rmdir':
                if not args: raise ValueError("'rmdir' requires at least one argument.")
                for arg in args:
                    relative_path = arg
                    if not is_safe_path(project_path, relative_path):
                        raise PermissionError(f"Path traversal attempt detected: {relative_path}")
                    full_path = os.path.join(project_path, relative_path)
                    try:
                        os.rmdir(full_path)
                        output_log.append(f"Removed directory: {relative_path}")
                    except OSError as e:
                        raise OSError(f"Could not remove directory '{relative_path}': {e}")
            
            else:
                raise ValueError(f"Unsupported command: '{command}'. Allowed commands are: mkdir, rmdir, rm -f, touch, cat.")

        except (ValueError, PermissionError, OSError, IsADirectoryError) as e:
            import traceback
            error_details = f"Error during deployment on line {i}: '{line}'\n{str(e)}\n{traceback.format_exc()}"
            print(error_details)
            return Response(error_details, status=500, mimetype='text/plain')

    success_message = f"Successfully deployed code.\n--- LOG ---\n" + "\n".join(output_log)
    return Response(success_message, mimetype='text/plain')

if __name__ == '__main__':
    print("Starting JustCode server on http://127.0.0.1:5010")
    print("CORS is enabled for all origins.")
    print("WARNING: This server can read and write files on your system. Use with caution.")
    app.run(host='127.0.0.1', port=5010, debug=True)