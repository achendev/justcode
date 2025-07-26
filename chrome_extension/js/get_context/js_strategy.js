import { updateAndSaveMessage, updateTemporaryMessage } from '../ui_handlers/message.js';
import { getHandle, verifyPermission } from '../file_system_manager.js';
import { scanDirectory } from '../context_builder/file_scanner.js';
import { buildTree, buildTreeWithCounts } from '../context_builder/tree_builder.js';
import { pasteIntoLLM, uploadContextAsFile } from '../context_builder/llm_interface.js';
import { formatContextPrompt, formatExclusionPrompt, buildFileContentString, getInstructionsBlock } from '../context_builder/prompt_formatter.js';

export async function getContextFromJS(profile, fromShortcut) {
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
            await getExclusionSuggestionFromJS(profile); // Use JS version of suggestion
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

export async function getExclusionSuggestionFromJS(profile) {
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