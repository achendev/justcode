import { pasteIntoLLM } from '../context_builder/llm_interface.js';
import { applyReplacements } from '../utils/two_way_sync.js';
import { maskIPs } from '../utils/ip_masking.js';
import { maskEmails } from '../utils/email_masking.js';

/**
 * Handles agent tool execution.
 * @param {object} profile The active profile.
 * @param {string} command The command content to execute.
 * @param {string} delimiter The delimiter used (e.g. EOBASH123).
 * @param {string} hostname Hostname of the current tab.
 * @param {boolean} shouldTriggerRun If true, clicks the send button after pasting.
 */
export async function handleAgentTool(profile, command, delimiter, hostname, shouldTriggerRun = true) {
    if (!profile.useServerBackend) {
        return "Error: Agent mode tools require Server Backend.";
    }

    const serverUrl = profile.serverUrl.endsWith('/') ? profile.serverUrl.slice(0, -1) : profile.serverUrl;
    const endpoint = `${serverUrl}/agent/execute`;

    // Construct paths array for the server
    const pathParams = profile.projectPaths.map(p => `path=${encodeURIComponent(p)}`).join('&');
    const fullEndpoint = `${endpoint}?${pathParams}&useNumericPrefixes=${profile.useNumericPrefixesForMultiProject}`;

    try {
        const headers = { 'Content-Type': 'application/json' };
        if (profile.isAuthEnabled && profile.username) {
            headers['Authorization'] = 'Basic ' + btoa(`${profile.username}:${profile.password}`);
        }

        // Execute Command on Server
        // Note: The 'command' passed here already has incoming replacements applied (via deployCode.js logic),
        // so it uses real paths/credentials (e.g. 'admin').
        const response = await fetch(fullEndpoint, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({ command: command })
        });

        let resultText = await response.text();
        
        if (!response.ok) {
             throw new Error(`Agent tool failed: ${resultText}`);
        }

        // --- PROCESSING OUTPUT (Privacy & Sync) ---
        
        // 1. Process the result from the server (e.g. mask 'admin' -> 'someuser')
        if (profile.isTwoWaySyncEnabled && profile.twoWaySyncRules) {
            resultText = applyReplacements(resultText, profile.twoWaySyncRules, 'outgoing');
        }
        if (profile.autoMaskIPs) {
            resultText = await maskIPs(resultText);
        }
        if (profile.autoMaskEmails) {
            resultText = await maskEmails(resultText);
        }

        // 2. Process the executed command for display
        // We must reverse the 'incoming' replacements so we don't leak real values back into the context.
        // e.g. 'admin' -> 'someuser'
        let displayCommand = command;
        if (profile.isTwoWaySyncEnabled && profile.twoWaySyncRules) {
            displayCommand = applyReplacements(displayCommand, profile.twoWaySyncRules, 'outgoing');
        }
        if (profile.autoMaskIPs) {
            displayCommand = await maskIPs(displayCommand);
        }
        if (profile.autoMaskEmails) {
            displayCommand = await maskEmails(displayCommand);
        }

        // Reconstruct the heredoc format for the UI log
        const fullCommandStr = `bash << ${delimiter}\n${displayCommand}\n${delimiter}`;

        // Format result for LLM
        let reply = `\n<tool_output>\nCOMMAND:\n${fullCommandStr}\n\n${resultText}\n</tool_output>`;
        
        if (shouldTriggerRun) {
            reply += "\n\nProceed with the next step.";
        } else {
            reply += "\n\n(Auto-run stopped by <done /> tag or user interruption).";
        }
        
        // Paste into UI
        await pasteIntoLLM(reply, {}, hostname);
        
        // Click Send (Triggering logic) if requested
        if (shouldTriggerRun) {
            await clickSendButton(hostname);
        }

        return `Executed: bash << ${delimiter}`;

    } catch (error) {
        console.error("Agent execution error:", error);
        throw error;
    }
}

async function clickSendButton(hostname) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;

    await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
             // Heuristics for different platforms
             // AI Studio
             const msRunButton = document.querySelector('ms-run-button button');
             if (msRunButton) { msRunButton.click(); return; }

             // ChatGPT / Generic
             const sendButton = document.querySelector('button[data-testid="send-button"], button[aria-label="Send message"]');
             if (sendButton) { sendButton.click(); return; }
             
             // Fallback
             console.warn("JustCode: Could not find Send button to auto-run agent response.");
        }
    });
}