import { extractCodeToDeploy } from './llm_code_extractor.js';
import { prepareForFullAnswerExtraction, revertFullAnswerExtraction } from './robust_fallback_handlers/aistudio.js';

// A simple regex to check for the presence of at least one valid command.
const VALID_COMMAND_REGEX = /^\s*(cat\s+>|mkdir|rm|rmdir|mv|touch|chmod)/m;

/**
 * Handles the deployment process for the server backend.
 * @param {object} profile - The active user profile.
 * @param {boolean} fromShortcut - Whether the call originated from a background shortcut.
 * @param {string|null} hostname - The hostname of the active tab.
 * @returns {Promise<string>} A status message upon completion.
 */
export async function handleServerDeployment(profile, fromShortcut = false, hostname = null) {
    const path = profile.projectPath;
    if (!path) {
        throw new Error('Please enter a project path.');
    }
    
    const appSettings = await chrome.storage.local.get({ robustDeployFallback: true });
    let codeToDeploy = await extractCodeToDeploy(profile, fromShortcut, hostname);
    let usedFallback = false;

    if (
        appSettings.robustDeployFallback &&
        profile.deployCodeSource === 'ui' &&
        !profile.deployFromFullAnswer &&
        (!codeToDeploy || !VALID_COMMAND_REGEX.test(codeToDeploy))
    ) {
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


    if (!codeToDeploy || !VALID_COMMAND_REGEX.test(codeToDeploy)) {
        throw new Error('No valid deploy script found on page or in clipboard.');
    }

    const serverUrl = profile.serverUrl.endsWith('/') ? profile.serverUrl.slice(0, -1) : profile.serverUrl;
    const tolerateErrors = profile.tolerateErrors !== false;
    
    const settings = await chrome.storage.local.get({ showVerboseDeployLog: true, hideErrorsOnSuccess: false });
    
    let endpoint = `${serverUrl}/deploycode?path=${encodeURIComponent(path)}&tolerateErrors=${tolerateErrors}&verbose=${settings.showVerboseDeployLog}&hideErrorsOnSuccess=${settings.hideErrorsOnSuccess}`;
    
    if (profile.runScriptOnDeploy && profile.postDeployScript) {
        endpoint += `&runScript=true&scriptToRun=${encodeURIComponent(profile.postDeployScript)}`;
    }

    const headers = { 'Content-Type': 'text/plain' };
    if (profile.isAuthEnabled && profile.username) {
        headers['Authorization'] = 'Basic ' + btoa(`${profile.username}:${profile.password}`);
    }

    const response = await fetch(endpoint, {
        method: 'POST',
        headers: headers,
        body: codeToDeploy
    });

    let resultText = await response.text();
    if (!response.ok) {
        throw new Error(`Deploy failed: ${resultText}`);
    }
    
    if (usedFallback) {
        resultText = "Used robust deploy fallback. " + resultText;
    }

    console.log('JustCode Deploy Result:', resultText);
    return resultText;
}