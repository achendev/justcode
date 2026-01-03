import { pasteIntoLLM } from '../context_builder/llm_interface.js';

/**
 * Handles agent tool execution.
 * @param {object} profile The active profile.
 * @param {string} command The command to execute (extracted from <tool> tag).
 * @param {string} hostname Hostname of the current tab.
 * @param {boolean} shouldTriggerRun If true, clicks the send button after pasting.
 */
export async function handleAgentTool(profile, command, hostname, shouldTriggerRun = true) {
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

        const response = await fetch(fullEndpoint, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({ command: command })
        });

        const resultText = await response.text();
        
        if (!response.ok) {
             throw new Error(`Agent tool failed: ${resultText}`);
        }

        // Format result for LLM
        let reply = `\n<tool_output>\n${resultText}\n</tool_output>`;
        
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

        return `Executed: ${command}`;

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