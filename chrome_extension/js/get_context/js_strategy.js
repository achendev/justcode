import { getHandle, verifyPermission } from '../file_system_manager.js';
import { scanDirectory } from '../context_builder/file_scanner.js';
import { buildTree, buildTreeWithCounts } from '../context_builder/tree_builder.js';
import { pasteIntoLLM, uploadContextAsFile } from '../context_builder/llm_interface.js';
import { formatContextPrompt, buildFileContentString, getInstructionsBlock } from '../context_builder/prompt_formatter.js';
import { formatExclusionPrompt } from '../exclusion_prompt.js';

async function writeToClipboard(text) {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
        return navigator.clipboard.writeText(text);
    }
    
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (tab) {
        await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: (textToCopy) => navigator.clipboard.writeText(textToCopy),
            args: [text],
        });
    } else {
        throw new Error("No active tab found to write to clipboard.");
    }
}

export async function getContextFromJS(profile, fromShortcut, hostname) {
    const handle = await getHandle(profile.id);
    if (!handle) {
        return { text: 'Error: Please select a project folder first.', type: 'error' };
    }
    if (!(await verifyPermission(handle))) {
        return { text: 'Error: Permission to folder lost. Please select it again.', type: 'error' };
    }

    try {
        const excludePatterns = (profile.excludePatterns || '').split(',').map(p => p.trim()).filter(Boolean);
        const includePatterns = (profile.includePatterns || '').split(',').map(p => p.trim()).filter(Boolean);
        const contextSizeLimit = profile.contextSizeLimit || 3000000;

        const allFileStats = await scanDirectory(handle, { excludePatterns, includePatterns });
        if (allFileStats.length === 0) {
            return { text: `No files found matching patterns.`, type: 'error' };
        }

        const totalChars = allFileStats.reduce((acc, f) => acc + f.chars, 0);

        if (totalChars > contextSizeLimit) {
            await getExclusionSuggestionFromJS(profile, fromShortcut, hostname);
            return { text: `Context size (~${totalChars.toLocaleString()}) exceeds limit (${contextSizeLimit.toLocaleString()}). Suggestion loaded.`, type: 'error' };
        }

        const filePaths = allFileStats.map(s => s.path);
        const treeString = buildTree(filePaths);
        const contentString = await buildFileContentString(handle, filePaths);
        
        if (profile.getContextTarget === 'clipboard') {
            const finalPrompt = formatContextPrompt(treeString, contentString, profile);
            await writeToClipboard(finalPrompt);
            return { text: 'Context copied to clipboard!', type: 'success' };
        } else if (profile.contextAsFile) {
            if (profile.separateInstructionsAsFile) {
                const { instructionsBlock, codeBlockDelimiter } = getInstructionsBlock(profile);
                const fileContextPayload = `${treeString}\n\n${contentString}`;
                const fileContentForUpload = `This is current state of project files:\n${codeBlockDelimiter}bash\n${fileContextPayload}${codeBlockDelimiter}`;
                const promptForPasting = `The project context is in the attached file \`context.txt\`. Please use it to fulfill the task described below.\n\n${instructionsBlock}\n\n\n \n`;

                await uploadContextAsFile(fileContentForUpload, hostname);
                await pasteIntoLLM(promptForPasting, { isInstruction: true }, hostname);
                return { text: 'Context uploaded as file, instructions pasted!', type: 'success' };
            } else {
                const finalPrompt = formatContextPrompt(treeString, contentString, profile);
                await uploadContextAsFile(finalPrompt, hostname);
                return { text: 'Context uploaded as file!', type: 'success' };
            }
        } else {
            const finalPrompt = formatContextPrompt(treeString, contentString, profile);
            await pasteIntoLLM(finalPrompt, {}, hostname);
            return { text: 'Context loaded successfully!', type: 'success' };
        }

    } catch (error) {
        console.error('JustCode Error:', error);
        return { text: `Error: ${error.message}`, type: 'error' };
    }
}

export async function getExclusionSuggestionFromJS(profile, fromShortcut = false, hostname = null) {
    const handle = await getHandle(profile.id);
    if (!handle || !(await verifyPermission(handle))) {
        return { text: 'Error: Folder not selected or permission lost.', type: 'error' };
    }
    
    const excludePatterns = (profile.excludePatterns || '').split(',').map(p => p.trim()).filter(Boolean);
    const includePatterns = (profile.includePatterns || '').split(',').map(p => p.trim()).filter(Boolean);

    const allFileStats = await scanDirectory(handle, { excludePatterns, includePatterns });
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