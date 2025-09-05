import { defaultCriticalInstructions, hereDocValue } from '../default_instructions.js';

/**
 * Builds the content string with cat commands from a list of file paths.
 * @param {Array<FileSystemDirectoryHandle>} handles
 * @param {string[]} paths
 * @returns {Promise<string>}
 */
export async function buildFileContentString(handles, paths) {
    let contentString = '';
    const isMultiProject = handles.length > 1;

    for (const path of paths) {
        try {
            let handle = handles[0];
            let relativePath = path;

            if (isMultiProject) {
                const match = path.match(/^(\d+)\/(.*)$/s);
                if (!match) continue;
                const index = parseInt(match[1], 10);
                if (index >= handles.length) continue;
                handle = handles[index];
                relativePath = match[2];
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