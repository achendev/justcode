import { getHandles, verifyPermission } from '../file_system_manager.js';
import { scanDirectory } from '../context_builder/file_scanner.js';
import { buildTree, buildTreeWithCounts } from '../context_builder/tree_builder.js';
import { pasteIntoLLM, uploadContextAsFile, uploadInstructionsAsFile } from '../context_builder/llm_interface.js';
import { formatContextPrompt, buildFileContentString, getInstructionsBlock } from '../context_builder/prompt_formatter.js';
import { formatExclusionPrompt } from '../exclusion_prompt.js';
import { writeToClipboard } from '../utils/clipboard.js';
import { applyReplacements } from '../utils/two_way_sync.js';

function splitContextPayload(treeString, contentString, splitSizeKb, delimiter) {
    const splitSizeBytes = splitSizeKb * 1024;
    const header = `This is current state of project files:\n${delimiter}bash\n`;
    const footer = `${delimiter}`;

    const fullPayloadForCheck = header + treeString + '\n\n' + contentString + footer;

    if (new Blob([fullPayloadForCheck]).size <= splitSizeBytes) {
        return [{ filename: 'context.txt', content: fullPayloadForCheck }];
    }

    const fileBlocks = contentString.match(/cat > .*? << 'EOPROJECTFILE'[\s\S]*?EOPROJECTFILE\n\n/g) || [];

    const chunks = [];
    let fileCounter = 1;
    let currentContentForChunk = '';

    for (const block of fileBlocks) {
        if (currentContentForChunk && new Blob([header + treeString + '\n\n' + currentContentForChunk + block + footer]).size > splitSizeBytes) {
            chunks.push({
                filename: `context_${fileCounter++}.txt`,
                content: header + treeString + '\n\n' + currentContentForChunk + footer
            });
            currentContentForChunk = block;
        } else {
            currentContentForChunk += block;
        }
    }

    if (currentContentForChunk) {
        chunks.push({
            filename: `context_${fileCounter++}.txt`,
            content: header + treeString + '\n\n' + currentContentForChunk + footer
        });
    }

    return chunks;
}


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

    const isMultiProject = handles.length > 1;
    if (isMultiProject && !profile.useNumericPrefixesForMultiProject) {
        const handleNames = handles.map(h => h.name);
        if (new Set(handleNames).size !== handleNames.length) {
            return { text: 'Error: Multiple project folders have the same name. Please enable "Name by order number" in profile settings to resolve ambiguity.', type: 'error' };
        }
    }

    try {
        const excludePatterns = (profile.excludePatterns || '').split(',').map(p => p.trim()).filter(Boolean);
        const includePatterns = (profile.includePatterns || '').split(',').map(p => p.trim()).filter(Boolean);
        const contextSizeLimit = profile.contextSizeLimit || 3000000;

        const scanResults = await Promise.all(handles.map(h => scanDirectory(h, { excludePatterns, includePatterns })));
        
        const allFileStats = scanResults.flatMap((stats, index) => {
            if (!isMultiProject) return stats;
            const prefix = profile.useNumericPrefixesForMultiProject ? index : handles[index].name;
            return stats.map(s => ({
                ...s,
                path: `${prefix}/${s.path}`
            }));
        });

        const totalChars = allFileStats.reduce((acc, f) => acc + f.chars, 0);

        if (totalChars > contextSizeLimit) {
            await getExclusionSuggestionFromJS(profile, fromShortcut, hostname);
            return { text: `Context size (~${totalChars.toLocaleString()}) exceeds limit (${contextSizeLimit.toLocaleString()}). Suggestion loaded.`, type: 'error' };
        }

        const filePaths = allFileStats.map(s => s.path);
        const treeString = buildTree(filePaths);
        const contentString = await buildFileContentString(handles, filePaths, profile);
        
        const { instructionsBlock, codeBlockDelimiter } = getInstructionsBlock(profile);
        
        const process = (text) => {
            if (profile.isTwoWaySyncEnabled && profile.twoWaySyncRules) {
                return applyReplacements(text, profile.twoWaySyncRules, 'outgoing');
            }
            return text;
        };
        
        if (profile.getContextTarget === 'clipboard') {
            const finalPrompt = formatContextPrompt(treeString, contentString, profile);
            await writeToClipboard(process(finalPrompt));
            return { text: 'Context copied to clipboard!', type: 'success' };
        }
        
        if (!profile.contextAsFile) {
            const finalPrompt = formatContextPrompt(treeString, contentString, profile);
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
            const fileContextPayload = `${treeString}\n\n${contentString}`;
            const fileContextForUpload = `This is current state of project files:\n${codeBlockDelimiter}bash\n${fileContextPayload}${codeBlockDelimiter}`;
            const finalPrompt = formatContextPrompt(treeString, contentString, profile);
            
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
        return { text: `Error: ${error.message}`, type: 'error' };
    }
}

export async function getExclusionSuggestionFromJS(profile, fromShortcut = false, hostname = null) {
    const handles = await getVerifiedHandles(profile);
    if (handles.length === 0) {
        return { text: 'Error: Folder not selected or permission lost.', type: 'error' };
    }
    
    const isMultiProject = handles.length > 1;
    if (isMultiProject && !profile.useNumericPrefixesForMultiProject) {
        const handleNames = handles.map(h => h.name);
        if (new Set(handleNames).size !== handleNames.length) {
            return { text: 'Error: Multiple project folders have the same name. Enable "Name by order number" in profile settings.', type: 'error' };
        }
    }

    const excludePatterns = (profile.excludePatterns || '').split(',').map(p => p.trim()).filter(Boolean);
    const includePatterns = (profile.includePatterns || '').split(',').map(p => p.trim()).filter(Boolean);

    const scanResults = await Promise.all(handles.map(h => scanDirectory(h, { excludePatterns, includePatterns })));
    const allFileStats = scanResults.flatMap((stats, index) => {
        if (!isMultiProject) return stats;
        const prefix = profile.useNumericPrefixesForMultiProject ? index : handles[index].name;
        return stats.map(s => ({
            ...s,
            path: `${prefix}/${s.path}`
        }));
    });

    const { treeString, totalChars } = buildTreeWithCounts(allFileStats);
    
    let prompt = formatExclusionPrompt({ treeString, totalChars, profile });
    
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
}