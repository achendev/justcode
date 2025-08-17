import { updateAndSaveMessage, updateTemporaryMessage } from './ui_handlers/message.js';
import { getHandle, verifyPermission } from './file_system_manager.js';
import { executeFileSystemScript } from './deploy_code/script_executor.js';
import { refreshUndoRedoCounts } from './ui.js';
import { handleServerError } from './ui_handlers/server_error_handler.js';

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
async function undoCodeJs(profile, fromShortcut) {
    const handle = await getHandle(profile.id);
    if (!handle || !(await verifyPermission(handle))) {
        const msg = { text: 'Error: Project folder access is required for Undo.', type: 'error' };
        if (!fromShortcut) updateAndSaveMessage(profile.id, msg.text, msg.type);
        return msg;
    }

    try {
        if (!fromShortcut) updateTemporaryMessage(profile.id, 'Undoing last action...');
        
        const actionToUndo = await moveBetweenStacks(profile.id, 'undo', 'redo');
        if (!actionToUndo) {
            const msg = { text: 'No actions to undo.', type: 'info' };
            if (!fromShortcut) updateAndSaveMessage(profile.id, msg.text, msg.type);
            return msg;
        }

        await executeFileSystemScript(handle, actionToUndo.undoScript, profile.tolerateErrors !== false);
        const msg = { text: 'Undo successful!', type: 'success' };
        if (!fromShortcut) updateAndSaveMessage(profile.id, msg.text, msg.type);
        return msg;

    } catch (error) {
        console.error('JustCode Undo Error:', error);
        await moveBetweenStacks(profile.id, 'redo', 'undo'); // Attempt to move back
        const msg = { text: `Error during undo: ${error.message}`, type: 'error' };
        if (!fromShortcut) updateAndSaveMessage(profile.id, msg.text, msg.type);
        return msg;
    }
}

async function redoCodeJs(profile, fromShortcut) {
    const handle = await getHandle(profile.id);
    if (!handle || !(await verifyPermission(handle))) {
        const msg = { text: 'Error: Project folder access is required for Redo.', type: 'error' };
        if (!fromShortcut) updateAndSaveMessage(profile.id, msg.text, msg.type);
        return msg;
    }

    try {
        if (!fromShortcut) updateTemporaryMessage(profile.id, 'Redoing last undo...');
        
        const actionToRedo = await moveBetweenStacks(profile.id, 'redo', 'undo');
        if (!actionToRedo) {
            const msg = { text: 'No actions to redo.', type: 'info' };
            if (!fromShortcut) updateAndSaveMessage(profile.id, msg.text, msg.type);
            return msg;
        }
        
        await executeFileSystemScript(handle, actionToRedo.redoScript, profile.tolerateErrors !== false);
        const msg = { text: 'Redo successful!', type: 'success' };
        if (!fromShortcut) updateAndSaveMessage(profile.id, msg.text, msg.type);
        return msg;

    } catch (error) {
        console.error('JustCode Redo Error:', error);
        await moveBetweenStacks(profile.id, 'undo', 'redo'); // Attempt to move back
        const msg = { text: `Error during redo: ${error.message}`, type: 'error' };
        if (!fromShortcut) updateAndSaveMessage(profile.id, msg.text, msg.type);
        return msg;
    }
}

// --- Server Mode ---
async function undoCodeServer(profile, fromShortcut) {
    if (!profile.projectPath) {
        const msg = { text: 'Error: Project path is required for Undo.', type: 'error' };
        if (!fromShortcut) updateAndSaveMessage(profile.id, msg.text, msg.type);
        return msg;
    }

    try {
        if (!fromShortcut) updateTemporaryMessage(profile.id, 'Undoing last action...');
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

        const msg = { text: 'Undo successful!', type: 'success' };
        if (!fromShortcut) updateAndSaveMessage(profile.id, msg.text, msg.type);
        return msg;

    } catch (error) {
        console.error('JustCode Error:', error);
        const messageText = handleServerError(error, true);
        const msg = { text: messageText, type: 'error' };
        if (!fromShortcut) updateAndSaveMessage(profile.id, msg.text, msg.type);
        return msg;
    }
}

async function redoCodeServer(profile, fromShortcut) {
    if (!profile.projectPath) {
        const msg = { text: 'Error: Project path is required for Redo.', type: 'error' };
        if (!fromShortcut) updateAndSaveMessage(profile.id, msg.text, msg.type);
        return msg;
    }

    try {
        if (!fromShortcut) updateTemporaryMessage(profile.id, 'Redoing last undo...');
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

        const msg = { text: 'Redo successful!', type: 'success' };
        if (!fromShortcut) updateAndSaveMessage(profile.id, msg.text, msg.type);
        return msg;

    } catch (error) {
        console.error('JustCode Error:', error);
        const messageText = handleServerError(error, true);
        const msg = { text: messageText, type: 'error' };
        if (!fromShortcut) updateAndSaveMessage(profile.id, msg.text, msg.type);
        return msg;
    }
}

// --- Main Exported Functions ---

export async function undoCode(profile, fromShortcut = false) {
    let result;
    if (!fromShortcut) updateTemporaryMessage(profile.id, '');

    if (profile.useServerBackend) {
        result = await undoCodeServer(profile, fromShortcut);
    } else {
        result = await undoCodeJs(profile, fromShortcut);
    }
    
    if (typeof document !== 'undefined') { // Only refresh UI if in a document context
        refreshUndoRedoCounts(profile);
    }
    return result;
}

export async function redoCode(profile, fromShortcut = false) {
    let result;
    if (!fromShortcut) updateTemporaryMessage(profile.id, '');

    if (profile.useServerBackend) {
        result = await redoCodeServer(profile, fromShortcut);
    } else {
        result = await redoCodeJs(profile, fromShortcut);
    }
    
    if (typeof document !== 'undefined') { // Only refresh UI if in a document context
        refreshUndoRedoCounts(profile);
    }
    return result;
}