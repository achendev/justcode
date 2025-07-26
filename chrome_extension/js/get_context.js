import { updateAndSaveMessage, updateTemporaryMessage } from './ui_handlers/message.js';
import { getHandle, verifyPermission } from './file_system_manager.js';
import { scanDirectory } from './context_builder/file_scanner.js';
import { buildTree, buildTreeWithCounts } from './context_builder/tree_builder.js';
import { pasteIntoLLM, uploadContextAsFile } from './context_builder/llm_interface.js';
import { formatContextPrompt, formatExclusionPrompt, buildFileContentString, getInstructionsBlock } from './context_builder/prompt_formatter.js';

// --- JS Mode (Local File System) ---
async function getContextJs(profile, fromShortcut) {
    const isDetached = new URLSearchParams(window.location.search).get('view') === 'window';
    
    const handle = await getHandle(profile.id);
    if (!handle) {
        updateAndSaveMessage(profile.id, 'Error: Please select a project folder first.', 'error');
        return;
    }
    if (!(await verifyPermission(handle))) {
        updateAndSaveMessage(profile.id, 'Error: Permission to folder lost. Please select it again.', 'error');
        return;
    }

    try {
        const excludePatterns = (profile.excludePatterns || '').split(',').map(p => p.trim()).filter(Boolean);
        const includePatterns = (profile.includePatterns || '').split(',').map(p => p.trim()).filter(Boolean);
        const contextSizeLimit = profile.contextSizeLimit || 3000000;

        updateTemporaryMessage(profile.id, 'Scanning project...');
        const allFileStats = await scanDirectory(handle, { excludePatterns, includePatterns });
        if (allFileStats.length === 0) {
            updateAndSaveMessage(profile.id, `No files found matching patterns.`, 'error');
            return;
        }

        const totalChars = allFileStats.reduce((acc, f) => acc + f.chars, 0);

        if (totalChars > contextSizeLimit) {
            updateAndSaveMessage(profile.id, `Context size (~${totalChars.toLocaleString()}) exceeds limit (${contextSizeLimit.toLocaleString()}).`, 'error');
            await getExclusionSuggestionJs(profile); // Use JS version of suggestion
            return;
        }

        updateTemporaryMessage(profile.id, 'Building context string...');
        const filePaths = allFileStats.map(s => s.path);
        const treeString = buildTree(filePaths);
        const contentString = await buildFileContentString(handle, filePaths);
        
        if (profile.getContextTarget === 'clipboard' || isDetached) {
            const finalPrompt = formatContextPrompt(treeString, contentString, profile);
            await navigator.clipboard.writeText(finalPrompt);
            updateAndSaveMessage(profile.id, 'Context copied to clipboard!', 'success');
        } else if (profile.contextAsFile) {
            if (profile.separateInstructionsAsFile) {
                const { instructionsBlock, codeBlockDelimiter } = getInstructionsBlock(profile);
                const fileContextPayload = `${treeString}\n\n${contentString}`;
                const fileContentForUpload = `This is current state of project files:\n${codeBlockDelimiter}bash\n${fileContextPayload}${codeBlockDelimiter}`;
                const promptForPasting = `The project context is in the attached file \`context.txt\`. Please use it to fulfill the task described below.\n\n${instructionsBlock}\n\n\n \n`;

                await uploadContextAsFile(fileContentForUpload);
                await pasteIntoLLM(promptForPasting, { isInstruction: true });
                updateAndSaveMessage(profile.id, 'Context uploaded as file, instructions pasted!', 'success');
            } else {
                const finalPrompt = formatContextPrompt(treeString, contentString, profile);
                await uploadContextAsFile(finalPrompt);
                updateAndSaveMessage(profile.id, 'Context uploaded as file!', 'success');
            }
        } else {
            const finalPrompt = formatContextPrompt(treeString, contentString, profile);
            await pasteIntoLLM(finalPrompt);
            updateAndSaveMessage(profile.id, 'Context loaded successfully!', 'success');
        }

        if (fromShortcut) window.close();

    } catch (error) {
        updateAndSaveMessage(profile.id, `Error: ${error.message}`, 'error');
        console.error('JustCode Error:', error);
    }
}

async function getExclusionSuggestionJs(profile) {
    updateTemporaryMessage(profile.id, 'Analyzing project and generating suggestion...');
    
    const handle = await getHandle(profile.id);
    if (!handle || !(await verifyPermission(handle))) {
        updateAndSaveMessage(profile.id, 'Error: Folder not selected or permission lost.', 'error');
        return;
    }
    
    const excludePatterns = (profile.excludePatterns || '').split(',').map(p => p.trim()).filter(Boolean);
    const includePatterns = (profile.includePatterns || '').split(',').map(p => p.trim()).filter(Boolean);

    const allFileStats = await scanDirectory(handle, { excludePatterns, includePatterns });
    const { treeString, totalChars } = buildTreeWithCounts(allFileStats);
    
    const prompt = formatExclusionPrompt(treeString, totalChars, profile);
    
    if (profile.getContextTarget === 'clipboard') {
        await navigator.clipboard.writeText(prompt);
        updateAndSaveMessage(profile.id, 'Exclusion suggestion prompt copied!', 'success');
    } else {
        await pasteIntoLLM(prompt);
        updateAndSaveMessage(profile.id, 'Exclusion suggestion prompt loaded!', 'success');
    }
}


