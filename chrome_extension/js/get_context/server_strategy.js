import { updateTemporaryMessage } from '../ui_handlers/message.js';
import { pasteIntoLLM, uploadContextAsFile } from '../context_builder/llm_interface.js';
import { getInstructionsBlock } from '../context_builder/prompt_formatter.js';
import { formatExclusionPrompt } from '../exclusion_prompt.js';
import { handleServerError } from '../ui_handlers/server_error_handler.js';

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

export async function getContextFromServer(profile, fromShortcut, hostname) {
    const path = profile.projectPath;
    if (!path) {
        return { text: 'Error: Please enter a project path.', type: 'error' };
    }

    const excludePatterns = profile.excludePatterns || '';
    const includePatterns = profile.includePatterns || '';
    const serverUrl = profile.serverUrl.endsWith('/') ? profile.serverUrl.slice(0, -1) : profile.serverUrl;
    const contextSizeLimit = profile.contextSizeLimit || 3000000;
    
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

        if (response.status === 413) {
            const responseText = await response.text();
            await getExclusionSuggestionFromServer(profile, fromShortcut, hostname);
            return { text: responseText, type: 'error' };
        }

        const responseText = await response.text();
        if (!response.ok) throw new Error(`Server error: ${response.status} ${responseText}`);
        
        const fileContextPayload = responseText;
        const { instructionsBlock, codeBlockDelimiter } = getInstructionsBlock(profile);
        
        const fileContextBlock = `This is current state of project files:\n${codeBlockDelimiter}bash\n${fileContextPayload}${codeBlockDelimiter}`;
        
        const finalPrompt = `${fileContextBlock}\n\n\n${instructionsBlock}\n\n\n \n`;

        if (profile.getContextTarget === 'clipboard') {
            await writeToClipboard(finalPrompt);
            return { text: 'Context copied to clipboard!', type: 'success' };
        } else if (profile.contextAsFile) {
            if (profile.separateInstructionsAsFile) {
                const promptForPasting = `The project context is in the attached file \`context.txt\`. Please use it to fulfill the task described below.\n\n${instructionsBlock}\n\n\n \n`;
                await uploadContextAsFile(fileContextBlock, hostname);
                await pasteIntoLLM(promptForPasting, { isInstruction: true }, hostname);
                return { text: 'Context uploaded as file, instructions pasted!', type: 'success' };
            } else {
                await uploadContextAsFile(finalPrompt, hostname);
                return { text: 'Context uploaded as file!', type: 'success' };
            }
        } else {
            await pasteIntoLLM(finalPrompt, {}, hostname);
            return { text: 'Context loaded successfully!', type: 'success' };
        }

    } catch (error) {
        console.error('JustCode Error:', error);
        const message = handleServerError(error, true);
        return { text: message, type: 'error' };
    }
}

export async function getExclusionSuggestionFromServer(profile, fromShortcut = false, hostname = null) {
    const path = profile.projectPath;
    if (!path) {
        return { text: 'Error: Please enter a project path.', type: 'error' };
    }
    
    const serverUrl = profile.serverUrl.endsWith('/') ? profile.serverUrl.slice(0, -1) : profile.serverUrl;
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
        if (!response.ok) {
            const responseText = await response.text();
            throw new Error(`Server error: ${response.status} ${responseText}`);
        }
        
        const data = await response.json();
        const prompt = formatExclusionPrompt({
            treeString: data.treeString,
            totalChars: data.totalChars,
            profile: profile
        });
        
        if (profile.getContextTarget === 'clipboard') {
            await writeToClipboard(prompt);
            return { text: 'Exclusion suggestion prompt copied!', type: 'success' };
        } else {
            await pasteIntoLLM(prompt, {}, hostname);
            return { text: 'Exclusion suggestion prompt loaded!', type: 'success' };
        }
    } catch (error) {
        console.error('JustCode Error:', error);
        const message = handleServerError(error, true);
        return { text: message, type: 'error' };
    }
}