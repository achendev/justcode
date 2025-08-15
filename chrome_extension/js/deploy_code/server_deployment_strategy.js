import { extractCodeToDeploy } from './llm_code_extractor.js';

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
    
    const codeToDeploy = await extractCodeToDeploy(profile, fromShortcut, hostname);

    if (!codeToDeploy || !VALID_COMMAND_REGEX.test(codeToDeploy)) {
        throw new Error('No valid deploy script found on page or in clipboard.');
    }

    const serverUrl = profile.serverUrl.endsWith('/') ? profile.serverUrl.slice(0, -1) : profile.serverUrl;
    const tolerateErrors = profile.tolerateErrors !== false;
    
    const settings = await chrome.storage.local.get({ showVerboseDeployLog: true });
    
    let endpoint = `${serverUrl}/deploycode?path=${encodeURIComponent(path)}&tolerateErrors=${tolerateErrors}&verbose=${settings.showVerboseDeployLog}`;
    
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

    const resultText = await response.text();
    if (!response.ok) {
        throw new Error(`Deploy failed: ${resultText}`);
    }
    
    console.log('JustCode Deploy Result:', resultText);
    return resultText;
}