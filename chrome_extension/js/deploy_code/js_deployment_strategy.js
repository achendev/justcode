import { updateTemporaryMessage } from '../ui_handlers/message.js';
import { getHandle, verifyPermission } from '../file_system_manager.js';
import { extractCodeWithFallback } from './robust_fallback.js';
import { generateUndoScript } from './undo_generator.js';
import { executeFileSystemScript } from './script_executor.js';

/**
 * Handles the deployment process for the JS (File System Access API) backend.
 * @param {object} profile - The active user profile.
 * @param {boolean} fromShortcut - Whether the call originated from a background shortcut.
 * @param {string|null} hostname - The hostname of the active tab.
 * @returns {Promise<string>} A status message upon completion.
 */
export async function handleJsDeployment(profile, fromShortcut = false, hostname = null) {
    const handle = await getHandle(profile.id);
    if (!handle) {
        throw new Error('Please select a project folder first to deploy code.');
    }
     if (!(await verifyPermission(handle))) {
        throw new Error('Permission to folder lost. Please select it again.');
    }

    const { codeToDeploy, usedFallback } = await extractCodeWithFallback(profile, fromShortcut, hostname);

    if (!codeToDeploy) {
        throw new Error('No valid deploy script found on page or in clipboard.');
    }
    
    if (!fromShortcut) updateTemporaryMessage(profile.id, 'Generating undo script...');
    const undoScript = await generateUndoScript(handle, codeToDeploy);

    if (!fromShortcut) updateTemporaryMessage(profile.id, 'Deploying code locally...');
    const { errors, log } = await executeFileSystemScript(handle, codeToDeploy, profile.tolerateErrors !== false);
    
    const undoKey = `undo_stack_${profile.id}`;
    const redoKey = `redo_stack_${profile.id}`;

    const undoData = await chrome.storage.local.get(undoKey);
    const undoStack = undoData[undoKey] || [];
    
    undoStack.push({ undoScript: undoScript, redoScript: codeToDeploy });
    
    await chrome.storage.local.set({ [undoKey]: undoStack.slice(-20) });
    await chrome.storage.local.remove(redoKey);
    
    console.log('JustCode Deploy Result: Local file system updated.', { log, errors });
    
    const settings = await chrome.storage.local.get({ showVerboseDeployLog: true, hideErrorsOnSuccess: true });

    let finalMessage;
    
    if (!settings.showVerboseDeployLog) {
        finalMessage = errors.length > 0
            ? `Deployed with ${errors.length} ignored error(s).`
            : "Code deployed successfully!";
    } else if (errors.length > 0 && settings.hideErrorsOnSuccess) {
        let message = `Deployed with ${errors.length} ignored error(s).\n--- LOG ---\n`;
        message += log.join('\n');
        finalMessage = message;
    } else {
        let message = '';
        if (errors.length > 0) {
            const errorDetails = errors.join('\n---\n');
            message += `Deployed with ${errors.length} ignored error(s):\n${errorDetails}\n\n--- LOG ---\n`;
        } else {
            message = "Successfully deployed code.\n--- LOG ---\n";
        }
        message += log.join('\n');
        finalMessage = message;
    }
    
    if (usedFallback) {
        return "Used robust deploy fallback. " + finalMessage;
    }
    return finalMessage;
}