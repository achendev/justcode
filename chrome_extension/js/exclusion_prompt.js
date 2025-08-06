/**
 * Formats the prompt for suggesting file exclusions.
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

The developer just tried to send their project, but it's too big! The total size of is **${totalChars.toLocaleString()} characters**, which is over their configured limit of **${contextSizeLimit.toLocaleString()} characters**.

**Your mission is to help them fix this.** You must analyze the project's file tree above (which includes character and line counts for each entry) and generate a new, more effective "exclude patterns" list. This list will tell JustCode to ignore irrelevant files and directories, shrinking the project context to a manageable size. The developer will take your output and paste it directly into the JustCode extension to try again.

Focus on excluding directories or file types that are unlikely to be relevant to the code type task, such as:
- **Dependencies & Packages:** \`node_modules/\`, \`venv/\`, \`packages/\`, etc. These are almost never needed.
- **Build & Distributable Files:** \`dist/\`, \`build/\`, \`target/\`, \`.next/\`. These are generated from the source, so the source is all that matters.
- **Large Data & Media Assets:** Look for large \`.csv\`, \`.json\`, \`.db\`, image, or video files. Pay attention to both character and line counts.
- **Logs, Caches, and Temp Files:** \`*.log\`, \`tmp/\`, \`.cache/\`, etc.
- **IDE & System-Specific Config:** \`.vscode/\`, \`.idea/\`, \`.DS_Store\`.
- **Version Control:** The \`.git/\` directory is critical to exclude.
- **Tests (maybe):** Consider if test files are necessary for the user's *immediate* coding task. If the project is still too large, \`tests/\` or \`__tests__/\` are good candidates for exclusion.
- Documentation that isn't needed for coding
- Any type of credentials
- Any type of logs and sessions files
- Any type of files contains personal information
- Any type of temporary folders

The goal is to provide final a comma-separated list of glob patterns appended to the existing exclude list.

CURRENT EXCLUDE PATTERNS:
${excludePatterns}

CURRENT INCLUDE PATTERNS:
${includePatterns || 'All files (no specific include pattern)'}

### CRITICAL INSTRUCTIONS (Machine-Readable Output) ###
Your output will be read by a machine. It must follow these rules perfectly.

1.  **FINAL OUTPUT MUST BE A CODE BLOCK**: Your entire response must be a single \`bash\` code block and nothing else. No text or explanations before or after.
2.  **ONE LINE ONLY**: The code block must contain only one single line of text.
3.  **COMBINE AND APPEND**: Start with the "CURRENT EXCLUDE PATTERNS" list and add your new suggestions to it. Your final output must be the complete, combined, comma-separated list.
4.  **VALID PATTERNS**:
    *   To exclude a directory everywhere, use a wildcard, e.g., \`*node_modules/\`.
    *   To exclude a file type everywhere, use a wildcard, e.g., \`*.log\`.
    *   To exclude a specific top-level folder, use its name, e.g., \`dist/\`.
    *   To exclude a specific no top folder, use full relative path, e.g., \`full/relative/path/to/folder/\`.
    *   **DO NOT** use leading slashes (e.g., \`/dist/\`) or unsupported patterns.

### EXAMPLE SCENARIO ###
*   **CURRENT PATTERNS:** \`.git/,venv/\`
*   **YOUR ANALYSIS:** You see a large \`build/\` directory and many \`.tmp\` files.
*   **CORRECT FINAL OUTPUT:**
${codeBlockDelimiter}bash
.git/,venv/,build/,*.tmp
${codeBlockDelimiter}`;

    return prompt;
}