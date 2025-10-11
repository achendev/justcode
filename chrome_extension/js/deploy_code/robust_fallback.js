import { extractCodeToDeploy } from './llm_code_extractor.js';
import { prepareForFullAnswerExtraction, revertFullAnswerExtraction } from './robust_fallback_handlers/aistudio.js';

// A simple regex to check for the presence of at least one valid command.
const VALID_COMMAND_REGEX = /^\s*(cat\s+>|mkdir|rm|rmdir|mv|touch|chmod)/m;

/**
 * Attempts to extract code to deploy, with a robust fallback to the full answer if the initial extraction fails.
 * This version includes a try...finally block to guarantee the UI state is reverted.
 * @param {object} profile - The active user profile.
 * @param {boolean} fromShortcut - Whether the call originated from a background shortcut.
 * @param {string|null} hostname - The hostname of the active tab.
 * @returns {Promise<{codeToDeploy: string|null, usedFallback: boolean}>}
 */
export async function extractCodeWithFallback(profile, fromShortcut = false, hostname = null) {
    let codeToDeploy = await extractCodeToDeploy(profile, fromShortcut, hostname);
    let usedFallback = false;

    const needsFallback = (await chrome.storage.local.get({ robustDeployFallback: true })).robustDeployFallback &&
                          profile.deployCodeSource === 'ui' &&
                          !profile.deployFromFullAnswer &&
                          (!codeToDeploy || !VALID_COMMAND_REGEX.test(codeToDeploy));

    if (needsFallback) {
        console.log("JustCode: Code block empty/invalid. Trying fallback to full answer.");
        usedFallback = true;
        
        const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        let stateChanged = false;

        // --- START OF THE FIX ---
        // This logic now guarantees the revert action is called.
        try {
            // Special handling for AI Studio
            if (tab && hostname && hostname.includes('aistudio.google.com')) {
                const results = await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    func: prepareForFullAnswerExtraction,
                });
                stateChanged = results[0]?.result || false;
                console.log(`JustCode: AI Studio state was changed by toggle: ${stateChanged}`);
            }
            
            // Now, extract from the full answer.
            const tempProfile = { ...profile, deployFromFullAnswer: true };
            codeToDeploy = await extractCodeToDeploy(tempProfile, fromShortcut, hostname);

        } finally {
            // This 'finally' block ensures that we ALWAYS try to revert the state if it was changed,
            // even if the 'extractCodeToDeploy' call above fails or returns nothing.
            if (tab && stateChanged && hostname && hostname.includes('aistudio.google.com')) {
                console.log("JustCode: Reverting AI Studio view state in 'finally' block.");
                await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    func: revertFullAnswerExtraction,
                });
            }
        }
        // --- END OF THE FIX ---
    }

    if (codeToDeploy && !VALID_COMMAND_REGEX.test(codeToDeploy)) {
        return { codeToDeploy: null, usedFallback };
    }

    return { codeToDeploy, usedFallback };
}