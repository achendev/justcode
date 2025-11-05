import { updateTemporaryMessage } from '../ui_handlers/message.js';
import { pasteIntoLLM, uploadContextAsFile, uploadInstructionsAsFile } from '../context_builder/llm_interface.js';
import { getInstructionsBlock } from '../context_builder/prompt_formatter.js';
import { formatExclusionPrompt } from '../exclusion_prompt.js';
import { handleServerError } from '../ui_handlers/server_error_handler.js';
import { writeToClipboard } from '../utils/clipboard.js';
import { applyReplacements } from '../utils/two_way_sync.js';

/**
 * Splits the content string into chunks based on size, respecting 'cat' blocks and splitting trailing content by line.
 * @param {string} contentString The string containing all 'cat' commands and other context.
 * @param {number} splitSizeKb The target size for each chunk in kilobytes.
 * @returns {string[]} An array of content chunks.
 */
function splitContextPayload(contentString, splitSizeKb) {
    const splitSizeBytes = splitSizeKb * 1024;
    const overhead = 20 * 1024; // Increased overhead for safety with tree, headers, etc.
    const effectiveSplitSize = splitSizeBytes - overhead > 0 ? splitSizeBytes - overhead : 1024;

    const allChunks = [];
    let currentChunk = '';

    const fileBlocks = contentString.match(/cat > .*? << 'EOPROJECTFILE'[\s\S]*?EOPROJECTFILE\n\n/g) || [];
    let trailingContent = '';
    if (fileBlocks.length > 0) {
        const lastBlock = fileBlocks[fileBlocks.length - 1];
        const lastBlockIndex = contentString.lastIndexOf(lastBlock);
        trailingContent = contentString.substring(lastBlockIndex + lastBlock.length);
    } else {
        trailingContent = contentString;
    }

    for (const block of fileBlocks) {
        if (currentChunk && new Blob([currentChunk + block]).size > effectiveSplitSize) {
            allChunks.push(currentChunk);
            currentChunk = block;
        } else {
            currentChunk += block;
        }
    }

    if (trailingContent) {
        const trailingLines = trailingContent.split('\n');
        for (const line of trailingLines) {
            const lineWithNewline = line + '\n';
            if (currentChunk && new Blob([currentChunk + lineWithNewline]).size > effectiveSplitSize) {
                allChunks.push(currentChunk);
                currentChunk = lineWithNewline;
            } else {
                currentChunk += lineWithNewline;
            }
        }
    }

    if (currentChunk) {
        allChunks.push(currentChunk);
    }
    
    if (allChunks.length === 0 && contentString) {
        allChunks.push(contentString);
    }

    return allChunks;
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

        const process = (text) => {
            if (profile.isTwoWaySyncEnabled && profile.twoWaySyncRules) {
                return applyReplacements(text, profile.twoWaySyncRules, 'outgoing');
            }
            return text;
        };

        if (profile.getContextTarget === 'clipboard') {
            const finalPrompt = `This is current state of project files:\n${codeBlockDelimiter}bash\n${fileContextPayload}${codeBlockDelimiter}\n\n\n${instructionsBlock}\n\n\n \n`;
            await writeToClipboard(process(finalPrompt));
            return { text: 'Context copied to clipboard!', type: 'success' };
        }
        
        if (!profile.contextAsFile) {
             const finalPrompt = `This is current state of project files:\n${codeBlockDelimiter}bash\n${fileContextPayload}${codeBlockDelimiter}\n\n\n${instructionsBlock}\n\n\n \n`;
            await pasteIntoLLM(process(finalPrompt), {}, hostname);
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

                await uploadContextAsFile(process(fileContent), filename, hostname);
                uploadedFiles.push(`\`${filename}\``);
            }

            const fileListStr = uploadedFiles.join(', ');
            let finalMessage, chaperonePrompt;

            switch (profile.separateInstructions) {
                case 'file':
                    chaperonePrompt = `The project context is split across the attached file(s): ${fileListStr}.\nThe critical instructions for how to respond are in the attached file \`instructions.txt\`.\nYou MUST follow these instructions to fulfill the task described below.\n\n\n \n`;
                    await uploadInstructionsAsFile(process(instructionsBlock), hostname);
                    await pasteIntoLLM(process(chaperonePrompt), { isInstruction: true }, hostname);
                    finalMessage = `Context split into ${uploadedFiles.length} file(s) & instructions uploaded!`;
                    break;
                
                case 'text':
                case 'include': // Fallback: Treat 'include' like 'text' when splitting, as a chaperone prompt is necessary.
                default:
                    chaperonePrompt = `The project context is split across the attached file(s): ${fileListStr}. Please use them to fulfill the task described below.\n\n${instructionsBlock}\n\n\n \n`;
                    await pasteIntoLLM(process(chaperonePrompt), { isInstruction: true }, hostname);
                    finalMessage = `Context split and uploaded as ${uploadedFiles.length} file(s), instructions pasted!`;
                    break;
            }
            return { text: finalMessage, type: 'success' };

        } else {
            const fileContextForUpload = `This is current state of project files:\n${codeBlockDelimiter}bash\n${fileContextPayload}${codeBlockDelimiter}`;
            const finalPrompt = `${fileContextForUpload}\n\n\n${instructionsBlock}\n\n\n \n`;

            switch (profile.separateInstructions) {
                case 'include':
                    await uploadContextAsFile(process(finalPrompt), 'context.txt', hostname);
                    return { text: 'Context uploaded as file!', type: 'success' };
                
                case 'text':
                    const promptForPasting = `The project context is in the attached file \`context.txt\`. Please use it to fulfill the task described below.\n\n${instructionsBlock}\n\n\n \n`;
                    await uploadContextAsFile(process(fileContextForUpload), 'context.txt', hostname);
                    await pasteIntoLLM(process(promptForPasting), { isInstruction: true }, hostname);
                    return { text: 'Context uploaded as file, instructions pasted!', type: 'success' };
                    
                case 'file':
                    const chaperonePrompt = `The project context is in the attached file \`context.txt\`.\nThe critical instructions for how to respond are in the attached file \`instructions.txt\`.\nYou MUST follow these instructions to fulfill the task described below.\n\n\n \n`;
                    await uploadContextAsFile(process(fileContextForUpload), 'context.txt', hostname);
                    await uploadInstructionsAsFile(process(instructionsBlock), hostname);
                    await pasteIntoLLM(process(chaperonePrompt), { isInstruction: true }, hostname);
                    return { text: 'Context & instructions uploaded as files!', type: 'success' };
        
                default: // Fallback to 'include'
                    await uploadContextAsFile(process(finalPrompt), 'context.txt', hostname);
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