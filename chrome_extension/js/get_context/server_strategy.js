import { updateAndSaveMessage, updateTemporaryMessage } from '../ui_handlers/message.js';
import { pasteIntoLLM, uploadContextAsFile } from '../context_builder/llm_interface.js';
import { getInstructionsBlock } from '../context_builder/prompt_formatter.js';
import { formatExclusionPrompt } from '../exclusion_prompt.js';

export async function getContextFromServer(profile, fromShortcut) {
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

        if (response.status === 413) {
            const responseText = await response.text();
            updateAndSaveMessage(profile.id, responseText, 'error');
            await getExclusionSuggestionFromServer(profile);
            return;
        }

        const responseText = await response.text();
        if (!response.ok) throw new Error(`Server error: ${response.status} ${responseText}`);
        
        const fileContextPayload = responseText;
        const { instructionsBlock, codeBlockDelimiter } = getInstructionsBlock(profile);
        
        const fileContextBlock = `This is current state of project files:\n${codeBlockDelimiter}bash\n${fileContextPayload}${codeBlockDelimiter}`;
        
        const finalPrompt = `${fileContextBlock}\n\n\n${instructionsBlock}\n\n\n \n`;

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

export async function getExclusionSuggestionFromServer(profile) {
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
            await navigator.clipboard.writeText(prompt);
            updateAndSaveMessage(profile.id, 'Exclusion suggestion prompt copied!', 'success');
        } else {
            await pasteIntoLLM(prompt);
            updateAndSaveMessage(profile.id, 'Exclusion suggestion prompt loaded!', 'success');
        }
    } catch (error) {
        updateAndSaveMessage(profile.id, `Error: ${error.message}`, 'error');
        console.error('JustCode Error:', error);
    }
}