import { handleJsDeployment } from './deploy_code/js_deployment_strategy.js';
import { handleServerDeployment } from './deploy_code/server_deployment_strategy.js';
import { handleServerError } from './ui_handlers/server_error_handler.js';
import { extractCodeWithFallback } from './deploy_code/robust_fallback.js';
import { executeAgentCommand, reportAgentResults } from './deploy_code/agent_strategy.js';
import { applyReplacements } from './utils/two_way_sync.js';
import { unmaskIPs } from './utils/ip_masking.js';
import { unmaskEmails } from './utils/email_masking.js';
import { unmaskFQDNs } from './utils/fqdn_masking.js';

export async function deployCode(profile, fromShortcut = false, hostname = null) {
    try {
        let { codeToDeploy, usedFallback } = await extractCodeWithFallback(profile, fromShortcut, hostname);

        if (!codeToDeploy) {
            throw new Error('No valid content found on page or in clipboard.');
        }

        // --- RETRIEVE SESSION STATE ---
        const stateKey = `session_state_${profile.id}`;
        const sessionState = (await chrome.storage.local.get(stateKey))[stateKey] || {};
        
        // Use stored file delimiter or fallback to legacy/generic if not found
        // Note: For file operations, we don't strictly enforce the session ID in regex matching *here* 
        // because the parsing logic is deeper in the strategies, but we pass it down.
        // However, if strictness is required, the executor functions will handle it.
        const fileDelimiter = sessionState.fileDelimiter || 'EOPROJECTFILE';
        const agentDelimiter = sessionState.agentDelimiter;

        // --- CENTRALIZED INPUT PROCESSING ---
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
             const successMessage = await handleJsDeployment(profile, fromShortcut, hostname, codeToDeploy, fileDelimiter);
             return { text: successMessage, type: 'success' };
        }

        // --- Server Mode / Agent Mode Branch ---
        
        let resultMessages = [];
        const isAgent = profile.isAgentModeEnabled;

        // 1. Check for Done Tag
        const hasDoneTag = /<done\b[^>]*\/?>/i.test(codeToDeploy);
        
        // 2. Check for Bash Commands
        const VALID_COMMAND_REGEX = /^\s*(cat\s+>|mkdir|rm|rmdir|mv|touch|chmod)/m;
        const hasBashCode = VALID_COMMAND_REGEX.test(codeToDeploy);

        // 3. Check for Agent Tools (Strict Session Matching)
        let toolMatches = [];
        
        if (isAgent) {
            let agentCommandRegex;
            
            if (agentDelimiter) {
                // Strict: Only match the specific session delimiter
                agentCommandRegex = new RegExp(`bash\\s*<<\\s*(${agentDelimiter})\\s*([\\s\\S]*?)\\s*\\1`, "gi");
            } else {
                // Fallback
                console.warn("JustCode: No active agent session delimiter found. Using generic matching.");
                agentCommandRegex = /bash\s*<<\s*(EOBASH\d{3})\s*([\s\S]*?)\s*\1/gi;
            }
            
            toolMatches = [...codeToDeploy.matchAll(agentCommandRegex)];
        }

        const hasTool = isAgent && toolMatches.length > 0;

        // --- EXECUTION SEQUENCE ---

        // A) Deploy Files First
        if (hasBashCode) {
            let fileDeployScript = codeToDeploy;
            if (isAgent) {
                const bashBlockRegex = /```bash\s*([\s\S]*?)\s*```/gi;
                const blocks = [...codeToDeploy.matchAll(bashBlockRegex)];
                if (blocks.length > 0) {
                    fileDeployScript = blocks.map(m => m[1]).join('\n\n');
                }
            }

            if (VALID_COMMAND_REGEX.test(fileDeployScript)) {
                // Pass the specific file delimiter to the server strategy
                const deployMsg = await handleServerDeployment(profile, fromShortcut, hostname, fileDeployScript, fileDelimiter);
                resultMessages.push(deployMsg);
            }
        }

        // B) Execute Tools Second
        if (hasTool) {
            const outputs = [];
            for (const match of toolMatches) {
                const delimiter = match[1]; 
                const command = match[2].trim(); 
                
                const result = await executeAgentCommand(profile, command, delimiter);
                outputs.push(result);
            }

            const shouldTriggerRun = !hasDoneTag;
            await reportAgentResults(outputs, hostname, shouldTriggerRun);
            
            resultMessages.push(`Executed ${outputs.length} agent command(s).`);

        } else if (toolMatches.length > 0 && !isAgent) {
            resultMessages.push("Agent tool detected but Agent Mode is disabled. Tool ignored.");
        }

        // C) Handle Termination
        if (hasDoneTag) {
            resultMessages.push("Task Completed.");
        }

        if (resultMessages.length === 0) {
            if (isAgent) {
                const genericRegex = /bash\s*<<\s*(EOBASH\d{3})\s*([\s\S]*?)\s*\1/i;
                if (genericRegex.test(codeToDeploy) && !hasTool) {
                    return { text: "Agent command ignored: Delimiter mismatch.", type: 'warning' };
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