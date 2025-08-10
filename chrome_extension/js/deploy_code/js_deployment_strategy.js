import { updateTemporaryMessage } from '../ui_handlers/message.js';
import { getHandle, verifyPermission } from '../file_system_manager.js';
import { hereDocValue } from '../default_instructions.js';
import { extractCodeToDeploy } from './llm_code_extractor.js';
import { generateUndoScript } from './undo_generator.js';
import { executeFileSystemScript } from './script_executor.js';

/**
 * Handles the deployment process for the JS (File System Access API) backend.
 * @param {object} profile - The active user profile.
 * @param {boolean} fromShortcut - Whether the call originated from a background shortcut.
 * @returns {Promise<string>} A status message upon completion.
 */
export async function handleJsDeployment(profile, fromShortcut = false) {
    const handle = await getHandle(profile.id);
    if (!handle) {
        throw new Error('Please select a project folder first to deploy code.');
    }
     if (!(await verifyPermission(handle))) {
        throw new Error('Permission to folder lost. Please select it again.');
    }

    const codeToDeploy = await extractCodeToDeploy(profile, fromShortcut);

    if (!codeToDeploy || !codeToDeploy.includes(hereDocValue)) {
        throw new Error('No valid deploy script found on page or in clipboard.');
    }
    
    // Only show temporary messages if called from the UI
    if (!fromShortcut) updateTemporaryMessage(profile.id, 'Generating undo script...');
    const undoScript = await generateUndoScript(handle, codeToDeploy);

    if (!fromShortcut) updateTemporaryMessage(profile.id, 'Deploying code locally...');
    const { errors, log } = await executeFileSystemScript(handle, codeToDeploy, profile.tolerateErrors !== false);
    
    // On success, update history
    const undoKey = `undo_stack_${profile.id}`;
    const redoKey = `redo_stack_${profile.id}`;

    const undoData = await chrome.storage.local.get(undoKey);
    const undoStack = undoData[undoKey] || [];
    
    undoStack.push({ undoScript: undoScript, redoScript: codeToDeploy });
    
    await chrome.storage.local.set({ [undoKey]: undoStack.slice(-20) }); // Limit stack size
    await chrome.storage.local.remove(redoKey);
    
    console.log('JustCode Deploy Result: Local file system updated.', { log, errors });
    
    let message = '';
    if (errors.length > 0) {
        const errorDetails = errors.join('\n---\n');
        message += `Deployed with ${errors.length} ignored error(s):\n${errorDetails}\n\n--- LOG ---\n`;
    } else {
        message = "Successfully deployed code.\n--- LOG ---\n";
    }
    message += log.join('\n');
    
    return message;
}