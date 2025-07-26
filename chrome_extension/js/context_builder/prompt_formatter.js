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
        ? `7.  **NO NESTED CODE FENCES:** Inside a file's content, no line can begin with three backticks. Use indentation.`
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
    
    const finalPrompt = profile.duplicateInstructions
        ? `${instructionsBlock}\n\n${fileContextBlock}\n\n\n${instructionsBlock}\n\n\n \n`
        : `${fileContextBlock}\n\n\n${instructionsBlock}\n\n\n \n`;

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

### CRITICAL INSTRUCTIONS ###
1.  **OUTPUT FORMAT:** Your entire response MUST be a single line of comma-separated glob patterns.
2.  **DO NOT** include any explanations or text outside the list.
3.  **APPEND**: Append new patterns to the existing list. Your response should contain the full, updated list.
4.  **CODE BLOCK**: Your answer must be in a \`bash\` code block.

### EXAMPLE RESPONSE ###
${codeBlockDelimiter}bash
.git/,venv/,node_modules/,dist/,build/,*.log,*.tmp,large_data_folder/
${codeBlockDelimiter}`;

    return prompt;
}