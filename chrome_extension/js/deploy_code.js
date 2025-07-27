import { updateAndSaveMessage, updateTemporaryMessage } from './ui_handlers/message.js';
import { refreshUndoRedoCounts } from './ui.js';
import { handleJsDeployment } from './deploy_code/js_deployment_strategy.js';
import { handleServerDeployment } from './deploy_code/server_deployment_strategy.js';

/**
 * Deploys code to the user's project, choosing the appropriate strategy
 * (JS or Server backend) based on the active profile.
 * This is the main public entry point for the deployment feature.
 * @param {object} profile The active user profile.
 */
export async function deployCode(profile) {
    updateTemporaryMessage(profile.id, '');
    let successMessage = 'Code deployed successfully!'; // Default

    try {
        if (profile.useServerBackend) {
            successMessage = await handleServerDeployment(profile);
        } else {
            successMessage = await handleJsDeployment(profile);
        }
        updateAndSaveMessage(profile.id, successMessage, 'success');
    } catch (error) {
        updateAndSaveMessage(profile.id, `Error: ${error.message}`, 'error');
        console.error('JustCode Error:', error);
    } finally {
        // Always refresh undo/redo counts at the end, regardless of success or failure.
        refreshUndoRedoCounts(profile);
    }
}