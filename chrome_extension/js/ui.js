import { loadData, saveData } from './storage.js';
import { renderDOM, renderArchiveView } from './ui_handlers/renderer.js';
import { attachAllEventListeners } from './event_attacher.js';
import { handleAddProfile } from './ui_handlers/profile.js';

export async function refreshRollbackCount(profile) {
    if (!profile || !profile.projectPath) {
        return; // Don't fetch if there's no path
    }
    const serverUrl = profile.serverUrl.endsWith('/') ? profile.serverUrl.slice(0, -1) : profile.serverUrl;
    const endpoint = `${serverUrl}/rollback?path=${encodeURIComponent(profile.projectPath)}`;
    let count = 0;
    try {
        const headers = {};
        if (profile.isAuthEnabled && profile.username) {
            headers['Authorization'] = 'Basic ' + btoa(`${profile.username}:${profile.password}`);
        }
        const response = await fetch(endpoint, { method: 'GET', headers: headers });
        if (response.ok) {
            const text = await response.text();
            count = parseInt(text, 10);
        } else {
            console.warn(`Failed to get rollback count for ${profile.name}: ${response.status}`);
        }
    } catch (e) {
        console.error(`Error fetching rollback count for ${profile.name}:`, e);
    }
    
    // Update the UI stack display
    const stackContainer = document.querySelector(`.rollback-stack-container[data-id='${profile.id}']`);
    if (stackContainer) {
        const items = stackContainer.querySelectorAll('.rollback-stack-item');
        items.forEach((item, i) => {
            if (i < count) {
                item.classList.add('available');
            } else {
                item.classList.remove('available');
            }
        });
    }

    // Update the count in storage
    loadData((profiles, activeProfileId, archivedProfiles) => {
        const p = profiles.find(p => p.id === profile.id);
        if (p) {
            p.rollbackCount = count;
            saveData(profiles, activeProfileId, archivedProfiles);
        }
    });
}

export function renderUI(profiles, activeProfileId, archivedProfiles, profilesContainer, profileTabs, archiveListContainer, errorDiv) {
    // 1. Render main DOM (uses cached rollback count initially)
    renderDOM(profiles, activeProfileId, profilesContainer, profileTabs);

    // 2. Render archive DOM
    renderArchiveView(archivedProfiles, archiveListContainer);

    // 3. Attach Listeners
    const reRenderCallback = (newProfiles, newActiveProfileId, newArchivedProfiles) => {
        renderUI(newProfiles, newActiveProfileId, newArchivedProfiles, profilesContainer, profileTabs, archiveListContainer, errorDiv);
    };
    attachAllEventListeners(reRenderCallback, errorDiv);

    // 4. Asynchronously fetch the latest rollback count for the active profile
    const activeProfile = profiles.find(p => p.id === activeProfileId);
    if (activeProfile) {
        refreshRollbackCount(activeProfile);
    }
}

export function initUI(profilesContainer, profileTabs, addProfileButton, archiveListContainer, errorDiv) {
    const reRenderCallback = (profiles, activeProfileId, archivedProfiles) => {
        renderUI(profiles, activeProfileId, archivedProfiles, profilesContainer, profileTabs, archiveListContainer, errorDiv);
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
        renderUI(profiles, activeProfileId, archivedProfiles, profilesContainer, profileTabs, archiveListContainer, errorDiv);
    });
}