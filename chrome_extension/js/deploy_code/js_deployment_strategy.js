import { updateTemporaryMessage } from '../ui_handlers/message.js';
import { getHandles, verifyPermission } from '../file_system_manager.js';
import { extractCodeWithFallback } from './robust_fallback.js';
import { generateUndoScript } from './undo_generator.js';
import { executeFileSystemScript } from './script_executor.js';
import { applyReplacements } from '../utils/two_way_sync.js';
import { unmaskIPs } from '../utils/ip_masking.js';
import { unmaskEmails } from '../utils/email_masking.js';

/**
 * Handles the deployment process for the JS (File System Access API) backend.
 * @param {object} profile - The active user profile.
 * @param {boolean} fromShortcut - Whether the call originated from a background shortcut.
 * @param {string|null} hostname - The hostname of the active tab.
 * @returns {Promise<string>} A status message upon completion.
 */
export async function handleJsDeployment(profile, fromShortcut = false, hostname = null) {
    const folderCount = (profile.jsProjectFolderNames || []).length || 1;
    const handles = await getHandles(profile.id, folderCount);
    const validHandles = handles.filter(Boolean);

    if (validHandles.length === 0) {
        throw new Error('Please select a project folder first to deploy code.');
    }
    if (validHandles.length > 1 && !profile.useNumericPrefixesForMultiProject) {
        const handleNames = validHandles.map(h => h.name);
        if (new Set(handleNames).size !== handleNames.length) {
            throw new Error('Multiple project folders have the same name. Enable "Name by order number" in profile settings to resolve ambiguity.');
        }
    }

    for (const handle of validHandles) {
        if (!(await verifyPermission(handle))) {
            throw new Error(`Permission to folder '${handle.name}' lost. Please select it again.`);
        }
    }

    let { codeToDeploy, usedFallback } = await extractCodeWithFallback(profile, fromShortcut, hostname);

    if (!codeToDeploy) {
        throw new Error('No valid deploy script found on page or in clipboard.');
    }
    
    // --- RESTORE MASKS ---
    if (profile.autoMaskEmails) {
        codeToDeploy = await unmaskEmails(codeToDeploy);
    }
    if (profile.autoMaskIPs) {
        codeToDeploy = await unmaskIPs(codeToDeploy);
    }
    if (profile.isTwoWaySyncEnabled && profile.twoWaySyncRules) {
        codeToDeploy = applyReplacements(codeToDeploy, profile.twoWaySyncRules, 'incoming');
    }
    
    if (!fromShortcut) updateTemporaryMessage(profile.id, 'Generating undo script...');
    const undoScript = await generateUndoScript(validHandles, codeToDeploy, profile);

    if (!fromShortcut) updateTemporaryMessage(profile.id, 'Deploying code locally...');
    const { errors, log } = await executeFileSystemScript(validHandles, codeToDeploy, profile);
    
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