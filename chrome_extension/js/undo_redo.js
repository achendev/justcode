import { refreshUndoRedoCounts } from './ui.js';
import { updateAndSaveMessage, updateTemporaryMessage } from './ui_handlers/message.js';

export async function undoCode(profile) {
    updateTemporaryMessage(profile.id, '');
    const path = profile.projectPath;
    if (!path) {
        updateAndSaveMessage(profile.id, 'Error: Project path is required for Undo.', 'error');
        return;
    }

    try {
        updateTemporaryMessage(profile.id, 'Undoing last action...');
        const serverUrl = profile.serverUrl.endsWith('/') ? profile.serverUrl.slice(0, -1) : profile.serverUrl;
        const tolerateErrors = profile.tolerateErrors !== false; // Default to true if undefined or null
        const endpoint = `${serverUrl}/undo?path=${encodeURIComponent(path)}&tolerateErrors=${tolerateErrors}`;

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
            throw new Error(`Undo failed: ${resultText}`);
        }

        refreshUndoRedoCounts(profile);
        updateAndSaveMessage(profile.id, 'Undo successful!', 'success');
        console.log('JustCode Undo Result:', resultText);

    } catch (error) {
        updateAndSaveMessage(profile.id, `Error: ${error.message.replace('Error: Undo failed: ', '')}`, 'error');
        console.error('JustCode Error:', error);
    }
}

export async function redoCode(profile) {
    updateTemporaryMessage(profile.id, '');
    const path = profile.projectPath;
    if (!path) {
        updateAndSaveMessage(profile.id, 'Error: Project path is required for Redo.', 'error');
        return;
    }

    try {
        updateTemporaryMessage(profile.id, 'Redoing last undo...');
        const serverUrl = profile.serverUrl.endsWith('/') ? profile.serverUrl.slice(0, -1) : profile.serverUrl;
        const tolerateErrors = profile.tolerateErrors !== false; // Default to true if undefined or null
        const endpoint = `${serverUrl}/redo?path=${encodeURIComponent(path)}&tolerateErrors=${tolerateErrors}`;

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
            throw new Error(`Redo failed: ${resultText}`);
        }

        refreshUndoRedoCounts(profile);
        updateAndSaveMessage(profile.id, 'Redo successful!', 'success');
        console.log('JustCode Redo Result:', resultText);

    } catch (error) {
        updateAndSaveMessage(profile.id, `Error: ${error.message.replace('Error: Redo failed: ', '')}`, 'error');
        console.error('JustCode Error:', error);
    }
}