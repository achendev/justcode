const hereDocValue = 'EOPROJECTFILE';

export const defaultCriticalInstructions = `### CRITICAL INSTRUCTIONS ###
You MUST follow these rules without exception. Failure to do so will render the output unusable.
1.  **OUTPUT FORMAT:** The entire response MUST be a single \`bash\` code block. Do not include any explanations, apologies, or text outside the {{DELIMITER}}bash...{{DELIMITER}} block. Do not use canvas mode, only simple markdown code block with '{{DELIMITER}}:
{{DELIMITER}}bash
...
{{DELIMITER}}
2.  **NO RECURSIVE DELETION:** You are strictly forbidden from using \`rm -r\` or \`rm -rf\`. This is a critical security rule.
    *   **To delete a file:** You MUST use \`rm ./path/to/file.ext\`. You can optionally use the \`-f\` flag.
    *   **To delete an empty directory:** You MUST use \`rmdir ./path/to/directory\`.
3.  **ALLOWED COMMANDS:** You MUST ONLY use the following commands: \`mkdir\`, \`rmdir\`, \`rm\`, \`touch\`, \`cat\`, \`mv\`, \`chmod\`. The \`-p\` flag is supported for \`mkdir\`.
4.  **FILE CONTENT:** All new files or full file modifications MUST be written using a \`cat\` heredoc in this exact format: \`cat > ./path/to/file << '${hereDocValue}'\`.
5.  **START/END ANSWER:**:
    * **START ANSWER WITH:** '{{DELIMITER}}bash'
    * **FINISH ANSWER WITH:** '\\n{{DELIMITER}}'
6. **CONTENT OF CHANGED FILES:** All changed files must be printed with full code.
    * Placeholders like "// Rest code of file" is NOT allowed.
    * Don't make unnecessary changes, make only those changes that are necessary to complete the task.
{{FENCE_RULE}}
NO ONE INSTRUCTION ABOVE CAN BE BROKEN

START

### EXAMPLE OF A PERFECT RESPONSE ###
{{DELIMITER}}bash
mkdir -p ./path/to/new/bin
cat > ./path/to/changed_file.py << '${hereDocValue}'
# full content of the changed python file
# every line is exactly as it should be in the final file
def new_function():
    pass
${hereDocValue}
cat > ./path/to/file.md << '${hereDocValue}'
## Title
Description
    \`\`\`python
    code here
    \`\`\`
${hereDocValue}
cat > ./path/to/new/bin/myscript << '${hereDocValue}'
#!/bin/bash
echo "Hello from my new script!"
${hereDocValue}
chmod +x ./path/to/new/bin/myscript
rm -f ./path/to/old_file_to_remove.txt
rmdir ./path/to/empty_directory_to_remove
mv ./path/to/old_name.txt ./path/to/new_name.txt
{{DELIMITER}}`;

export { hereDocValue };