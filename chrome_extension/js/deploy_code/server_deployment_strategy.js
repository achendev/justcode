import { hereDocValue } from '../default_instructions.js';
import { extractCodeToDeploy } from './llm_code_extractor.js';

/**
 * Handles the deployment process for the server backend.
 * @param {object} profile - The active user profile.
 */
export async function handleServerDeployment(profile) {
    const isDetached = new URLSearchParams(window.location.search).get('view') === 'window';
    const path = profile.projectPath;
    if (!path) {
        throw new Error('Please enter a project path.');
    }
    
    const codeToDeploy = await extractCodeToDeploy(profile, isDetached);

    if (!codeToDeploy || !codeToDeploy.includes(hereDocValue)) {
        throw new Error('No valid deploy script found on page or in clipboard.');
    }

    const serverUrl = profile.serverUrl.endsWith('/') ? profile.serverUrl.slice(0, -1) : profile.serverUrl;
    const tolerateErrors = profile.tolerateErrors !== false;
    const endpoint = `${serverUrl}/deploycode?path=${encodeURIComponent(path)}&tolerateErrors=${tolerateErrors}`;

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
}