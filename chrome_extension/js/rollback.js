import { refreshRollbackCount } from './ui.js';
import { updateAndSaveMessage, updateTemporaryMessage } from './ui_handlers/message.js';

export async function rollbackCode(profile) {
    updateTemporaryMessage(profile.id, '');
    const path = profile.projectPath;
    if (!path) {
        updateAndSaveMessage(profile.id, 'Error: Project path is required for rollback.', 'error');
        return;
    }

    try {
        updateTemporaryMessage(profile.id, 'Attempting rollback...');
        const serverUrl = profile.serverUrl.endsWith('/') ? profile.serverUrl.slice(0, -1) : profile.serverUrl;
        const endpoint = `${serverUrl}/rollback?path=${encodeURIComponent(path)}`;

        const headers = { 'Content-Type': 'text/plain' };
        if (profile.isAuthEnabled && profile.username) {
            headers['Authorization'] = 'Basic ' + btoa(`${profile.username}:${profile.password}`);
        }

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: headers
        });

        const resultText = await response.text();
        if (!response.ok) {
            throw new Error(`Rollback failed: ${resultText}`);
        }

        refreshRollbackCount(profile);
        updateAndSaveMessage(profile.id, 'Rollback successful!', 'success');
        console.log('JustCode Rollback Result:', resultText);

    } catch (error) {
        updateAndSaveMessage(profile.id, `Error: ${error.message.replace('Error: Rollback failed: ', '')}`, 'error');
        console.error('JustCode Error:', error);
    }
}