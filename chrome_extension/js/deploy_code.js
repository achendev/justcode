import { updateAndSaveMessage, updateTemporaryMessage } from './ui_handlers/message.js';
import { refreshUndoRedoCounts } from './ui.js';
import { handleJsDeployment } from './deploy_code/js_deployment_strategy.js';
import { handleServerDeployment } from './deploy_code/server_deployment_strategy.js';

/**
 * Deploys code to the user's project, choosing the appropriate strategy
 * (JS or Server backend) based on the active profile.
 * This is the main public entry point for the deployment feature.
 * @param {object} profile The active user profile.
 * @param {boolean} [fromShortcut=false] - True if called from a keyboard shortcut.
 * @returns {Promise<{text: string, type: 'success'|'error'|'info'}>} A result object.
 */
export async function deployCode(profile, fromShortcut = false) {
    if (!fromShortcut) {
        updateTemporaryMessage(profile.id, '');
    }
    
    let result = { text: 'Code deployed successfully!', type: 'success' }; // Default

    try {
        if (profile.useServerBackend) {
            const serverMessage = await handleServerDeployment(profile, fromShortcut);
            result = { text: serverMessage, type: 'success' };
        } else {
            const jsMessage = await handleJsDeployment(profile, fromShortcut);
            result = { text: jsMessage, type: 'success' };
        }
    } catch (error) {
        console.error('JustCode Deploy Error:', error);
        result = { text: `Error: ${error.message}`, type: 'error' };
    } finally {
        if (!fromShortcut) {
            updateAndSaveMessage(profile.id, result.text, result.type);
            // Always refresh undo/redo counts at the end, regardless of success or failure.
            refreshUndoRedoCounts(profile);
        }
    }
    
    return result;
}