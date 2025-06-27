import os
import traceback
from flask import request, Response
from .tools import generate_context_from_path, generate_tree_with_char_counts, here_doc_value

three_brackets = '```'

def get_context():
    path = request.args.get('path')
    exclude_str = request.args.get('exclude', '')
    include_str = request.args.get('include', '')
    context_size_limit = int(request.args.get('limit', 3000000))

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
        if len(file_contents) > context_size_limit:
            print(f"Context size ({len(file_contents)}) exceeds limit ({context_size_limit}). Generating exclusion suggestion prompt.")
            tree_with_counts, total_size = generate_tree_with_char_counts(project_path, include_patterns, exclude_patterns)
            
            large_context_prompt = f"""This is an auto-generated prompt from the 'JustCode' development tool.

### The Goal ###
The user is trying to send their project's code to you for assistance using JustCode, a tool that bridges a local IDE with an LLM. However, the project is too large ({total_size:,} characters) to fit into a single prompt, exceeding their configured limit of {context_size_limit:,} characters.

Your task is to act as an expert developer and help the user shrink the project context by suggesting files and directories to exclude. The user will copy your response directly into their JustCode profile's "Exclude Patterns" field.

### Project File Tree ###
Here is the file tree of the user's project, with character counts for each file and directory. Analyze it carefully.
{three_brackets}bash
{tree_with_counts}
{three_brackets}

### What to Exclude ###
Focus on excluding items that are not essential for understanding the core logic of the project. Common candidates for exclusion include:
- **Dependencies:** `node_modules/`, `venv/`, `packages/`
- **Build Artifacts:** `dist/`, `build/`, `target/`, `.next/`
- **Large Data/Assets:** `*.csv`, `*.json`, `assets/`, `data/`
- **Logs & Caches:** `*.log`, `tmp/`, `.cache/`
- **Configuration:** `.vscode/`, `.idea/`
- **Tests (if not relevant to the task):** `tests/`, `__tests__/`
- **Git & Environment:** `.git/`, `.env`

### User's Current Settings ###
The user is already excluding the following patterns. You should build upon this list, not just replace it.
- **Current Exclude Patterns:** `{exclude_str}`
- **Current Include Patterns:** `{include_str if include_str else 'All files (no specific include pattern)'}`

### CRITICAL INSTRUCTIONS ###
You MUST follow these rules without exception.
1.  **OUTPUT FORMAT:** Your entire response MUST be a single `bash` code block. It should contain a single line of text: a comma-separated list of glob patterns.
2.  **FINAL LIST:** Provide the complete, final list of patterns. Start with the user's "Current Exclude Patterns" and append your new suggestions.
3.  **NO EXTRA TEXT:** Do NOT include any explanations, apologies, greetings, or any text outside of the `bash` code block.

### EXAMPLE OF A PERFECT RESPONSE ###
{three_brackets}bash
.git/,venv/,.env,log/,logs/,tmp/,node_modules/,build/,dist/,data/,*.csv,*.log
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