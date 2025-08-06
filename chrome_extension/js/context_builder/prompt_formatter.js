import { defaultCriticalInstructions, hereDocValue } from '../default_instructions.js';

/**
 * Builds the content string with cat commands from a list of file paths.
 * @param {FileSystemDirectoryHandle} rootHandle
 * @param {string[]} paths
 * @returns {Promise<string>}
 */
export async function buildFileContentString(rootHandle, paths) {
    let contentString = '';
    for (const path of paths) {
        try {
            const pathParts = path.split('/');
            const fileName = pathParts.pop();
            let currentDir = rootHandle;
            for (const part of pathParts) {
                currentDir = await currentDir.getDirectoryHandle(part);
            }
            const fileHandle = await currentDir.getFileHandle(fileName);
            const file = await fileHandle.getFile();
            const content = await file.text();

            if (content.includes('\u0000')) continue;

            contentString += `cat > ./${path} << '${hereDocValue}'\n${content}\n${hereDocValue}\n\n`;
        } catch (e) {
            console.warn(`Could not read file for content string: ${path}`, e);
        }
    }
    return contentString;
}

/**
 * Gets the formatted instructions block and other profile-based settings.
 * @param {object} profile
 * @returns {{instructionsBlock: string, codeBlockDelimiter: string}}
 */
export function getInstructionsBlock(profile) {
    const codeBlockDelimiter = profile.codeBlockDelimiter || '~~~';
    
    const baseInstructions = profile.isCriticalInstructionsEnabled 
        ? profile.criticalInstructions 
        : defaultCriticalInstructions;
    
    let fenceRule = (codeBlockDelimiter === '```') 
        ? `5.  **NO NESTED CODE FENCES:** Inside a file's content, no line can begin with '${codeBlockDelimiter}'. Use indentation instead.`
        : '';

    const instructionsBlock = baseInstructions
        .replace(/\{\{DELIMITER\}\}/g, codeBlockDelimiter)
        .replace(/\{\{FENCE_RULE\}\}/g, fenceRule);
    
    return { instructionsBlock, codeBlockDelimiter };
}

/**
 * Formats the final prompt for the getContext action.
 * @param {string} treeString - The file tree structure.
 * @param {string} contentString - The string of file contents.
 * @param {object} profile - The active user profile.
 * @returns {string} The complete prompt to be sent to the LLM.
 */
export function formatContextPrompt(treeString, contentString, profile) {
    const fileContext = `${treeString}\n\n${contentString}`;
    const { instructionsBlock, codeBlockDelimiter } = getInstructionsBlock(profile);
    
    const fileContextBlock = `This is current state of project files:\n${codeBlockDelimiter}bash\n${fileContext}${codeBlockDelimiter}`;
    
    const finalPrompt = `${fileContextBlock}\n\n\n${instructionsBlock}\n\n\n \n`;

    return finalPrompt;
}

/**
 * Formats the prompt for suggesting file exclusions.
 * @param {string} treeString - The file tree with size counts.
 * @param {number} totalChars - The total character count of the project.
 * @param {object} profile - The active user profile.
 * @returns {string} The complete prompt for the LLM.
 */
export function formatExclusionPrompt(treeString, totalChars, profile) {
    const contextSizeLimit = profile.contextSizeLimit || 3000000;
    const codeBlockDelimiter = profile.codeBlockDelimiter || '~~~';

    const prompt = `PROJECT FILE TREE (with character and line counts):
${codeBlockDelimiter}bash
${treeString}
${codeBlockDelimiter}

### Context and Your Mission ###
You are an expert assistant for a developer using JustCode. The project context is still too large, even after applying some exclusions. The total size of the remaining files is **${totalChars.toLocaleString()} characters**, which is over their limit of **${contextSizeLimit.toLocaleString()} characters**.

**Your mission is to suggest additional patterns to exclude.** Analyze the file tree above, which shows the largest remaining files and folders, and suggest new patterns to shrink the project size further.

Focus on excluding:
- Large directories or files that are not essential for the current coding task.
- Build artifacts, dependencies, logs, or data files that were missed by the initial patterns.

CURRENT EXCLUDE PATTERNS:
${profile.excludePatterns || 'none'}

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