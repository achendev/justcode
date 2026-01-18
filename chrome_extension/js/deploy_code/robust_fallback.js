import { extractCodeToDeploy } from './llm_code_extractor.js';
import { prepareForFullAnswerExtraction, revertFullAnswerExtraction } from './robust_fallback_handlers/aistudio.js';

// A simple regex to check for the presence of at least one valid command.
const VALID_COMMAND_REGEX = /^\s*(cat\s+>|mkdir|rm|rmdir|mv|touch|chmod)/m;
// Regex to check for agent tool usage (Robust: matches bash << EOBASH...)
const VALID_TOOL_REGEX = /bash\s*<<\s*(EOBASH\d{3})/i;
// Regex to check for done tag (Robust)
const DONE_TAG_REGEX = /<done\b[^>]*\/?>/i;

/**
 * Attempts to extract code to deploy, with a robust fallback to the full answer if the initial extraction fails.
 * This version includes a try...finally block to guarantee the UI state is reverted.
 * @param {object} profile - The active user profile.
 * @param {boolean} fromShortcut - Whether the call originated from a background shortcut.
 * @param {string|null} hostname - The hostname of the active tab.
 * @param {number|null} [tabId=null] - Explicit tab ID for background operations.
 * @returns {Promise<{codeToDeploy: string|null, usedFallback: boolean}>}
 */
export async function extractCodeWithFallback(profile, fromShortcut = false, hostname = null, tabId = null) {
    let codeToDeploy = await extractCodeToDeploy(profile, fromShortcut, hostname, tabId);
    let usedFallback = false;

    // Helper to validate content based on profile mode
    const isValidContent = (content) => {
        if (!content) return false;
        if (VALID_COMMAND_REGEX.test(content)) return true;
        // Always check for agent tags as valid content, regardless of profile mode.
        // This prevents errors if the user has Agent Mode off but the LLM outputs tools.
        // The execution logic in deploy_code.js will decide whether to run them.
        if (VALID_TOOL_REGEX.test(content)) return true;
        if (DONE_TAG_REGEX.test(content)) return true;
        
        return false;
    };

    const needsFallback = (await chrome.storage.local.get({ robustDeployFallback: true })).robustDeployFallback &&
                          profile.deployCodeSource === 'ui' &&
                          !profile.deployFromFullAnswer &&
                          !isValidContent(codeToDeploy);

    if (needsFallback) {
        console.log("JustCode: Code block empty/invalid. Trying fallback to full answer.");
        usedFallback = true;
        
        // Find correct tab for script injection fallback
        let tab;
        if (tabId) {
            try { tab = await chrome.tabs.get(tabId); } catch(e) {}
        } else {
            const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
            tab = tabs[0];
        }

        let stateChanged = false;

        try {
            // Special handling for AI Studio
            if (tab && tab.id && hostname && hostname.includes('aistudio.google.com')) {
                const results = await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    func: prepareForFullAnswerExtraction,
                });
                stateChanged = results[0]?.result || false;
            }
            
            // Force full extraction for fallback
            const tempProfile = { ...profile, deployFromFullAnswer: true };
            codeToDeploy = await extractCodeToDeploy(tempProfile, fromShortcut, hostname, tabId);

        } finally {
            if (tab && tab.id && stateChanged && hostname && hostname.includes('aistudio.google.com')) {
                await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    func: revertFullAnswerExtraction,
                });
            }
        }
    }

    if (!isValidContent(codeToDeploy)) {
        return { codeToDeploy: null, usedFallback };
    }

    return { codeToDeploy, usedFallback };
}