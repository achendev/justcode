import { pasteIntoLLM } from '../context_builder/llm_interface.js';
import { applyReplacements } from '../utils/two_way_sync.js';
import { maskIPs } from '../utils/ip_masking.js';
import { maskEmails } from '../utils/email_masking.js';

export async function executeAgentCommand(profile, command, delimiter) {
    if (!profile.useServerBackend) {
        throw new Error("Agent mode tools require Server Backend.");
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

        return { resultText, displayCommand, delimiter };

    } catch (error) {
        console.error("Agent execution error:", error);
        throw error;
    }
}

export async function reportAgentResults(results, hostname, shouldTriggerRun) {
    let combinedOutput = '\n<tool_output>';
    
    for (const res of results) {
        const fullCommandStr = `bash << ${res.delimiter}\n${res.displayCommand}\n${res.delimiter}`;
        combinedOutput += `\nCOMMAND:\n${fullCommandStr}\n\n${res.resultText}\n`;
    }
    
    combinedOutput += '</tool_output>';

    if (shouldTriggerRun) {
        combinedOutput += "\n\nProceed with the next step.";
    } else {
        combinedOutput += "\n\n(Auto-run stopped by <done /> tag or user interruption).";
    }
    
    await pasteIntoLLM(combinedOutput, {}, hostname);
    
    if (shouldTriggerRun) {
        await clickSendButton(hostname);
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