import { updateTemporaryMessage } from '../ui_handlers/message.js';
import { pasteIntoLLM, uploadContextAsFile, uploadInstructionsAsFile } from '../context_builder/llm_interface.js';
import { getInstructionsBlock } from '../context_builder/prompt_formatter.js';
import { formatExclusionPrompt } from '../exclusion_prompt.js';
import { handleServerError } from '../ui_handlers/server_error_handler.js';
import { writeToClipboard } from '../utils/clipboard.js';
import { applyReplacements } from '../utils/two_way_sync.js';

function splitContextPayload(treeString, contentString, splitSizeKb, delimiter) {
    const splitSizeBytes = splitSizeKb * 1024;
    const header = `This is current state of project files:\n${delimiter}bash\n`;
    const footer = `${delimiter}`;

    const fullPayloadForCheck = header + treeString + '\n\n' + contentString + footer;

    // If the entire payload is within the limit, no splitting is needed.
    if (new Blob([fullPayloadForCheck]).size <= splitSizeBytes) {
        return [{ filename: 'context.txt', content: fullPayloadForCheck }];
    }

    // This regex is crucial. It ensures that we only split between complete 'cat' command blocks.
    // Each element in fileBlocks is a full, valid 'cat' command from 'cat > ...' to the closing 'EOPROJECTFILE\n\n'.
    const fileBlocks = contentString.match(/cat > .*? << 'EOPROJECTFILE'[\s\S]*?EOPROJECTFILE\n\n/g) || [];

    const chunks = [];
    let fileCounter = 1;
    let currentContentForChunk = '';

    // Iterate over each complete file block, ensuring no script is ever cut in half.
    for (const block of fileBlocks) {
        // Check if the current chunk has content AND if adding the *next full block* would exceed the size limit.
        if (currentContentForChunk && new Blob([header + treeString + '\n\n' + currentContentForChunk + block + footer]).size > splitSizeBytes) {
            // If it exceeds, finalize the current chunk. It contains one or more complete blocks.
            chunks.push({
                filename: `context_${fileCounter++}.txt`,
                content: header + treeString + '\n\n' + currentContentForChunk + footer
            });
            // Start a new chunk with the current block.
            currentContentForChunk = block;
        } else {
            // Otherwise, append the current complete block to the chunk being built.
            currentContentForChunk += block;
        }
    }

    // Add the last chunk, which might contain one or more blocks.
    if (currentContentForChunk) {
        chunks.push({
            filename: `context_${fileCounter++}.txt`,
            content: header + treeString + '\n\n' + currentContentForChunk + footer
        });
    }

    return chunks;
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
        const contentString = treeEndIndex !== -1 ? fileContextPayload.substring(treeEndIndex + 2) : '';

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
            const chunks = splitContextPayload(treeString, contentString, appSettings.contextSplitSize, codeBlockDelimiter);
            for (const chunk of chunks) {
                await uploadContextAsFile(process(chunk.content), chunk.filename, hostname);
            }
            const fileNamesStr = chunks.map(f => `\`${f.filename}\``).join(', ');
            const chaperonePrompt = `The project context is in the attached file(s) ${fileNamesStr}. Please use it to fulfill the task described below.\n\n${instructionsBlock}\n\n\n \n`;
            await pasteIntoLLM(process(chaperonePrompt), { isInstruction: true }, hostname);
            return { text: `Context split and uploaded as ${chunks.length} file(s), instructions pasted!`, type: 'success' };
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