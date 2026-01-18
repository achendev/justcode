import { defaultCriticalInstructions } from '../default_instructions.js';

/**
 * Builds the content string with cat commands from a list of file paths.
 * @param {Array<FileSystemDirectoryHandle>} handles
 * @param {string[]} paths
 * @param {object} profile
 * @param {string} delimiter - The dynamic heredoc delimiter (e.g., EOFILE123)
 * @returns {Promise<string>}
 */
export async function buildFileContentString(handles, paths, profile, delimiter) {
    let contentString = '';
    const isMultiProject = handles.length > 1;

    for (const path of paths) {
        try {
            let handle = handles[0];
            let relativePath = path;

            if (isMultiProject) {
                const separatorIndex = path.indexOf('/');
                if (separatorIndex === -1) continue;
                
                const prefix = path.substring(0, separatorIndex);
                const actualPath = path.substring(separatorIndex + 1);

                if (profile.useNumericPrefixesForMultiProject) {
                    const index = parseInt(prefix, 10);
                    if (isNaN(index) || index >= handles.length) continue;
                    handle = handles[index];
                } else {
                    handle = handles.find(h => h.name === prefix);
                    if (!handle) continue;
                }
                relativePath = actualPath;
            }

            const pathParts = relativePath.split('/');
            const fileName = pathParts.pop();
            let currentDir = handle;
            for (const part of pathParts) {
                currentDir = await currentDir.getDirectoryHandle(part);
            }
            const fileHandle = await currentDir.getFileHandle(fileName);
            const file = await fileHandle.getFile();
            const content = await file.text();

            if (content.includes('\u0000')) continue;

            contentString += `cat > ./${path} << '${delimiter}'\n${content}\n${delimiter}\n\n`;
        } catch (e) {
            console.warn(`Could not read file for content string: ${path}`, e);
        }
    }
    return contentString;
}

/**
 * Gets the formatted instructions block and other profile-based settings.
 * @param {object} profile
 * @param {string} delimiter - The dynamic heredoc delimiter (e.g., EOFILE123)
 * @returns {{instructionsBlock: string, codeBlockDelimiter: string}}
 */
export function getInstructionsBlock(profile, delimiter) {
    const codeBlockDelimiter = profile.codeBlockDelimiter || '```';
    
    const baseInstructions = profile.isCriticalInstructionsEnabled 
        ? profile.criticalInstructions 
        : defaultCriticalInstructions;
    
    let fenceRule = (codeBlockDelimiter === '```') 
        ? `5.  **NO NESTED CODE FENCES:** Inside a file's content, no line can begin with '${codeBlockDelimiter}'. Use indentation instead.`
        : '';

    // If using custom instructions that might not have the new placeholder yet, 
    // fall back to replacing the old hardcoded string if present, 
    // otherwise just rely on the placeholder.
    let instructionsBlock = baseInstructions
        .replace(/\{\{DELIMITER\}\}/g, codeBlockDelimiter)
        .replace(/\{\{FILE_DELIMITER\}\}/g, delimiter);

    // Legacy support for custom instructions that might still have 'EOPROJECTFILE' hardcoded
    if (instructionsBlock.includes('EOPROJECTFILE')) {
        instructionsBlock = instructionsBlock.replace(/EOPROJECTFILE/g, delimiter);
    }
    
    // Ensure fence rule is correct if placeholder wasn't used for it
    if (baseInstructions.includes('{{FENCE_RULE}}')) {
        instructionsBlock = instructionsBlock.replace(/\{\{FENCE_RULE\}\}/g, fenceRule);
    }

    return { instructionsBlock, codeBlockDelimiter };
}

/**
 * Formats the final prompt for the getContext action.
 * @param {string} treeString - The file tree structure.
 * @param {string} contentString - The string of file contents.
 * @param {object} profile - The active user profile.
 * @param {string} delimiter - The dynamic heredoc delimiter.
 * @returns {string} The complete prompt to be sent to the LLM.
 */
export function formatContextPrompt(treeString, contentString, profile, delimiter) {
    const fileContext = `${treeString}\n\n${contentString}`;
    const { instructionsBlock, codeBlockDelimiter } = getInstructionsBlock(profile, delimiter);
    
    const fileContextBlock = `This is current state of project files:\n${codeBlockDelimiter}bash\n${fileContext}${codeBlockDelimiter}`;
    
    const finalPrompt = `${fileContextBlock}\n\n\n${instructionsBlock}\n\n\n \n`;

    return finalPrompt;
}