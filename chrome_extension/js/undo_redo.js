import { updateAndSaveMessage, updateTemporaryMessage } from './ui_handlers/message.js';
import { getHandle, verifyPermission } from './file_system_manager.js';
import { executeFileSystemScript } from './deploy_code/script_executor.js';
import { refreshUndoRedoCounts } from './ui.js';

// --- Common ---
async function moveBetweenStacks(profileId, fromStackType, toStackType) {
    const fromKey = `${fromStackType}_stack_${profileId}`;
    const toKey = `${toStackType}_stack_${profileId}`;

    const fromData = await chrome.storage.local.get(fromKey);
    const toData = await chrome.storage.local.get(toKey);

    const fromStack = fromData[fromKey] || [];
    const toStack = toData[toKey] || [];

    if (fromStack.length === 0) return null;

    const itemToMove = fromStack.pop();
    toStack.push(itemToMove);

    await chrome.storage.local.set({ 
        [fromKey]: fromStack.slice(-20),
        [toKey]: toStack.slice(-20) 
    });

    return itemToMove;
}

// --- JS Mode ---
async function undoCodeJs(profile) {
    const handle = await getHandle(profile.id);
    if (!handle || !(await verifyPermission(handle))) {
        updateAndSaveMessage(profile.id, 'Error: Project folder access is required for Undo.', 'error');
        return;
    }

    try {
        updateTemporaryMessage(profile.id, 'Undoing last action...');
        
        const actionToUndo = await moveBetweenStacks(profile.id, 'undo', 'redo');
        if (!actionToUndo) {
            updateAndSaveMessage(profile.id, 'No actions to undo.', 'info');
            return;
        }

        await executeFileSystemScript(handle, actionToUndo.undoScript, profile.tolerateErrors !== false);
        updateAndSaveMessage(profile.id, 'Undo successful!', 'success');

    } catch (error) {
        updateAndSaveMessage(profile.id, `Error during undo: ${error.message}`, 'error');
        console.error('JustCode Undo Error:', error);
        await moveBetweenStacks(profile.id, 'redo', 'undo'); // Attempt to move back
    }
}

async function redoCodeJs(profile) {
    const handle = await getHandle(profile.id);
    if (!handle || !(await verifyPermission(handle))) {
        updateAndSaveMessage(profile.id, 'Error: Project folder access is required for Redo.', 'error');
        return;
    }

    try {
        updateTemporaryMessage(profile.id, 'Redoing last undo...');
        
        const actionToRedo = await moveBetweenStacks(profile.id, 'redo', 'undo');
        if (!actionToRedo) {
            updateAndSaveMessage(profile.id, 'No actions to redo.', 'info');
            return;
        }
        
        await executeFileSystemScript(handle, actionToRedo.redoScript, profile.tolerateErrors !== false);
        updateAndSaveMessage(profile.id, 'Redo successful!', 'success');

    } catch (error) {
        updateAndSaveMessage(profile.id, `Error during redo: ${error.message}`, 'error');
        console.error('JustCode Redo Error:', error);
        await moveBetweenStacks(profile.id, 'undo', 'redo'); // Attempt to move back
    }
}

// --- Server Mode ---
async function undoCodeServer(profile) {
    if (!profile.projectPath) {
        updateAndSaveMessage(profile.id, 'Error: Project path is required for Undo.', 'error');
        return;
    }

    try {
        updateTemporaryMessage(profile.id, 'Undoing last action...');
        const serverUrl = profile.serverUrl.endsWith('/') ? profile.serverUrl.slice(0, -1) : profile.serverUrl;
        const tolerateErrors = profile.tolerateErrors !== false;
        const endpoint = `${serverUrl}/undo?path=${encodeURIComponent(profile.projectPath)}&tolerateErrors=${tolerateErrors}`;

        const headers = { 'Content-Type': 'text/plain' };
        if (profile.isAuthEnabled && profile.username) {
            headers['Authorization'] = 'Basic ' + btoa(`${profile.username}:${profile.password}`);
        }

        const response = await fetch(endpoint, { method: 'POST', headers: headers });
        const resultText = await response.text();
        if (!response.ok) throw new Error(`Undo failed: ${resultText}`);

        updateAndSaveMessage(profile.id, 'Undo successful!', 'success');

    } catch (error) {
        updateAndSaveMessage(profile.id, `Error: ${error.message.replace('Error: Undo failed: ', '')}`, 'error');
        console.error('JustCode Error:', error);
    }
}

async function redoCodeServer(profile) {
    if (!profile.projectPath) {
        updateAndSaveMessage(profile.id, 'Error: Project path is required for Redo.', 'error');
        return;
    }

    try {
        updateTemporaryMessage(profile.id, 'Redoing last undo...');
        const serverUrl = profile.serverUrl.endsWith('/') ? profile.serverUrl.slice(0, -1) : profile.serverUrl;
        const tolerateErrors = profile.tolerateErrors !== false;
        const endpoint = `${serverUrl}/redo?path=${encodeURIComponent(profile.projectPath)}&tolerateErrors=${tolerateErrors}`;

        const headers = { 'Content-Type': 'text/plain' };
        if (profile.isAuthEnabled && profile.username) {
            headers['Authorization'] = 'Basic ' + btoa(`${profile.username}:${profile.password}`);
        }

        const response = await fetch(endpoint, { method: 'POST', headers: headers });
        const resultText = await response.text();
        if (!response.ok) throw new Error(`Redo failed: ${resultText}`);

        updateAndSaveMessage(profile.id, 'Redo successful!', 'success');

    } catch (error) {
        updateAndSaveMessage(profile.id, `Error: ${error.message.replace('Error: Redo failed: ', '')}`, 'error');
        console.error('JustCode Error:', error);
    }
}

// --- Main Exported Functions ---

export async function undoCode(profile) {
    updateTemporaryMessage(profile.id, '');
    if (profile.useServerBackend) {
        await undoCodeServer(profile);
    } else {
        await undoCodeJs(profile);
    }
    refreshUndoRedoCounts(profile);
}

export async function redoCode(profile) {
    updateTemporaryMessage(profile.id, '');
    if (profile.useServerBackend) {
        await redoCodeServer(profile);
    } else {
        await redoCodeJs(profile);
    }
    refreshUndoRedoCounts(profile);
}