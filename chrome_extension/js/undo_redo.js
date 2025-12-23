import { updateAndSaveMessage, updateTemporaryMessage } from './ui_handlers/message.js';
import { getHandles, verifyPermission } from './file_system_manager.js';
import { executeFileSystemScript } from './deploy_code/script_executor.js';
import { refreshUndoRedoCounts } from './ui.js';
import { handleServerError } from './ui_handlers/server_error_handler.js';

// --- Helper Functions ---
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

// --- Strategy-Specific Handlers ---
async function handleJsStackAction(profile, fromShortcut, action) {
    const folderCount = (profile.jsProjectFolderNames || []).length || 1;
    const handles = await getHandles(profile.id, folderCount);
    const validHandles = handles.filter(Boolean);
    const actionName = action.name.charAt(0).toUpperCase() + action.name.slice(1);

    if (validHandles.length === 0) {
        const msg = { text: `Error: Project folder access is required for ${actionName}.`, type: 'error' };
        if (!fromShortcut) updateAndSaveMessage(profile.id, msg.text, msg.type);
        return msg;
    }
    if (validHandles.length > 1 && !profile.useNumericPrefixesForMultiProject) {
        const handleNames = validHandles.map(h => h.name);
        if (new Set(handleNames).size !== handleNames.length) {
            const msg = { text: 'Error: Multiple project folders have the same name. Enable "Name by order number" in profile settings.', type: 'error' };
            if (!fromShortcut) updateAndSaveMessage(profile.id, msg.text, msg.type);
            return msg;
        }
    }

    for (const handle of validHandles) {
        if (!(await verifyPermission(handle))) {
            const msg = { text: `Error: Permission to folder '${handle.name}' lost.`, type: 'error' };
            if (!fromShortcut) updateAndSaveMessage(profile.id, msg.text, msg.type);
            return msg;
        }
    }

    try {
        if (!fromShortcut) updateTemporaryMessage(profile.id, action.progressMessage);
        
        const item = await moveBetweenStacks(profile.id, action.fromStack, action.toStack);
        if (!item) {
            const msg = { text: action.emptyMessage, type: 'info' };
            if (!fromShortcut) updateAndSaveMessage(profile.id, msg.text, msg.type);
            return msg;
        }

        const scriptToRun = action.name === 'undo' ? item.undoScript : item.redoScript;
        await executeFileSystemScript(validHandles, scriptToRun, profile);
        
        const msg = { text: action.successMessage, type: 'success' };
        if (!fromShortcut) updateAndSaveMessage(profile.id, msg.text, msg.type);
        return msg;

    } catch (error) {
        console.error(`JustCode ${actionName} Error:`, error);
        await moveBetweenStacks(profile.id, action.toStack, action.fromStack); // Attempt to move back
        const msg = { text: `Error during ${action.name}: ${error.message}`, type: 'error' };
        if (!fromShortcut) updateAndSaveMessage(profile.id, msg.text, msg.type);
        return msg;
    }
}

async function handleServerStackAction(profile, fromShortcut, action) {
    const actionName = action.name.charAt(0).toUpperCase() + action.name.slice(1);

    const paths = profile.projectPaths;
    if (!paths || paths.length === 0 || !paths.some(p => p && p.trim())) {
        const msg = { text: `Error: Project path is required for ${actionName}.`, type: 'error' };
        if (!fromShortcut) updateAndSaveMessage(profile.id, msg.text, msg.type);
        return msg;
    }

    try {
        if (!fromShortcut) updateTemporaryMessage(profile.id, action.progressMessage);
        
        const serverUrl = profile.serverUrl.endsWith('/') ? profile.serverUrl.slice(0, -1) : profile.serverUrl;
        const tolerateErrors = profile.tolerateErrors !== false;
        const pathParams = paths.map(p => `path=${encodeURIComponent(p)}`).join('&');
        let endpoint = `${serverUrl}/${action.name}?${pathParams}&tolerateErrors=${tolerateErrors}`;

        if (profile.useNumericPrefixesForMultiProject) {
            endpoint += `&useNumericPrefixes=true`;
        }
        endpoint += `&addEmptyLine=${profile.addEmptyLineOnDeploy !== false}`;

        const headers = { 'Content-Type': 'text/plain' };
        if (profile.isAuthEnabled && profile.username) {
            headers['Authorization'] = 'Basic ' + btoa(`${profile.username}:${profile.password}`);
        }

        const response = await fetch(endpoint, { method: 'POST', headers: headers });
        const resultText = await response.text();
        if (!response.ok) throw new Error(`${actionName} failed: ${resultText}`);

        const msg = { text: action.successMessage, type: 'success' };
        if (!fromShortcut) updateAndSaveMessage(profile.id, msg.text, msg.type);
        return msg;

    } catch (error) {
        console.error(`JustCode ${actionName} Error:`, error);
        const messageText = handleServerError(error, true);
        const msg = { text: messageText, type: 'error' };
        if (!fromShortcut) updateAndSaveMessage(profile.id, msg.text, msg.type);
        return msg;
    }
}

// --- Main Exported Functions ---
async function handleUndoRedo(profile, fromShortcut, action) {
    if (!fromShortcut) updateTemporaryMessage(profile.id, '');

    const handler = profile.useServerBackend ? handleServerStackAction : handleJsStackAction;
    const result = await handler(profile, fromShortcut, action);

    if (typeof document !== 'undefined') {
        refreshUndoRedoCounts(profile);
    }
    return result;
}

export function undoCode(profile, fromShortcut = false) {
    return handleUndoRedo(profile, fromShortcut, {
        name: 'undo',
        fromStack: 'undo',
        toStack: 'redo',
        progressMessage: 'Undoing last action...',
        successMessage: 'Undo successful!',
        emptyMessage: 'No actions to undo.'
    });
}

export function redoCode(profile, fromShortcut = false) {
    return handleUndoRedo(profile, fromShortcut, {
        name: 'redo',
        fromStack: 'redo',
        toStack: 'undo',
        progressMessage: 'Redoing last undo...',
        successMessage: 'Redo successful!',
        emptyMessage: 'No actions to redo.'
    });
}