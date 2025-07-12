import os
import traceback
from flask import request, Response
from .tools import generate_context_from_path, generate_tree_with_char_counts

def get_context():
    path = request.args.get('path')
    exclude_str = request.args.get('exclude', '')
    include_str = request.args.get('include', '')
    context_size_limit = int(request.args.get('limit', 3000000))
    suggest_exclusions = request.args.get('suggest_exclusions', 'false').lower() == 'true'

    if not path or not path.strip():
        return Response("Error: 'path' parameter is missing.", status=400, mimetype='text/plain')

    project_path = os.path.abspath(path.strip())

    if not os.path.isdir(project_path):
        return Response(f"Error: Provided path '{project_path}' is not a valid directory.", status=400, mimetype='text/plain')

    print(f"Set project path to: {project_path}")

    exclude_patterns = [p.strip() for p in exclude_str.split(',') if p.strip()]
    include_patterns = [p.strip() for p in include_str.split(',') if p.strip()]

    def _generate_suggestion_prompt():
        """Generates the exclusion suggestion prompt."""
        three_brackets = '```'
        tree_with_counts, total_size = generate_tree_with_char_counts(project_path, include_patterns, exclude_patterns)
        return f"""PROJECT FILE TREE (with character and line counts):
{three_brackets}bash
{tree_with_counts}
{three_brackets}


### Context and Your Mission ###
You are an expert assistant for a developer using a tool called **JustCode**. This tool allows the developer to send their project's source code to an LLM like you for help with coding tasks.

The developer just tried to send their project, but it's too big! The total size is **{total_size:,} characters**, which is over their configured limit of **{context_size_limit:,} characters**.

**Your mission is to help them fix this.** You must analyze the project's file tree above (which includes character and line counts for each entry) and generate a new, more effective "exclude patterns" list. This list will tell JustCode to ignore irrelevant files and directories, shrinking the project context to a manageable size. The developer will take your output and paste it directly into the JustCode extension to try again.

Focus on excluding directories or file types that are unlikely to be relevant to the code type task, such as:
- **Dependencies & Packages:** `node_modules/`, `venv/`, `packages/`, etc. These are almost never needed.
- **Build & Distributable Files:** `dist/`, `build/`, `target/`, `.next/`. These are generated from the source, so the source is all that matters.
- **Large Data & Media Assets:** Look for large `.csv`, `.json`, `.db`, image, or video files. Pay attention to both character and line counts.
- **Logs, Caches, and Temp Files:** `*.log`, `tmp/`, `.cache/`, etc.
- **IDE & System-Specific Config:** `.vscode/`, `.idea/`, `.DS_Store`.
- **Version Control:** The `.git/` directory is critical to exclude.
- **Tests (maybe):** Consider if test files are necessary for the user's *immediate* coding task. If the project is still too large, `tests/` or `__tests__/` are good candidates for exclusion.
- Documentation that isn't needed for coding
- Any type of credentials
- Any type of logs and sessions files
- Any type of files contains personal information
- Any type of temporary folders

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
5.  **EXCLUDING FORMAT**: Don't use **/folder/ it doesn't work, use *folder/ instead to reliably exclude it

### EXAMPLE OF A PERFECT RESPONSE ###
{three_brackets}bash
*.git/,*node_modules/,*.log,*tmp/,*data/,assets/
{three_brackets}
"""
    try:
        # If suggesting exclusions, we must generate the tree anyway.
        if suggest_exclusions:
            print("Forced exclusion suggestion prompt requested.")
            return Response(_generate_suggestion_prompt(), mimetype='text/plain')

        # Check the total size *before* generating the full content string.
        _, total_size = generate_tree_with_char_counts(project_path, include_patterns, exclude_patterns)
        if total_size > context_size_limit:
            print(f"Context size ({total_size}) exceeds limit ({context_size_limit}). Generating exclusion suggestion prompt.")
            return Response(_generate_suggestion_prompt(), mimetype='text/plain')
        
        # Size is OK, now generate the full file context.
        file_contents = generate_context_from_path(project_path, include_patterns, exclude_patterns)
        
        return Response(file_contents, mimetype='text/plain')
        
    except Exception as e:
        error_message = f"An unexpected error occurred in '{project_path}': {e}\n{traceback.format_exc()}"
        print(error_message)
        return Response(error_message, status=500, mimetype='text/plain')