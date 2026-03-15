/**
 * Formats the prompt for suggesting file exclusions and inclusions.
 * @param {object} data
 * @param {string} data.treeString - The file tree with size counts.
 * @param {number} data.totalChars - The total character count of the project.
 * @param {object} data.profile - The active user profile.
 * @returns {string} The complete prompt for the LLM.
 */
export function formatExclusionPrompt(data) {
    const { treeString, totalChars, profile } = data;
    const contextSizeLimit = profile.contextSizeLimit || 3000000;
    const codeBlockDelimiter = profile.codeBlockDelimiter || '~~~';
    const includePatterns = profile.includePatterns || '';
    const excludePatterns = profile.excludePatterns || '';

    const prompt = `PROJECT FILE TREE (with character and line counts):
${codeBlockDelimiter}bash
${treeString}
${codeBlockDelimiter}

### Context and Your Mission ###
You are an expert assistant for a developer using a tool called **JustCode**. This tool allows the developer to send their project's source code to an LLM like you for help with coding tasks.

The developer just tried to send their project, but it's too big! The total size is **${totalChars.toLocaleString()} characters**, which is over their configured limit of **${contextSizeLimit.toLocaleString()} characters**.

**Your mission is to help them fix this.** You must analyze the project's file tree above (which includes character and line counts for each entry) and generate new, more effective "Exclude Patterns" AND "Include Patterns". This will tell JustCode to ignore irrelevant files and directories, or strictly include only relevant ones, shrinking the project context to a manageable size. The developer will copy your outputs and paste them directly into the JustCode extension.

*   **Exclude Patterns**: Focus on excluding dependencies (\`node_modules/\`, \`venv/\`, \`packages/\`), build directories (\`dist/\`, \`build/\`, \`.next/\`, \`target/\`), large data/media files, logs (\`*.log\`), caches (\`.cache/\`), version control (\`.git/\`), and non-essential docs.
*   **Include Patterns**: If the project is massive but the actual source code is concentrated in specific folders (e.g., \`src/\`, \`lib/\`, \`app/\`) or file types (e.g., \`*.py\`, \`*.ts\`, \`*.js\`, \`*.rs\`, \`*.go\`), it's highly effective to explicitly include them. Combining broad exclusions with strict inclusions is the best strategy for large projects.

CURRENT EXCLUDE PATTERNS:
${excludePatterns ? excludePatterns : '(none)'}

CURRENT INCLUDE PATTERNS:
${includePatterns ? includePatterns : '(none)'}

### CRITICAL INSTRUCTIONS (Output Format) ###
Your output must be easy for the user to copy and paste.

1.  **FINAL OUTPUT MUST BE TWO CODE BLOCKS**: Your entire response must consist of exactly two \`bash\` code blocks and nothing else. No text or explanations before or after.
2.  **BLOCK 1 (EXCLUDE PATTERNS)**: The first code block must contain a single line of text with the complete, combined, comma-separated EXCLUDE list. Start with the current patterns (if any) and add your new suggestions. Do not include the '(none)' placeholder in your output.
3.  **BLOCK 2 (INCLUDE PATTERNS)**: The second code block must contain a single line of text with the complete, combined, comma-separated INCLUDE list. Start with the current patterns (if any) and add your new suggestions. (If no include patterns are needed, output an empty block).
4.  **VALID PATTERNS**:
    *   To target a directory everywhere, use a wildcard, e.g., \`*node_modules/\`.
    *   To target a file type everywhere, use a wildcard, e.g., \`*.log\`.
    *   To target a specific top-level folder, use its name, e.g., \`dist/\`.
    *   To target a specific nested folder, use full relative path, e.g., \`full/relative/path/to/folder/\`.
    *   **DO NOT** use leading slashes (e.g., \`/dist/\`) or unsupported patterns.

### EXAMPLE SCENARIO ###
*   **CURRENT EXCLUDE PATTERNS:** \`.git/,venv/\`
*   **CURRENT INCLUDE PATTERNS:** \`(none)\`
*   **YOUR ANALYSIS:** You see a massive project, but the code is likely only in \`src/\` and \`components/\`.
*   **CORRECT FINAL OUTPUT:**
${codeBlockDelimiter}bash
.git/,venv/,build/,*.tmp,*node_modules/
${codeBlockDelimiter}
${codeBlockDelimiter}bash
src/,components/,*.py,*.js
${codeBlockDelimiter}`;

    return prompt;
}