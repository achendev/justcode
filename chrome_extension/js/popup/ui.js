import { initUI as initMainUI, renderUI } from '../ui.js';
import { loadData } from '../storage.js';

export function initializeUI() {
    const profilesContainer = document.getElementById('profilesContainer');
    const profileTabs = document.getElementById('profileTabs');
    const addProfileButton = document.getElementById('addProfile');
    const archiveListContainer = document.getElementById('archiveListContainer');

    const reRender = () => {
        loadData((profiles, activeProfileId, archivedProfiles) => {
            renderUI(profiles, activeProfileId, archivedProfiles, profilesContainer, profileTabs, archiveListContainer);
        });
    };

    initMainUI(profilesContainer, profileTabs, addProfileButton, archiveListContainer);
    
    return reRender;
}