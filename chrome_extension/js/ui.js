import { loadData } from './storage.js';
import { renderDOM, renderArchiveView } from './ui_handlers/renderer.js';
import { attachAllEventListeners } from './event_attacher.js';
import { handleAddProfile } from './ui_handlers/profile.js';
import { getHandle, verifyPermission } from './file_system_manager.js';

async function refreshUndoRedoCountsJs(profile) {
    const undoBtn = document.querySelector(`.undo-code[data-id='${profile.id}']`);
    const redoBtn = document.querySelector(`.redo-code[data-id='${profile.id}']`);
    if (!undoBtn || !redoBtn) return;

    try {
        const undoKey = `undo_stack_${profile.id}`;
        const redoKey = `redo_stack_${profile.id}`;

        const [undoData, redoData] = await Promise.all([
            chrome.storage.local.get(undoKey),
            chrome.storage.local.get(redoKey)
        ]);

        const undoStack = undoData[undoKey] || [];
        const redoStack = redoData[redoKey] || [];

        undoBtn.disabled = undoStack.length === 0;
        redoBtn.disabled = redoStack.length === 0;
        undoBtn.title = `Undo (${undoStack.length} available)`;
        redoBtn.title = `Redo (${redoStack.length} available)`;

    } catch (e) {
        console.error("Could not refresh JS undo/redo counts", e);
        undoBtn.disabled = true;
        redoBtn.disabled = true;
    }
}

async function refreshUndoRedoCountsServer(profile) {
    const undoBtn = document.querySelector(`.undo-code[data-id='${profile.id}']`);
    const redoBtn = document.querySelector(`.redo-code[data-id='${profile.id}']`);

    if (!profile.projectPath) {
        if (undoBtn) undoBtn.disabled = true;
        if (redoBtn) redoBtn.disabled = true;
        return;
    }
    
    const serverUrl = profile.serverUrl.endsWith('/') ? profile.serverUrl.slice(0, -1) : profile.serverUrl;
    const undoEndpoint = `${serverUrl}/undo?path=${encodeURIComponent(profile.projectPath)}`;
    const redoEndpoint = `${serverUrl}/redo?path=${encodeURIComponent(profile.projectPath)}`;
    
    let undoCount = 0;
    let redoCount = 0;

    try {
        const headers = {};
        if (profile.isAuthEnabled && profile.username) {
            headers['Authorization'] = 'Basic ' + btoa(`${profile.username}:${profile.password}`);
        }
        
        const [undoResponse, redoResponse] = await Promise.all([
            fetch(undoEndpoint, { method: 'GET', headers: headers }).catch(() => null),
            fetch(redoEndpoint, { method: 'GET', headers: headers }).catch(() => null)
        ]);
        
        if (undoResponse && undoResponse.ok) undoCount = parseInt(await undoResponse.text(), 10) || 0;
        if (redoResponse && redoResponse.ok) redoCount = parseInt(await redoResponse.text(), 10) || 0;

    } catch (e) {
        console.error(`Error fetching server undo/redo counts for ${profile.name}:`, e);
    }
    
    if (undoBtn) {
        undoBtn.disabled = undoCount === 0;
        undoBtn.title = `Undo (${undoCount} available)`;
    }
    if (redoBtn) {
        redoBtn.disabled = redoCount === 0;
        redoBtn.title = `Redo (${redoCount} available)`;
    }
}

export async function refreshUndoRedoCounts(profile) {
    if (profile.useServerBackend) {
        await refreshUndoRedoCountsServer(profile);
    } else {
        await refreshUndoRedoCountsJs(profile);
    }
}


export function updateFolderName(profileId, folderName) {
    const nameSpan = document.getElementById(`selectedProjectName-${profileId}`);
    const forgetBtn = document.getElementById(`forgetProjectFolder-${profileId}`);
    if (nameSpan) {
        if (folderName) {
            nameSpan.textContent = folderName;
            if (forgetBtn) forgetBtn.style.display = 'inline-block';
        } else {
            nameSpan.textContent = 'No Folder Selected';
            if (forgetBtn) forgetBtn.style.display = 'none';
        }
    }
}

export function renderUI(profiles, activeProfileId, archivedProfiles, profilesContainer, profileTabs, archiveListContainer) {
    renderDOM(profiles, activeProfileId, profilesContainer, profileTabs);
    renderArchiveView(archivedProfiles, archiveListContainer);

    const reRenderCallback = (newProfiles, newActiveProfileId, newArchivedProfiles) => {
        renderUI(newProfiles, newActiveProfileId, newArchivedProfiles, profilesContainer, profileTabs, archiveListContainer);
    };
    attachAllEventListeners(reRenderCallback);
    
    profiles.forEach(async (profile) => {
        if (!profile.useServerBackend) {
            const handle = await getHandle(profile.id);
            if (handle) {
                 const hasPermission = await verifyPermission(handle);
                 updateFolderName(profile.id, hasPermission ? handle.name : `(Permission lost) ${handle.name}`);
            } else {
                updateFolderName(profile.id, null);
            }
        }
        refreshUndoRedoCounts(profile);
    });
}

export function initUI(profilesContainer, profileTabs, addProfileButton, archiveListContainer) {
    const reRenderCallback = (profiles, activeProfileId, archivedProfiles) => {
        renderUI(profiles, activeProfileId, archivedProfiles, profilesContainer, profileTabs, archiveListContainer);
    };

    addProfileButton.addEventListener('click', () => {
        handleAddProfile(reRenderCallback);
    });

    const mainView = document.getElementById('mainView');
    const archiveView = document.getElementById('archiveView');
    const archiveButton = document.getElementById('archiveButton');
    const closeArchiveButton = document.getElementById('closeArchive');

    archiveButton.addEventListener('click', () => {
        mainView.style.display = 'none';
        archiveView.style.display = 'block';
    });

    closeArchiveButton.addEventListener('click', () => {
        mainView.style.display = 'block';
        archiveView.style.display = 'none';
    });

    loadData((profiles, activeProfileId, archivedProfiles) => {
        renderUI(profiles, activeProfileId, archivedProfiles, profilesContainer, profileTabs, archiveListContainer);
    });
}