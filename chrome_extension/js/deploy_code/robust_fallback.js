import { extractCodeToDeploy } from './llm_code_extractor.js';
import { prepareForFullAnswerExtraction, revertFullAnswerExtraction } from './robust_fallback_handlers/aistudio.js';

// A simple regex to check for the presence of at least one valid command.
const VALID_COMMAND_REGEX = /^\s*(cat\s+>|mkdir|rm|rmdir|mv|touch|chmod)/m;

/**
 * Attempts to extract code to deploy, with a robust fallback to the full answer if the initial extraction fails.
 * @param {object} profile - The active user profile.
 * @param {boolean} fromShortcut - Whether the call originated from a background shortcut.
 * @param {string|null} hostname - The hostname of the active tab.
 * @returns {Promise<{codeToDeploy: string|null, usedFallback: boolean}>}
 */
export async function extractCodeWithFallback(profile, fromShortcut, hostname) {
    const appSettings = await chrome.storage.local.get({ robustDeployFallback: true });
    let codeToDeploy = await extractCodeToDeploy(profile, fromShortcut, hostname);
    let usedFallback = false;

    const needsFallback = appSettings.robustDeployFallback &&
                          profile.deployCodeSource === 'ui' &&
                          !profile.deployFromFullAnswer &&
                          (!codeToDeploy || !VALID_COMMAND_REGEX.test(codeToDeploy));

    if (needsFallback) {
        console.log("JustCode: Code block empty/invalid. Trying fallback to full answer.");
        usedFallback = true;
        
        let stateChanged = false;
        const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });

        // Special handling for AI Studio
        if (tab && hostname && hostname.includes('aistudio.google.com')) {
            const results = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: prepareForFullAnswerExtraction,
            });
            stateChanged = results[0]?.result || false;
        }
        
        // Now extract from the full answer
        const tempProfile = { ...profile, deployFromFullAnswer: true };
        codeToDeploy = await extractCodeToDeploy(tempProfile, fromShortcut, hostname);
        
        // Revert the state if we changed it
        if (tab && stateChanged) {
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: revertFullAnswerExtraction,
            });
        }
    }

    if (codeToDeploy && !VALID_COMMAND_REGEX.test(codeToDeploy)) {
        return { codeToDeploy: null, usedFallback };
    }

    return { codeToDeploy, usedFallback };
}