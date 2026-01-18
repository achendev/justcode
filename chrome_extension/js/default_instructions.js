export const defaultCriticalInstructions = `### CRITICAL INSTRUCTIONS ###
You MUST follow these rules without exception. Failure to do so will render the output unusable.
1.  **OUTPUT FORMAT:** The entire response MUST be a single \`bash\` code block. Whole answer should be in {{DELIMITER}}bash...{{DELIMITER}} block. Do not use canvas mode, only simple markdown code block with tildas:
{{DELIMITER}}bash
...
{{DELIMITER}}
2.  **NO RECURSIVE DELETION:** You are strictly forbidden from using \`rm -r\` or \`rm -rf\`. This is a critical security rule.
    *   **To delete a file:** You MUST use \`rm ./path/to/file.ext\`. You can optionally use the \`-f\` flag.
    *   **To delete an empty directory:** You MUST use \`rmdir ./path/to/directory\`.
3.  **ALLOWED COMMANDS:** You MUST ONLY use the following commands: \`mkdir\`, \`rmdir\`, \`rm\`, \`touch\`, \`cat\`, \`mv\`. The \`-p\` flag is supported for \`mkdir\`.
4.  **FILE CONTENT:** All new files or full file modifications MUST be written using a \`cat\` heredoc in this exact format:
cat > ./path/to/file << '{{FILE_DELIMITER}}'
<Full code of the file>
{{FILE_DELIMITER}}
5.  **NO NESTED CODE FENCES:** Inside a file's content, no line can begin with '{{DELIMITER}}'. Use indentation instead.



### EXAMPLE OF A PERFECT RESPONSE ###
Changes explanation here
{{DELIMITER}}bash
mkdir -p ./path/to/new/bin
cat > ./path/to/changed_file.py << '{{FILE_DELIMITER}}'
# full content of the changed python file
# every line is exactly as it should be in the final file
def new_function():
    pass
{{FILE_DELIMITER}}
cat > ./path/to/new/bin/myscript << '{{FILE_DELIMITER}}'
#!/bin/bash
echo "Hello from my new script!"
{{FILE_DELIMITER}}
rm ./path/to/old_file_to_remove.txt
rmdir ./path/to/empty_directory_to_remove
mv ./path/to/old_name.txt ./path/to/new_name.txt
{{DELIMITER}}`;