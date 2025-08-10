import { handleJsDeployment } from './deploy_code/js_deployment_strategy.js';
import { handleServerDeployment } from './deploy_code/server_deployment_strategy.js';

/**
 * Deploys code to the user's project, choosing the appropriate strategy
 * (JS or Server backend) based on the active profile.
 * This is the main public entry point for the deployment feature.
 * It returns a result object for the caller to handle.
 * @param {object} profile The active user profile.
 * @param {boolean} [fromShortcut=false] - True if called from a keyboard shortcut.
 * @returns {Promise<{text: string, type: 'success'|'error'|'info'}>} A result object.
 */
export async function deployCode(profile, fromShortcut = false) {
    try {
        const deploymentFn = profile.useServerBackend ? handleServerDeployment : handleJsDeployment;
        const successMessage = await deploymentFn(profile, fromShortcut);
        return { text: successMessage, type: 'success' };
    } catch (error) {
        console.error('JustCode Deploy Error:', error);
        return { text: `Error: ${error.message}`, type: 'error' };
    }
}