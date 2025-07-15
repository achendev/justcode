import { loadData, saveData } from './storage.js';
import { renderDOM, renderArchiveView } from './ui_handlers/renderer.js';
import { attachAllEventListeners } from './event_attacher.js';
import { handleAddProfile } from './ui_handlers/profile.js';

export async function refreshUndoRedoCounts(profile) {
    const undoBtn = document.querySelector(`.undo-code[data-id='${profile.id}']`);
    const redoBtn = document.querySelector(`.redo-code[data-id='${profile.id}']`);

    if (!profile || !profile.projectPath) {
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
            fetch(undoEndpoint, { method: 'GET', headers: headers }),
            fetch(redoEndpoint, { method: 'GET', headers: headers })
        ]);
        
        if (undoResponse.ok) {
            const text = await undoResponse.text();
            undoCount = parseInt(text, 10) || 0;
        } else {
            console.warn(`Failed to get undo count for ${profile.name}: ${undoResponse.status}`);
        }

        if (redoResponse.ok) {
            const text = await redoResponse.text();
            redoCount = parseInt(text, 10) || 0;
        } else {
            console.warn(`Failed to get redo count for ${profile.name}: ${redoResponse.status}`);
        }

    } catch (e) {
        console.error(`Error fetching undo/redo counts for ${profile.name}:`, e);
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


export function renderUI(profiles, activeProfileId, archivedProfiles, profilesContainer, profileTabs, archiveListContainer) {
    // 1. Render main DOM
    renderDOM(profiles, activeProfileId, profilesContainer, profileTabs);

    // 2. Render archive DOM
    renderArchiveView(archivedProfiles, archiveListContainer);

    // 3. Attach Listeners
    const reRenderCallback = (newProfiles, newActiveProfileId, newArchivedProfiles) => {
        renderUI(newProfiles, newActiveProfileId, newArchivedProfiles, profilesContainer, profileTabs, archiveListContainer);
    };
    attachAllEventListeners(reRenderCallback);

    // 4. Asynchronously fetch the latest counts for the active profile
    const activeProfile = profiles.find(p => p.id === activeProfileId);
    if (activeProfile) {
        refreshUndoRedoCounts(activeProfile);
    }
}

export function initUI(profilesContainer, profileTabs, addProfileButton, archiveListContainer) {
    const reRenderCallback = (profiles, activeProfileId, archivedProfiles) => {
        renderUI(profiles, activeProfileId, archivedProfiles, profilesContainer, profileTabs, archiveListContainer);
    };

    addProfileButton.addEventListener('click', () => {
        handleAddProfile(reRenderCallback);
    });

    // View switching logic
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