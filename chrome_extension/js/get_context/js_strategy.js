import { getHandles, verifyPermission } from '../file_system_manager.js';
import { scanDirectory } from '../context_builder/file_scanner.js';
import { buildTree, buildTreeWithCounts } from '../context_builder/tree_builder.js';
import { pasteIntoLLM, uploadContextAsFile, uploadInstructionsAsFile } from '../context_builder/llm_interface.js';
import { formatContextPrompt, buildFileContentString, getInstructionsBlock } from '../context_builder/prompt_formatter.js';
import { formatExclusionPrompt } from '../exclusion_prompt.js';
import { writeToClipboard } from '../utils/clipboard.js';
import { applyReplacements } from '../utils/two_way_sync.js';
import { splitContextPayload } from './utils.js';
import { maskIPs } from '../utils/ip_masking.js';
import { maskEmails } from '../utils/email_masking.js';
import { maskFQDNs } from '../utils/fqdn_masking.js';

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
        
        if (profile.getContextTarget === 'clipboard') {
            const finalPrompt = formatContextPrompt(treeString, contentString, profile);
            await writeToClipboard(await process(finalPrompt));
            return { text: 'Context copied to clipboard!', type: 'success' };
        }
        
        if (!profile.contextAsFile) {
            const finalPrompt = formatContextPrompt(treeString, contentString, profile);
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
                    chaperonePrompt = `The project context is split across the attached file(s): ${fileListStr}.\nThe critical instructions for how to respond are in the attached file \`instructions.txt\`.\nYou MUST follow these instructions to fulfill the task described below.\n\n\n \n`;
                    await uploadInstructionsAsFile(await process(instructionsBlock), hostname);
                    await pasteIntoLLM(await process(chaperonePrompt), { isInstruction: true }, hostname);
                    finalMessage = `Context split into ${uploadedFiles.length} file(s) & instructions uploaded!`;
                    break;
                
                case 'text':
                case 'include': 
                default:
                    chaperonePrompt = `The project context is split across the attached file(s): ${fileListStr}. Please use them to fulfill the task described below.\n\n${instructionsBlock}\n\n\n \n`;
                    await pasteIntoLLM(await process(chaperonePrompt), { isInstruction: true }, hostname);
                    finalMessage = `Context split and uploaded as ${uploadedFiles.length} file(s), instructions pasted!`;
                    break;
            }
            return { text: finalMessage, type: 'success' };

        } else {
            const fileContextPayload = `${treeString}\n\n${contentString}`;
            const fileContextForUpload = `This is current state of project files:\n${codeBlockDelimiter}bash\n${fileContextPayload}${codeBlockDelimiter}`;
            const finalPrompt = formatContextPrompt(treeString, contentString, profile);
            
            switch (profile.separateInstructions) {
                case 'include':
                    await uploadContextAsFile(await process(finalPrompt), 'context.txt', hostname);
                    return { text: 'Context uploaded as file!', type: 'success' };
                
                case 'text':
                    const promptForPasting = `The project context is in the attached file \`context.txt\`. Please use it to fulfill the task described below.\n\n${instructionsBlock}\n\n\n \n`;
                    await uploadContextAsFile(await process(fileContextForUpload), 'context.txt', hostname);
                    await pasteIntoLLM(await process(promptForPasting), { isInstruction: true }, hostname);
                    return { text: 'Context uploaded as file, instructions pasted!', type: 'success' };
        
                case 'file':
                    const chaperonePrompt = `The project context is in the attached file \`context.txt\`.\nThe critical instructions for how to respond are in the attached file \`instructions.txt\`.\nYou MUST follow these instructions to fulfill the task described below.\n\n\n \n`;
                    await uploadContextAsFile(await process(fileContextForUpload), 'context.txt', hostname);
                    await uploadInstructionsAsFile(await process(instructionsBlock), hostname);
                    await pasteIntoLLM(await process(chaperonePrompt), { isInstruction: true }, hostname);
                    return { text: 'Context & instructions uploaded as files!', type: 'success' };
        
                default:
                    await uploadContextAsFile(await process(finalPrompt), 'context.txt', hostname);
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
}