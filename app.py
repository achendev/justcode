import os
import subprocess
import re
from flask import Flask, request, Response
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

def bash(cmd):
    return subprocess.Popen(cmd, shell=True, stdout=subprocess.PIPE, executable='/bin/bash').communicate()[0].decode('utf8').strip()

@app.route('/getcode', methods=['GET'])
def get_code():
    path = request.args.get('path')
    if not path:
        return Response("Error: 'path' parameter is missing.", status=400, mimetype='text/plain')
    if not os.path.isdir(path):
        return Response(f"Error: Provided path '{path}' is not a valid directory.", status=400, mimetype='text/plain')
    project_path = os.path.abspath(path)
    print(f"Set project path to: {project_path}")
    # Command to find all relevant project files
    command = r"""
files=$(find . -type f \
  -not -path '*/\.git/*' \
  -not -path '*/venv/*' \
  -not -path '*/tmp/*' \
  -not -path '*/log/*' \
  -not -path '*.env' \
  -not -path '*secrets*' \
  -not -path '*/data/*' \
  -not -path '*access/users*' \
  -not -path '*access/groups*' \
  -not -path '*/creds/*' \
  -exec grep -Il . {} + | sort -u)

for file in $files; do
  [ -r "$file" ] || continue
  echo "cat > $file << 'EOPROJECTFILE'"
  tail -n 100000 "$file"
  echo -e "EOPROJECTFILE\n\n\n\n\n"
done
    """
    
    try:
        file_contents = bash(command)
        doc_page_value = 'EOCHANGEDFILE'
        prompt_template = f"""This is current state of project files:
{'```'}bash
{file_contents}
{'```'}
### CRITICAL INSTRUCTIONS ###
You MUST follow these rules without exception. Failure to do so will render the output unusable.
1.  **NO RECURSIVE DELETION:** You are strictly forbidden from using `rm -r` or `rm -rf`. This is a critical security rule.
    *   **To delete a file:** You MUST use `rm -f ./path/to/file.ext`.
    *   **To delete an empty directory:** You MUST use `rmdir ./path/to/directory`.
2.  **OUTPUT FORMAT:** The entire response MUST be a single `bash` code block. Do not include any explanations, apologies, or text outside the ````bash...```` block. Do not use canvas mode, just simple markdown code block.
3.  **ALLOWED COMMANDS:** You MUST ONLY use the following commands: `mkdir`, `rmdir`, `rm -f`, `touch`, `sed`, and `cat`.
4.  **FILE CONTENT:** All new files or full file modifications MUST be written using a `cat` heredoc in this exact format: `cat > ./path/to/file << 'EOCHANGEDFILE'`.
5.  **NO NESTED CODE FENCES:** Inside a file's content (between `EOCHANGEDFILE` delimiters), no line can begin with ` ``` ` as it will break the script.
### EXAMPLE OF A PERFECT RESPONSE ###
{'```'}bash
mkdir ./path/to/new_directory
cat > ./path/to/changed_file.py << '{doc_page_value}'
# full content of the changed python file
# every line is exactly as it should be in the final file
def new_function():
    pass
{doc_page_value}
sed -i 's#old_text#new_text#g' ./path/to/another_file.txt
cat > ./path/to/new_file.txt << '{doc_page_value}'
This is a new file.
{doc_page_value}
rm -f ./path/to/old_file_to_remove.txt
rmdir ./path/to/empty_directory_to_remove
{'```'}
"""
        print(prompt_template)
        return Response(prompt_template, mimetype='text/plain')
        
    except subprocess.CalledProcessError as e:
        error_message = f"Error executing shell command in '{project_path}':\nSTDERR:\n{e.stderr.decode('utf-8', errors='ignore')}"
        print(error_message)
        return Response(error_message, status=500, mimetype='text/plain')
    except Exception as e:
        print(f"An unexpected error occurred: {e}")
        return Response(str(e), status=500, mimetype='text/plain')

@app.route('/deploycode', methods=['POST'])
def deploy_code():
    path = request.args.get('path')
    if not path:
        return Response("Error: 'path' parameter is missing.", status=400, mimetype='text/plain')
    if not os.path.isdir(path):
        return Response(f"Error: Provided path '{path}' is not a valid directory.", status=400, mimetype='text/plain')
    project_path = os.path.abspath(path)
    script_content = request.get_data(as_text=True)
    if not script_content:
        return Response("Error: No deploy script provided in the request body.", status=400, mimetype='text/plain')
    
    try:
        result = subprocess.run(
            script_content,
            shell=True,
            capture_output=True,
            text=True,
            cwd=project_path,
            executable='/bin/bash'
        )
        if result.returncode != 0:
            return Response(f"Error during deployment:\n{result.stderr}", status=500, mimetype='text/plain')
        
        return Response("Successfully deployed code.", mimetype='text/plain')
    except Exception as e:
        return Response(f"An unexpected error occurred during execution: {str(e)}", status=500, mimetype='text/plain')

if __name__ == '__main__':
    print("Starting JustCode server on http://127.0.0.1:5010")
    print("CORS is enabled for all origins.")
    print("WARNING: This server can read and write files on your system. Use with caution.")
    app.run(host='127.0.0.1', port=5010)
