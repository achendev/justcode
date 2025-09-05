import { updateTemporaryMessage } from '../ui_handlers/message.js';
import { pasteIntoLLM, uploadContextAsFile, uploadInstructionsAsFile } from '../context_builder/llm_interface.js';
import { getInstructionsBlock } from '../context_builder/prompt_formatter.js';
import { formatExclusionPrompt } from '../exclusion_prompt.js';
import { handleServerError } from '../ui_handlers/server_error_handler.js';
import { writeToClipboard } from '../utils/clipboard.js';
import { applyReplacements } from '../utils/two_way_sync.js';

export async function getContextFromServer(profile, fromShortcut, hostname) {
    const paths = profile.projectPaths;
    if (!paths || paths.length === 0 || !paths.some(p => p && p.trim())) {
        return { text: 'Error: Please enter at least one project path.', type: 'error' };
    }

    const excludePatterns = profile.excludePatterns || '';
    const includePatterns = profile.includePatterns || '';
    const serverUrl = profile.serverUrl.endsWith('/') ? profile.serverUrl.slice(0, -1) : profile.serverUrl;
    const contextSizeLimit = profile.contextSizeLimit || 3000000;
    
    const pathParams = paths.map(p => `path=${encodeURIComponent(p)}`).join('&');
    let endpoint = `${serverUrl}/getcontext?${pathParams}&exclude=${encodeURIComponent(excludePatterns)}&limit=${contextSizeLimit}`;
    
    if (includePatterns) {
        endpoint += `&include=${encodeURIComponent(includePatterns)}`;
    }
    if (profile.gatherAdditionalContext && profile.additionalContextScript) {
        endpoint += `&gather_context=true&context_script=${encodeURIComponent(profile.additionalContextScript)}`;
    }
    if (profile.useNumericPrefixesForMultiProject) {
        endpoint += `&useNumericPrefixes=true`;
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

        const process = (text) => {
            if (profile.isTwoWaySyncEnabled && profile.twoWaySyncRules) {
                return applyReplacements(text, profile.twoWaySyncRules, 'outgoing');
            }
            return text;
        };

        if (profile.getContextTarget === 'clipboard') {
            await writeToClipboard(process(finalPrompt));
            return { text: 'Context copied to clipboard!', type: 'success' };
        }
        
        if (!profile.contextAsFile) {
            await pasteIntoLLM(process(finalPrompt), {}, hostname);
            return { text: 'Context loaded successfully!', type: 'success' };
        }
    
        switch (profile.separateInstructions) {
            case 'include':
                await uploadContextAsFile(process(finalPrompt), hostname);
                return { text: 'Context uploaded as file!', type: 'success' };
            
            case 'text':
                const promptForPasting = `The project context is in the attached file \`context.txt\`. Please use it to fulfill the task described below.\n\n${instructionsBlock}\n\n\n \n`;
                await uploadContextAsFile(process(fileContextBlock), hostname);
                await pasteIntoLLM(process(promptForPasting), { isInstruction: true }, hostname);
                return { text: 'Context uploaded as file, instructions pasted!', type: 'success' };
                
            case 'file':
                const chaperonePrompt = `The project context is in the attached file \`context.txt\`.\nThe critical instructions for how to respond are in the attached file \`instructions.txt\`.\nYou MUST follow these instructions to fulfill the task described below.\n\n\n \n`;
                await uploadContextAsFile(process(fileContextBlock), hostname);
                await uploadInstructionsAsFile(process(instructionsBlock), hostname);
                await pasteIntoLLM(process(chaperonePrompt), { isInstruction: true }, hostname);
                return { text: 'Context & instructions uploaded as files!', type: 'success' };
    
            default: // Fallback to 'include'
                await uploadContextAsFile(process(finalPrompt), hostname);
                return { text: 'Context uploaded as file!', type: 'success' };
        }

    } catch (error) {
        console.error('JustCode Error:', error);
        const message = handleServerError(error, true);
        return { text: message, type: 'error' };
    }
}

export async function getExclusionSuggestionFromServer(profile, fromShortcut = false, hostname = null) {
    const paths = profile.projectPaths;
    if (!paths || paths.length === 0 || !paths.some(p => p && p.trim())) {
        return { text: 'Error: Please enter at least one project path.', type: 'error' };
    }
    
    const serverUrl = profile.serverUrl.endsWith('/') ? profile.serverUrl.slice(0, -1) : profile.serverUrl;
    const excludePatterns = profile.excludePatterns || '';
    const includePatterns = profile.includePatterns || '';
    
    const pathParams = paths.map(p => `path=${encodeURIComponent(p)}`).join('&');
    let endpoint = `${serverUrl}/getcontext?${pathParams}&exclude=${encodeURIComponent(excludePatterns)}&suggest_exclusions=true`;
    if (includePatterns) {
        endpoint += `&include=${encodeURIComponent(includePatterns)}`;
    }
    if (profile.useNumericPrefixesForMultiProject) {
        endpoint += `&useNumericPrefixes=true`;
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
        let prompt = formatExclusionPrompt({
            treeString: data.treeString,
            totalChars: data.totalChars,
            profile: profile
        });
        
        if (profile.isTwoWaySyncEnabled && profile.twoWaySyncRules) {
            prompt = applyReplacements(prompt, profile.twoWaySyncRules, 'outgoing');
        }

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