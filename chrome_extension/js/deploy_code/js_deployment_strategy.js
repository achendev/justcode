import { updateTemporaryMessage } from '../ui_handlers/message.js';
import { getHandle, verifyPermission } from '../file_system_manager.js';
import { hereDocValue } from '../default_instructions.js';
import { extractCodeToDeploy } from './llm_code_extractor.js';
import { generateUndoScript } from './undo_generator.js';
import { executeFileSystemScript } from './script_executor.js';

/**
 * Handles the deployment process for the JS (File System Access API) backend.
 * @param {object} profile - The active user profile.
 * @returns {Promise<string>} A status message upon completion.
 */
export async function handleJsDeployment(profile) {
    const isDetached = new URLSearchParams(window.location.search).get('view') === 'window';

    const handle = await getHandle(profile.id);
    if (!handle) {
        throw new Error('Please select a project folder first to deploy code.');
    }
     if (!(await verifyPermission(handle))) {
        throw new Error('Permission to folder lost. Please select it again.');
    }

    const codeToDeploy = await extractCodeToDeploy(profile, isDetached);

    if (!codeToDeploy || !codeToDeploy.includes(hereDocValue)) {
        throw new Error('Clipboard content is not a valid deploy script.');
    }
    
    updateTemporaryMessage(profile.id, 'Generating undo script...');
    const undoScript = await generateUndoScript(handle, codeToDeploy);

    updateTemporaryMessage(profile.id, 'Deploying code locally...');
    const errors = await executeFileSystemScript(handle, codeToDeploy, profile.tolerateErrors !== false);
    
    // On success, update history
    const undoKey = `undo_stack_${profile.id}`;
    const redoKey = `redo_stack_${profile.id}`;

    const undoData = await chrome.storage.local.get(undoKey);
    const undoStack = undoData[undoKey] || [];
    
    undoStack.push({ undoScript: undoScript, redoScript: codeToDeploy });
    
    await chrome.storage.local.set({ [undoKey]: undoStack.slice(-20) }); // Limit stack size
    await chrome.storage.local.remove(redoKey);
    
    console.log('JustCode Deploy Result: Local file system updated.');
    
    if (errors.length > 0) {
        const errorDetails = errors.join('\n---\n');
        return `Deployed with ${errors.length} ignored error(s):\n${errorDetails}`;
    }
    
    return 'Code deployed successfully!';
}