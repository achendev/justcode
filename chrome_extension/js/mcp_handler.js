import { getContextFromServer } from './get_context/server_strategy.js';
import { pasteIntoLLM, uploadContextAsFile } from './context_builder/llm_interface.js';
import { extractCodeToDeploy } from './deploy_code/llm_code_extractor.js';
import { prepareForFullAnswerExtraction, revertFullAnswerExtraction } from './deploy_code/robust_fallback_handlers/aistudio.js';

// --- Context State Management ---
async function checkContextSent(tabId) {
    const results = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => window.justCodeContextSent === true
    });
    return results[0]?.result || false;
}

async function markContextSent(tabId) {
    await chrome.scripting.executeScript({
        target: { tabId },
        func: () => { window.justCodeContextSent = true; }
    });
}

// --- Interaction Helpers ---
async function clickSendButton(hostname) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;

    await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
             // AI Studio
             const msRunButton = document.querySelector('ms-run-button button');
             if (msRunButton) { msRunButton.click(); return; }
             // Generic
             const sendButton = document.querySelector('button[data-testid="send-button"], button[aria-label="Send message"]');
             if (sendButton) { sendButton.click(); return; }
        }
    });
}

async function getTurnCount(tabId) {
    const results = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => document.querySelectorAll('.chat-turn-container.model').length
    });
    return results[0]?.result || 0;
}

function waitForResponse(tabId, initialTurnCount) {
    return new Promise((resolve, reject) => {
        const checkInterval = 500;
        let checks = 0;
        const maxChecks = 600; // 5 minutes (600 * 500ms)

        const intervalId = setInterval(async () => {
            checks++;
            if (checks > maxChecks) {
                clearInterval(intervalId);
                reject(new Error("Timeout waiting for LLM response."));
                return;
            }

            try {
                const results = await chrome.scripting.executeScript({
                    target: { tabId: tabId },
                    func: () => {
                        // Check if generating
                        let isGenerating = false;
                        const msRunButton = document.querySelector('ms-run-button button');
                        if (msRunButton) {
                            const hasSpinner = !!msRunButton.querySelector('.spin');
                            const text = msRunButton.textContent || "";
                            isGenerating = hasSpinner || text.includes('Stop');
                        } else {
                            const stopButton = document.querySelector('.run-button.stop, button[aria-label="Stop generating"], button[data-testid="stop-button"]');
                            isGenerating = !!stopButton;
                        }
                        
                        // Check turn count
                        const currentTurns = document.querySelectorAll('.chat-turn-container.model').length;
                        
                        return { isGenerating, currentTurns };
                    }
                });
                
                const { isGenerating, currentTurns } = results[0]?.result || { isGenerating: false, currentTurns: initialTurnCount };

                // Condition: We have a NEW turn, and we are NOT generating anymore.
                if (currentTurns > initialTurnCount && !isGenerating) {
                    // Double check stability (wait one more tick to be sure it didn't just flicker)
                    setTimeout(() => {
                        clearInterval(intervalId);
                        resolve();
                    }, 500); 
                }
                
            } catch (e) {
                // Ignore transient errors (tab closed?)
                console.warn("MCP: Error polling status", e);
            }
        }, checkInterval);
    });
}

// --- Main Handler ---
export async function handleMcpRequest(profile, reqId, userPrompt) {
    console.log("MCP: Handling request", reqId);
    
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) {
        throw new Error("No active tab to execute MCP request.");
    }
    const hostname = new URL(tab.url).hostname;

    // 1. Context Logic
    const alreadySent = await checkContextSent(tab.id);
    
    if (!alreadySent) {
        console.log("MCP: First request in session. Fetching and uploading context...");
        const serverUrl = profile.serverUrl.endsWith('/') ? profile.serverUrl.slice(0, -1) : profile.serverUrl;
        const paths = profile.projectPaths;
        const excludePatterns = profile.excludePatterns || '';
        const pathParams = paths.map(p => `path=${encodeURIComponent(p)}`).join('&');
        const endpoint = `${serverUrl}/getcontext?${pathParams}&exclude=${encodeURIComponent(excludePatterns)}&limit=${profile.contextSizeLimit}&delimiter=EOPROJECTFILE`;
        
        try {
            const contextResponse = await fetch(endpoint);
            if (!contextResponse.ok) throw new Error("Failed to fetch context from server.");
            const contextText = await contextResponse.text();
            
            await uploadContextAsFile(contextText, 'context.txt', hostname);
            await new Promise(r => setTimeout(r, 1000)); // Wait for file upload UI
            await markContextSent(tab.id);
        } catch (e) {
            console.error("MCP: Context upload failed:", e);
            throw new Error(`Context upload failed: ${e.message}`);
        }
    } else {
        console.log("MCP: Context already sent for this tab. Skipping file upload.");
    }

    // 2. Prompt & Execution
    console.log("MCP: Pasting user prompt...");
    await pasteIntoLLM(userPrompt, { insertAtCursor: true }, hostname);
    
    // Get initial state for robust waiting
    const initialTurnCount = await getTurnCount(tab.id);
    
    await new Promise(r => setTimeout(r, 500));
    await clickSendButton(hostname);
    
    // 3. Wait
    console.log(`MCP: Waiting for generation (Base turns: ${initialTurnCount})...`);
    await waitForResponse(tab.id, initialTurnCount);

    // 4. Extraction with Retry & Force Raw Mode
    let answer = null;
    let toggled = false;
    const extractionProfile = { ...profile, deployFromFullAnswer: true };

    try {
        // Attempt 1: Standard Extraction
        console.log("MCP: Attempting extraction...");
        answer = await extractCodeToDeploy(extractionProfile, false, hostname, tab.id);

        // Attempt 2: Force Raw Mode if standard failed
        if (!answer && hostname.includes('aistudio.google.com')) {
            console.log("MCP: Standard extraction empty. Forcing Raw Mode...");
            const toggleResults = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: prepareForFullAnswerExtraction,
                args: [true] // Force = true
            });
            toggled = toggleResults[0]?.result || false;
            
            // Wait for toggle to render text
            await new Promise(r => setTimeout(r, 800));
            answer = await extractCodeToDeploy(extractionProfile, false, hostname, tab.id);
        }
    } catch (e) {
        console.error("MCP Extraction Error:", e);
    } finally {
        if (toggled) {
            console.log("MCP: Reverting Raw Mode...");
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: revertFullAnswerExtraction
            });
        }
    }
    
    if (!answer) {
        throw new Error("Could not extract answer from page (UI might be different or empty response).");
    }
    
    return answer;
}