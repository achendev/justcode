import { getHandles, verifyPermission } from '../file_system_manager.js';
import { scanDirectory } from '../context_builder/file_scanner.js';
import { buildTree, buildTreeWithCounts } from '../context_builder/tree_builder.js';
import { pasteIntoLLM, uploadContextAsFile, uploadInstructionsAsFile } from '../context_builder/llm_interface.js';
import { formatContextPrompt, buildFileContentString, getInstructionsBlock } from '../context_builder/prompt_formatter.js';
import { formatExclusionPrompt } from '../exclusion_prompt.js';
import { writeToClipboard } from '../utils/clipboard.js';

async function getVerifiedHandles(profile) {
    const folderCount = (profile.jsProjectFolderNames || []).length || 1;
    const allHandles = await getHandles(profile.id, folderCount);
    const verifiedHandles = [];
    for (const handle of allHandles) {
        if (handle && await verifyPermission(handle)) {
            verifiedHandles.push(handle);
        }
    }
    return verifiedHandles;
}

export async function getContextFromJS(profile, fromShortcut, hostname) {
    const handles = await getVerifiedHandles(profile);
    if (handles.length === 0) {
        return { text: 'Error: Please select a project folder with granted permissions.', type: 'error' };
    }

    try {
        const isMultiProject = handles.length > 1;
        const excludePatterns = (profile.excludePatterns || '').split(',').map(p => p.trim()).filter(Boolean);
        const includePatterns = (profile.includePatterns || '').split(',').map(p => p.trim()).filter(Boolean);
        const contextSizeLimit = profile.contextSizeLimit || 3000000;

        const scanResults = await Promise.all(handles.map(h => scanDirectory(h, { excludePatterns, includePatterns })));
        
        const allFileStats = scanResults.flatMap((stats, index) => 
            stats.map(s => ({
                ...s,
                path: isMultiProject ? `${index}/${s.path}` : s.path
            }))
        );

        const totalChars = allFileStats.reduce((acc, f) => acc + f.chars, 0);

        if (totalChars > contextSizeLimit) {
            await getExclusionSuggestionFromJS(profile, fromShortcut, hostname);
            return { text: `Context size (~${totalChars.toLocaleString()}) exceeds limit (${contextSizeLimit.toLocaleString()}). Suggestion loaded.`, type: 'error' };
        }

        const filePaths = allFileStats.map(s => s.path);
        const treeString = buildTree(filePaths);
        const contentString = await buildFileContentString(handles, filePaths);
        
        const finalPrompt = formatContextPrompt(treeString, contentString, profile);
        const { instructionsBlock, codeBlockDelimiter } = getInstructionsBlock(profile);
        const fileContextPayload = `${treeString}\n\n${contentString}`;
        const fileContextForUpload = `This is current state of project files:\n${codeBlockDelimiter}bash\n${fileContextPayload}${codeBlockDelimiter}`;
    
        if (profile.getContextTarget === 'clipboard') {
            await writeToClipboard(finalPrompt);
            return { text: 'Context copied to clipboard!', type: 'success' };
        }
    
        if (!profile.contextAsFile) {
            await pasteIntoLLM(finalPrompt, {}, hostname);
            return { text: 'Context loaded successfully!', type: 'success' };
        }
    
        switch (profile.separateInstructions) {
            case 'include':
                await uploadContextAsFile(finalPrompt, hostname);
                return { text: 'Context uploaded as file!', type: 'success' };
            
            case 'text':
                const promptForPasting = `The project context is in the attached file \`context.txt\`. Please use it to fulfill the task described below.\n\n${instructionsBlock}\n\n\n \n`;
                await uploadContextAsFile(fileContextForUpload, hostname);
                await pasteIntoLLM(promptForPasting, { isInstruction: true }, hostname);
                return { text: 'Context uploaded as file, instructions pasted!', type: 'success' };
    
            case 'file':
                const chaperonePrompt = `The project context is in the attached file \`context.txt\`.\nThe critical instructions for how to respond are in the attached file \`instructions.txt\`.\nYou MUST follow these instructions to fulfill the task described below.\n\n\n \n`;
                await uploadContextAsFile(fileContextForUpload, hostname);
                await uploadInstructionsAsFile(instructionsBlock, hostname);
                await pasteIntoLLM(chaperonePrompt, { isInstruction: true }, hostname);
                return { text: 'Context & instructions uploaded as files!', type: 'success' };
    
            default: // Fallback to 'include'
                await uploadContextAsFile(finalPrompt, hostname);
                return { text: 'Context uploaded as file!', type: 'success' };
        }

    } catch (error) {
        console.error('JustCode Error:', error);
        return { text: `Error: ${error.message}`, type: 'error' };
    }
}

export async function getExclusionSuggestionFromJS(profile, fromShortcut = false, hostname = null) {
    const handles = await getVerifiedHandles(profile);
    if (handles.length === 0) {
        return { text: 'Error: Folder not selected or permission lost.', type: 'error' };
    }
    
    const isMultiProject = handles.length > 1;
    const excludePatterns = (profile.excludePatterns || '').split(',').map(p => p.trim()).filter(Boolean);
    const includePatterns = (profile.includePatterns || '').split(',').map(p => p.trim()).filter(Boolean);

    const scanResults = await Promise.all(handles.map(h => scanDirectory(h, { excludePatterns, includePatterns })));
    const allFileStats = scanResults.flatMap((stats, index) => 
        stats.map(s => ({
            ...s,
            path: isMultiProject ? `${index}/${s.path}` : s.path
        }))
    );

    const { treeString, totalChars } = buildTreeWithCounts(allFileStats);
    
    const prompt = formatExclusionPrompt({ treeString, totalChars, profile });
    
    if (profile.getContextTarget === 'clipboard') {
        await writeToClipboard(prompt);
        return { text: 'Exclusion suggestion prompt copied!', type: 'success' };
    } else {
        await pasteIntoLLM(prompt, {}, hostname);
        return { text: 'Exclusion suggestion prompt loaded!', type: 'success' };
    }
}