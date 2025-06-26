import { loadData } from './storage.js';
import { renderDOM, renderArchiveView } from './ui_handlers/renderer.js';
import { attachAllEventListeners } from './event_attacher.js';
import { handleAddProfile } from './ui_handlers/profile.js';

export function renderUI(profiles, activeProfileId, archivedProfiles, profilesContainer, profileTabs, archiveListContainer, errorDiv) {
    // 1. Render main DOM
    renderDOM(profiles, activeProfileId, profilesContainer, profileTabs);

    // 2. Render archive DOM
    renderArchiveView(archivedProfiles, archiveListContainer);

    // 3. Attach Listeners
    const reRenderCallback = (newProfiles, newActiveProfileId, newArchivedProfiles) => {
        renderUI(newProfiles, newActiveProfileId, newArchivedProfiles, profilesContainer, profileTabs, archiveListContainer, errorDiv);
    };
    attachAllEventListeners(reRenderCallback, errorDiv);
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