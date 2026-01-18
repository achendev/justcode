import { handleJsDeployment } from './deploy_code/js_deployment_strategy.js';
import { handleServerDeployment } from './deploy_code/server_deployment_strategy.js';
import { handleServerError } from './ui_handlers/server_error_handler.js';
import { extractCodeWithFallback } from './deploy_code/robust_fallback.js';
import { executeAgentCommand, reportAgentResults } from './deploy_code/agent_strategy.js';
import { applyReplacements } from './utils/two_way_sync.js';
import { unmaskIPs } from './utils/ip_masking.js';
import { unmaskEmails } from './utils/email_masking.js';
import { unmaskFQDNs } from './utils/fqdn_masking.js';

/**
 * Deploys code to the user's project, choosing the appropriate strategy.
 * @param {object} profile The active user profile.
 * @param {boolean} [fromShortcut=false] - True if called from a keyboard shortcut.
 * @param {string|null} [hostname=null] - The hostname of the active tab.
 * @returns {Promise<{text: string, type: 'success'|'error'|'info'}>} A result object.
 */
export async function deployCode(profile, fromShortcut = false, hostname = null) {
    try {
        let { codeToDeploy, usedFallback } = await extractCodeWithFallback(profile, fromShortcut, hostname);

        if (!codeToDeploy) {
            throw new Error('No valid content found on page or in clipboard.');
        }

        // --- CENTRALIZED INPUT PROCESSING ---
        // Apply "Incoming" replacements (Unmasking/Restoring) BEFORE any parsing or execution.
        if (profile.autoMaskEmails) {
            codeToDeploy = await unmaskEmails(codeToDeploy);
        }
        if (profile.autoMaskIPs) {
            codeToDeploy = await unmaskIPs(codeToDeploy);
        }
        if (profile.autoMaskFQDNs) {
            codeToDeploy = await unmaskFQDNs(codeToDeploy);
        }
        if (profile.isTwoWaySyncEnabled && profile.twoWaySyncRules) {
            codeToDeploy = applyReplacements(codeToDeploy, profile.twoWaySyncRules, 'incoming');
        }

        if (!profile.useServerBackend) {
             const successMessage = await handleJsDeployment(profile, fromShortcut, hostname, codeToDeploy);
             return { text: successMessage, type: 'success' };
        }

        // --- Server Mode / Agent Mode Branch ---
        
        let resultMessages = [];
        const isAgent = profile.isAgentModeEnabled;

        // 1. Check for Done Tag (signals end of loop)
        const hasDoneTag = /<done\b[^>]*\/?>/i.test(codeToDeploy);
        
        // 2. Check for Bash Commands (Standard Deployment)
        const VALID_COMMAND_REGEX = /^\s*(cat\s+>|mkdir|rm|rmdir|mv|touch|chmod)/m;
        // Check if there are any valid file commands in the whole text
        const hasBashCode = VALID_COMMAND_REGEX.test(codeToDeploy);

        // 3. Check for Agent Tools (Strict Session Matching)
        let toolMatches = [];
        
        if (isAgent) {
            const stateKey = `agent_state_${profile.id}`;
            const agentState = await chrome.storage.local.get(stateKey);
            const storedDelimiter = agentState[stateKey]?.delimiter;
            
            let agentCommandRegex;
            
            if (storedDelimiter) {
                // Strict: Only match the specific session delimiter found in the prompt
                agentCommandRegex = new RegExp(`bash\\s*<<\\s*(${storedDelimiter})\\s*([\\s\\S]*?)\\s*\\1`, "gi");
            } else {
                // Fallback: If no strict session state is found (e.g. storage cleared), 
                // match any valid EOBASHxxx to allow continuation, but warn.
                console.warn("JustCode: No active agent session delimiter found in storage. Using generic matching.");
                agentCommandRegex = /bash\s*<<\s*(EOBASH\d{3})\s*([\s\S]*?)\s*\1/gi;
            }
            
            toolMatches = [...codeToDeploy.matchAll(agentCommandRegex)];
        }

        const hasTool = isAgent && toolMatches.length > 0;

        // --- EXECUTION SEQUENCE ---

        // A) Deploy Files First
        if (hasBashCode) {
            // Optimization for Agent Mode:
            // If Agent Mode is active, the LLM output is likely mixed text.
            // We try to extract only the ```bash ... ``` blocks to prevent sending 
            // conversational text or agent commands to the file deployment endpoint,
            // which would cause "Unsupported command" errors in the server logs.
            let fileDeployScript = codeToDeploy;
            if (isAgent) {
                const bashBlockRegex = /```bash\s*([\s\S]*?)\s*```/gi;
                const blocks = [...codeToDeploy.matchAll(bashBlockRegex)];
                if (blocks.length > 0) {
                    fileDeployScript = blocks.map(m => m[1]).join('\n\n');
                }
            }

            // Only deploy if the (potentially filtered) script still contains valid commands
            if (VALID_COMMAND_REGEX.test(fileDeployScript)) {
                const deployMsg = await handleServerDeployment(profile, fromShortcut, hostname, fileDeployScript);
                resultMessages.push(deployMsg);
            }
        }

        // B) Execute Tools Second (if present)
        if (hasTool) {
            const outputs = [];
            for (const match of toolMatches) {
                const delimiter = match[1]; // Capture group 1: EOBASHxxx
                const command = match[2].trim(); // Capture group 2: content
                
                const result = await executeAgentCommand(profile, command, delimiter);
                outputs.push(result);
            }

            // If <done /> is present, we do NOT auto-run the next turn.
            const shouldTriggerRun = !hasDoneTag;
            await reportAgentResults(outputs, hostname, shouldTriggerRun);
            
            resultMessages.push(`Executed ${outputs.length} agent command(s).`);

        } else if (toolMatches.length > 0 && !isAgent) {
            // Warn if tool found but Agent Mode disabled
            resultMessages.push("Agent tool detected but Agent Mode is disabled. Tool ignored.");
        }

        // C) Handle Termination
        if (hasDoneTag) {
            resultMessages.push("Task Completed.");
        }

        // --- FEEDBACK CONSTRUCTION ---

        if (resultMessages.length === 0) {
            // If we are in agent mode but found no matching delimiter, provide specific feedback
            if (isAgent) {
                const genericRegex = /bash\s*<<\s*(EOBASH\d{3})\s*([\s\S]*?)\s*\1/i;
                if (genericRegex.test(codeToDeploy) && !hasTool) {
                    return { text: "Agent command ignored: Delimiter mismatch. Expected one from current session.", type: 'warning' };
                }
            }
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