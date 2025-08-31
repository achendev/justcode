import { extractCodeWithFallback } from './robust_fallback.js';

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
    
    const { codeToDeploy, usedFallback } = await extractCodeWithFallback(profile, fromShortcut, hostname);

    if (!codeToDeploy) {
        throw new Error('No valid deploy script found on page or in clipboard.');
    }

    const serverUrl = profile.serverUrl.endsWith('/') ? profile.serverUrl.slice(0, -1) : profile.serverUrl;
    const tolerateErrors = profile.tolerateErrors !== false;
    
    const settings = await chrome.storage.local.get({ showVerboseDeployLog: true, hideErrorsOnSuccess: true });
    
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