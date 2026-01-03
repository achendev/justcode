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

        // --- Server Mode / Agent Mode Branch ---
        
        let { codeToDeploy, usedFallback } = await extractCodeWithFallback(profile, fromShortcut, hostname);

        if (!codeToDeploy) {
            throw new Error('No valid content found on page or in clipboard.');
        }

        let resultMessages = [];
        const isAgent = profile.isAgentModeEnabled;

        // 1. Check for Done Tag (signals end of loop)
        const hasDoneTag = isAgent && /<done\s*\/>/.test(codeToDeploy);
        
        // 2. Check for Bash Commands (Standard Deployment)
        const VALID_COMMAND_REGEX = /^\s*(cat\s+>|mkdir|rm|rmdir|mv|touch|chmod)/m;
        const hasBashCode = VALID_COMMAND_REGEX.test(codeToDeploy);

        // 3. Check for Agent Tools
        const toolMatch = isAgent ? codeToDeploy.match(/<tool\s+code=["'](.*?)["']\s*\/>/) : null;
        const hasTool = !!toolMatch;

        // --- EXECUTION SEQUENCE ---

        // A) Deploy Files First
        if (hasBashCode) {
            // We re-use the standard strategy. It handles parsing and executing the bash script.
            // Note: handleServerDeployment calls the server which parses the string.
            // The server parser ignores XML tags like <tool> or <done>, treating them as text unless inside a heredoc.
            const deployMsg = await handleServerDeployment(profile, fromShortcut, hostname, codeToDeploy);
            resultMessages.push("Files Deployed");
        }

        // B) Execute Tool Second (if present)
        if (hasTool) {
            const command = toolMatch[1];
            // If <done /> is present, we do NOT auto-run the next turn.
            const shouldTriggerRun = !hasDoneTag;
            const toolMsg = await handleAgentTool(profile, command, hostname, shouldTriggerRun);
            resultMessages.push(toolMsg);
        }

        // C) Handle Termination
        if (hasDoneTag) {
            resultMessages.push("Task Completed (Stopped by <done />).");
            // We return a success message. The auto-deploy observer will see no new generation 
            // and the loop will naturally cease because we didn't click "Run" in handleAgentTool (if tool existed)
            // or simply because we stopped here.
        }

        // --- FEEDBACK CONSTRUCTION ---

        if (resultMessages.length === 0) {
            // Should not happen due to validation in extractCodeWithFallback
            return { text: "No actionable agent commands found.", type: 'info' };
        }

        const finalMessage = resultMessages.join(" | ");
        return { text: finalMessage, type: 'success' };

    } catch (error) {
        console.error('JustCode Deploy Error:', error);
        const message = handleServerError(error, profile.useServerBackend);
        return { text: message, type: 'error' };
    }
}