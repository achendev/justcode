import { updateTemporaryMessage } from '../ui_handlers/message.js';
import { pasteIntoLLM, uploadContextAsFile, uploadInstructionsAsFile } from '../context_builder/llm_interface.js';
import { getInstructionsBlock } from '../context_builder/prompt_formatter.js';
import { formatExclusionPrompt } from '../exclusion_prompt.js';
import { handleServerError } from '../ui_handlers/server_error_handler.js';
import { writeToClipboard } from '../utils/clipboard.js';
import { applyReplacements } from '../utils/two_way_sync.js';
import { splitContextPayload } from './utils.js';
import { maskIPs } from '../utils/ip_masking.js';
import { maskEmails } from '../utils/email_masking.js';
import { maskFQDNs } from '../utils/fqdn_masking.js';
import { agentInstructions } from '../agent_constants.js';

// New helper for agent upload
async function uploadAgentInstructions(hostname, content) {
    // We upload this as agent.txt
    await uploadContextAsFile(content, 'agent.txt', hostname);
}

function generateAgentDelimiter() {
    // Generates EOBASHxxx where xxx is 100-999
    const randomNum = Math.floor(Math.random() * 900) + 100;
    return `EOBASH${randomNum}`;
}

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

        const treeEndIndex = fileContextPayload.indexOf('\n\ncat >');
        const treeString = treeEndIndex !== -1 ? fileContextPayload.substring(0, treeEndIndex) : fileContextPayload;
        const contentString = treeEndIndex !== -1 ? fileContextPayload.substring(treeEndIndex + 2) : fileContextPayload;

        // --- PROCESS FUNCTION ---
        // ORDER MATTERS: Apply Custom Replacements FIRST, then Auto-Masks.
        const process = async (text) => {
            let processed = text;
            if (profile.isTwoWaySyncEnabled && profile.twoWaySyncRules) {
                processed = applyReplacements(processed, profile.twoWaySyncRules, 'outgoing');
            }
            if (profile.autoMaskIPs) {
                processed = await maskIPs(processed);
            }
            if (profile.autoMaskEmails) {
                processed = await maskEmails(processed);
            }
            if (profile.autoMaskFQDNs) {
                processed = await maskFQDNs(processed);
            }
            return processed;
        };
        
        // --- Agent Mode Injection Logic ---
        let finalPromptInstructions = instructionsBlock;
        if (profile.isAgentModeEnabled) {
            const delimiter = generateAgentDelimiter();
            
            // Save the session delimiter specific to this profile
            await chrome.storage.local.set({ [`agent_state_${profile.id}`]: { delimiter } });

            const specificInstructions = agentInstructions.replace(/{{AGENT_DELIMITER}}/g, delimiter);
            
            finalPromptInstructions += `\n\n**AGENT MODE INSTRUCTIONS:**\nSpecial agent instructions are in the attached file \`agent.txt\`.\nYou MUST follow them for tool use.`;
            await uploadAgentInstructions(hostname, specificInstructions);
        }

        if (profile.getContextTarget === 'clipboard') {
            const finalPrompt = `This is current state of project files:\n${codeBlockDelimiter}bash\n${fileContextPayload}${codeBlockDelimiter}\n\n\n${finalPromptInstructions}\n\n\n \n`;
            await writeToClipboard(await process(finalPrompt));
            return { text: 'Context copied to clipboard!', type: 'success' };
        }
        
        if (!profile.contextAsFile) {
             const finalPrompt = `This is current state of project files:\n${codeBlockDelimiter}bash\n${fileContextPayload}${codeBlockDelimiter}\n\n\n${finalPromptInstructions}\n\n\n \n`;
            await pasteIntoLLM(await process(finalPrompt), {}, hostname);
            return { text: 'Context loaded successfully!', type: 'success' };
        }

        const appSettings = await chrome.storage.local.get({ splitContextBySize: false, contextSplitSize: 450 });

        if (appSettings.splitContextBySize) {
            const contentChunks = splitContextPayload(contentString, appSettings.contextSplitSize);
            const uploadedFiles = [];
            
            for (let i = 0; i < contentChunks.length; i++) {
                const chunk = contentChunks[i];
                const filename = `context_${i + 1}.txt`;
                const header = `This is current state of project files:\n${codeBlockDelimiter}bash\n`;
                const footer = `${codeBlockDelimiter}`;

                const fileContent = (i === 0)
                    ? `${header}${treeString}\n\n${chunk}${footer}`
                    : `${header}${chunk}${footer}`;

                await uploadContextAsFile(await process(fileContent), filename, hostname);
                uploadedFiles.push(`\`${filename}\``);
            }

            const fileListStr = uploadedFiles.join(', ');
            let finalMessage, chaperonePrompt;

            switch (profile.separateInstructions) {
                case 'file':
                    chaperonePrompt = `The project context is split across the attached file(s): ${fileListStr}.\nThe critical instructions for how to respond are in the attached file \`instructions.txt\`.\n${profile.isAgentModeEnabled ? 'Agent instructions are in \`agent.txt\`.\n' : ''}You MUST follow these instructions to fulfill the task described below.\n\n\n \n`;
                    await uploadInstructionsAsFile(await process(finalPromptInstructions), hostname);
                    await pasteIntoLLM(await process(chaperonePrompt), { isInstruction: true }, hostname);
                    finalMessage = `Context split into ${uploadedFiles.length} file(s) & instructions uploaded!`;
                    break;
                
                case 'text':
                case 'include': 
                default:
                    chaperonePrompt = `The project context is split across the attached file(s): ${fileListStr}. Please use them to fulfill the task described below.\n\n${finalPromptInstructions}\n\n\n \n`;
                    await pasteIntoLLM(await process(chaperonePrompt), { isInstruction: true }, hostname);
                    finalMessage = `Context split and uploaded as ${uploadedFiles.length} file(s), instructions pasted!`;
                    break;
            }
            return { text: finalMessage, type: 'success' };

        } else {
            const fileContextForUpload = `This is current state of project files:\n${codeBlockDelimiter}bash\n${fileContextPayload}${codeBlockDelimiter}`;
            const finalPrompt = `${fileContextForUpload}\n\n\n${finalPromptInstructions}\n\n\n \n`;

            switch (profile.separateInstructions) {
                case 'include':
                    await uploadContextAsFile(await process(finalPrompt), 'context.txt', hostname);
                    return { text: 'Context uploaded as file!', type: 'success' };
                
                case 'text':
                    const promptForPasting = `The project context is in the attached file \`context.txt\`. Please use it to fulfill the task described below.\n\n${finalPromptInstructions}\n\n\n \n`;
                    await uploadContextAsFile(await process(fileContextForUpload), 'context.txt', hostname);
                    await pasteIntoLLM(await process(promptForPasting), { isInstruction: true }, hostname);
                    return { text: 'Context uploaded as file, instructions pasted!', type: 'success' };
                    
                case 'file':
                    const chaperonePrompt = `The project context is in the attached file \`context.txt\`.\nThe critical instructions for how to respond are in the attached file \`instructions.txt\`.\n${profile.isAgentModeEnabled ? 'Agent instructions are in \`agent.txt\`.\n' : ''}You MUST follow these instructions to fulfill the task described below.\n\n\n \n`;
                    await uploadContextAsFile(await process(fileContextForUpload), 'context.txt', hostname);
                    await uploadInstructionsAsFile(await process(finalPromptInstructions), hostname);
                    await pasteIntoLLM(await process(chaperonePrompt), { isInstruction: true }, hostname);
                    return { text: 'Context & instructions uploaded as files!', type: 'success' };
        
                default:
                    await uploadContextAsFile(await process(finalPrompt), 'context.txt', hostname);
                    return { text: 'Context uploaded as file!', type: 'success' };
            }
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
        
        // Sync first, then Mask
        if (profile.isTwoWaySyncEnabled && profile.twoWaySyncRules) {
            prompt = applyReplacements(prompt, profile.twoWaySyncRules, 'outgoing');
        }
        if (profile.autoMaskIPs) {
            prompt = await maskIPs(prompt);
        }
        if (profile.autoMaskEmails) {
            prompt = await maskEmails(prompt);
        }
        if (profile.autoMaskFQDNs) {
            prompt = await maskFQDNs(prompt);
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