import { handleJsDeployment } from './deploy_code/js_deployment_strategy.js';
import { handleServerDeployment } from './deploy_code/server_deployment_strategy.js';
import { handleServerError } from './ui_handlers/server_error_handler.js';
import { extractCodeWithFallback } from './deploy_code/robust_fallback.js';
import { handleAgentTool } from './deploy_code/agent_strategy.js';

/**
 * Deploys code to the user's project, choosing the appropriate strategy.
 * @param {object} profile The active user profile.
 * @param {boolean} [fromShortcut=false] - True if called from a keyboard shortcut.
 * @param {string|null} [hostname=null] - The hostname of the active tab.
 * @returns {Promise<{text: string, type: 'success'|'error'|'info'}>} A result object.
 */
export async function deployCode(profile, fromShortcut = false, hostname = null) {
    try {
        if (!profile.useServerBackend) {
             const successMessage = await handleJsDeployment(profile, fromShortcut, hostname);
             return { text: successMessage, type: 'success' };
        }

        // --- Server Mode Branch ---
        
        // 1. Extract Raw Code First to check for Agent Tools
        // Note: handleServerDeployment usually calls extractCodeWithFallback internally.
        // To support agent mode, we need to peek at the content first.
        // However, extracting twice might be inefficient or state-changing (AI Studio fallback).
        // Let's modify logic: extract once here, pass to handler.
        
        let { codeToDeploy, usedFallback } = await extractCodeWithFallback(profile, fromShortcut, hostname);

        if (!codeToDeploy) {
            throw new Error('No valid content found on page or in clipboard.');
        }

        // 2. Check for Agent Tools if Agent Mode enabled
        if (profile.isAgentModeEnabled) {
            const toolMatch = codeToDeploy.match(/<tool\s+code=["'](.*?)["']\s*\/>/);
            if (toolMatch) {
                const command = toolMatch[1];
                const msg = await handleAgentTool(profile, command, hostname);
                return { text: `Agent Tool: ${msg}`, type: 'success' };
            }
        }

        // 3. Fallback to Standard File Deployment
        // We pass the already-extracted code to a modified server deployment handler
        // or we just call the existing one and let it re-extract (safest for now to minimize refactor risk, 
        // though slightly inefficient).
        // Actually, handleServerDeployment does not accept code string args yet.
        // Let's rely on the fact that handleServerDeployment is robust.
        // BUT wait, if we already extracted it and it WASN'T a tool, we still need to deploy it.
        // Re-extracting is fine.
        
        const successMessage = await handleServerDeployment(profile, fromShortcut, hostname);
        return { text: successMessage, type: 'success' };

    } catch (error) {
        console.error('JustCode Deploy Error:', error);
        const message = handleServerError(error, profile.useServerBackend);
        return { text: message, type: 'error' };
    }
}