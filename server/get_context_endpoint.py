import os
import traceback
from flask import request, Response
from .tools import generate_context_from_path, generate_tree_with_char_counts, here_doc_value

three_brackets = '```'
CONTEXT_SIZE_LIMIT = 3000000

def get_context():
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
        print(len(file_contents)) 
        # Check if the generated context is too large
        if len(file_contents) > CONTEXT_SIZE_LIMIT:
            print(f"Context size ({len(file_contents)}) exceeds limit ({CONTEXT_SIZE_LIMIT}). Generating exclusion suggestion prompt.")
            tree_with_counts, total_size = generate_tree_with_char_counts(project_path, include_patterns, exclude_patterns)
            
            large_context_prompt = f"""PROJECT FILE TREE (with character counts):
{three_brackets}bash
{tree_with_counts}
{three_brackets}


### Context and Your Mission ###
You are an expert assistant for a developer using a tool called **JustCode**. This tool allows the developer to send their project's source code to an LLM like you for help with coding tasks.

The developer just tried to send their project, but it's too big! The total size is **{total_size:,} characters**, which is over their configured limit of **{context_size_limit:,} characters**.

**Your mission is to help them fix this.** You must analyze the project's file tree above and generate a new, more effective "exclude patterns" list. This list will tell JustCode to ignore irrelevant files and directories, shrinking the project context to a manageable size. The developer will take your output and paste it directly into the JustCode extension to try again.

Focus on excluding directories or file types that are unlikely to be relevant to the code type task, such as:
- **Dependencies & Packages:** `node_modules/`, `venv/`, `packages/`, etc. These are almost never needed.
- **Build & Distributable Files:** `dist/`, `build/`, `target/`, `.next/`. These are generated from the source, so the source is all that matters.
- **Large Data & Media Assets:** Look for large `.csv`, `.json`, `.db`, image, or video files.
- **Logs, Caches, and Temp Files:** `*.log`, `tmp/`, `.cache/`, etc.
- **IDE & System-Specific Config:** `.vscode/`, `.idea/`, `.DS_Store`.
- **Version Control:** The `.git/` directory is critical to exclude.
- **Tests (maybe):** Consider if test files are necessary for the user's *immediate* coding task. If the project is still too large, `tests/` or `__tests__/` are good candidates for exclusion.
- Documentation that isn't needed for coding
- Any type of credentials
- Any type of logs and sessions files
- Any type of files contains personal information

The goal is to provide final a comma-separated list of glob patterns appended to the existing exclude list.

CURRENT EXCLUDE PATTERNS:
{exclude_str}

CURRENT INCLUDE PATTERNS:
{include_str if include_str else 'All files (no specific include pattern)'}

### CRITICAL INSTRUCTIONS ###
You MUST follow these rules without exception.
1.  **OUTPUT FORMAT:** Your entire response MUST be a single line of text. It should be a comma-separated list of glob patterns to add to the exclusion list.
2.  **DO NOT** include any explanations, apologies, or text outside of this list.
3.  **FINAL LIST**: Provide final list, take CURRENT EXCLUDE PATTERNS as a base and append new patterns to it.
4.  **CODE BLOCK**: Answer must be in code block.

### EXAMPLE OF A PERFECT RESPONSE ###
{three_brackets}bash
.gin/,node_modules/,*.log,tmp/,data/,*/data/,assets/
{three_brackets}
"""
            return Response(large_context_prompt, mimetype='text/plain')

        # The prompt will always use Unix-style paths for simplicity and consistency for the LLM.
        # The server-side deploy logic will handle the conversion to the correct OS path separator.
        prompt_template = f"""This is current state of project files:
{three_brackets}bash
{file_contents}
{three_brackets}


### CRITICAL INSTRUCTIONS ###
You MUST follow these rules without exception. Failure to do so will render the output unusable.
1.  **OUTPUT FORMAT:** The entire response MUST be a single `bash` code block. Do not include any explanations, apologies, or text outside the ````bash...```` block. Do not use canvas mode, just simple markdown code block.
2.  **NO RECURSIVE DELETION:** You are strictly forbidden from using `rm -r` or `rm -rf`. This is a critical security rule.
    *   **To delete a file:** You MUST use `rm ./path/to/file.ext`. You can optionally use the `-f` flag.
    *   **To delete an empty directory:** You MUST use `rmdir ./path/to/directory`.
3.  **ALLOWED COMMANDS:** You MUST ONLY use the following commands: `mkdir`, `rmdir`, `rm`, `touch`, `cat`, `mv`.
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
mv ./path/to/old_name.txt ./path/to/new_name.txt
{three_brackets}




 
"""
        return Response(prompt_template, mimetype='text/plain')
        
    except Exception as e:
        error_message = f"An unexpected error occurred in '{project_path}': {e}\n{traceback.format_exc()}"
        print(error_message)
        return Response(error_message, status=500, mimetype='text/plain')