// --- Server Mode ---
async function getContextServer(profile, fromShortcut) {
    const isDetached = new URLSearchParams(window.location.search).get('view') === 'window';
    const path = profile.projectPath;
    const excludePatterns = profile.excludePatterns || '';
    const includePatterns = profile.includePatterns || '';
    const serverUrl = profile.serverUrl.endsWith('/') ? profile.serverUrl.slice(0, -1) : profile.serverUrl;
    const contextSizeLimit = profile.contextSizeLimit || 3000000;
    
    if (!path) {
        updateAndSaveMessage(profile.id, 'Error: Please enter a project path.', 'error');
        return;
    }
    
    let endpoint = `${serverUrl}/getcontext?path=${encodeURIComponent(path)}&exclude=${encodeURIComponent(excludePatterns)}&limit=${contextSizeLimit}`;
    if (includePatterns) {
        endpoint += `&include=${encodeURIComponent(includePatterns)}`;
    }
    
    try {
        const headers = {};
        if (profile.isAuthEnabled && profile.username) {
            headers['Authorization'] = 'Basic ' + btoa(`${profile.username}:${profile.password}`);
        }

        const response = await fetch(endpoint, { method: 'GET', headers: headers });
        const responseText = await response.text();
        if (!response.ok) throw new Error(`Server error: ${response.status} ${responseText}`);
        
        // Server returns suggestion prompt directly if size is too large
        if (responseText.startsWith("PROJECT FILE TREE")) {
            if (profile.getContextTarget === 'clipboard' || isDetached) {
                await navigator.clipboard.writeText(responseText);
                updateAndSaveMessage(profile.id, 'Context too large. Suggestion prompt copied!', 'success');
            } else {
                await pasteIntoLLM(responseText);
                updateAndSaveMessage(profile.id, 'Context too large. Suggestion prompt loaded!', 'success');
            }
            return;
        }

        const fileContextPayload = responseText;
        const { instructionsBlock, codeBlockDelimiter } = getInstructionsBlock(profile);
        
        const fileContextBlock = `This is current state of project files:\n${codeBlockDelimiter}bash\n${fileContextPayload}${codeBlockDelimiter}`;
        
        const finalPrompt = profile.duplicateInstructions
            ? `${instructionsBlock}\n\n${fileContextBlock}\n\n\n${instructionsBlock}\n\n\n \n`
            : `${fileContextBlock}\n\n\n${instructionsBlock}\n\n\n \n`;

        if (profile.getContextTarget === 'clipboard' || isDetached) {
            await navigator.clipboard.writeText(finalPrompt);
            updateAndSaveMessage(profile.id, 'Context copied to clipboard!', 'success');
        } else if (profile.contextAsFile) {
            if (profile.separateInstructionsAsFile) {
                const promptForPasting = `The project context is in the attached file \`context.txt\`. Please use it to fulfill the task described below.\n\n${instructionsBlock}\n\n\n \n`;
                await uploadContextAsFile(fileContextBlock);
                await pasteIntoLLM(promptForPasting, { isInstruction: true });
                updateAndSaveMessage(profile.id, 'Context uploaded as file, instructions pasted!', 'success');
            } else {
                await uploadContextAsFile(finalPrompt);
                updateAndSaveMessage(profile.id, 'Context uploaded as file!', 'success');
            }
        } else {
            await pasteIntoLLM(finalPrompt);
            updateAndSaveMessage(profile.id, 'Context loaded successfully!', 'success');
        }

        if (fromShortcut) window.close();

    } catch (error) {
        updateAndSaveMessage(profile.id, `Error: ${error.message}`, 'error');
        console.error('JustCode Error:', error);
    }
}

async function getExclusionSuggestionServer(profile) {
    const path = profile.projectPath;
    const serverUrl = profile.serverUrl.endsWith('/') ? profile.serverUrl.slice(0, -1) : profile.serverUrl;
    
    if (!path) {
        updateAndSaveMessage(profile.id, 'Error: Please enter a project path.', 'error');
        return;
    }
    
    const excludePatterns = profile.excludePatterns || '';
    const includePatterns = profile.includePatterns || '';
    let endpoint = `${serverUrl}/getcontext?path=${encodeURIComponent(path)}&exclude=${encodeURIComponent(excludePatterns)}&suggest_exclusions=true`;
    if (includePatterns) {
        endpoint += `&include=${encodeURIComponent(includePatterns)}`;
    }
    
    try {
        const headers = {};
        if (profile.isAuthEnabled && profile.username) {
            headers['Authorization'] = 'Basic ' + btoa(`${profile.username}:${profile.password}`);
        }

        const response = await fetch(endpoint, { method: 'GET', headers: headers });
        const responseText = await response.text();
        if (!response.ok) throw new Error(`Server error: ${response.status} ${responseText}`);
        
        if (profile.getContextTarget === 'clipboard') {
            await navigator.clipboard.writeText(responseText);
            updateAndSaveMessage(profile.id, 'Exclusion suggestion prompt copied!', 'success');
        } else {
            await pasteIntoLLM(responseText);
            updateAndSaveMessage(profile.id, 'Exclusion suggestion prompt loaded!', 'success');
        }
    } catch (error) {
        updateAndSaveMessage(profile.id, `Error: ${error.message}`, 'error');
        console.error('JustCode Error:', error);
    }
}


// --- Main Exported Functions ---

export async function getContext(profile, fromShortcut = false) {
    updateTemporaryMessage(profile.id, 'Getting context...');
    if (profile.useServerBackend) {
        await getContextServer(profile, fromShortcut);
    } else {
        await getContextJs(profile, fromShortcut);
    }
}

export async function getExclusionSuggestion(profile) {
    updateTemporaryMessage(profile.id, 'Getting exclusion suggestion...');
    if (profile.useServerBackend) {
        await getExclusionSuggestionServer(profile);
    } else {
        await getExclusionSuggestionJs(profile);
    }
}