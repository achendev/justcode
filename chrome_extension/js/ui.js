import { loadProfiles } from './storage.js';
import { renderDOM } from './ui_handlers/renderer.js';
import { attachAllEventListeners } from './event_attacher.js';
import { handleAddProfile } from './ui_handlers/profile.js';

export function renderProfiles(profiles, activeProfileId, profilesContainer, profileTabs, errorDiv) {
    // 1. Render HTML from pure function
    renderDOM(profiles, activeProfileId, profilesContainer, profileTabs);

    // 2. Attach Listeners
    const reRenderCallback = (newProfiles, newActiveProfileId) => {
        renderProfiles(newProfiles, newActiveProfileId, profilesContainer, profileTabs, errorDiv);
    };
    attachAllEventListeners(reRenderCallback, errorDiv);
}

export function initUI(profilesContainer, profileTabs, addProfileButton, errorDiv) {
    const reRenderCallback = (profiles, activeProfileId) => {
        renderProfiles(profiles, activeProfileId, profilesContainer, profileTabs, errorDiv);
    };

    addProfileButton.addEventListener('click', () => {
        handleAddProfile(reRenderCallback);
    });

    loadProfiles((profiles, activeProfileId) => {
        renderProfiles(profiles, activeProfileId, profilesContainer, profileTabs, errorDiv);
    });
}