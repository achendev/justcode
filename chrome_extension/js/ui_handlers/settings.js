import { loadData, saveData } from '../storage.js';

export function handleOpenSettingsClick(event) {
    const id = parseInt(event.currentTarget.dataset.id);
    const profileCard = document.getElementById(`profile-${id}`);
    if (profileCard) {
        profileCard.querySelector('.profile-main-view').style.display = 'none';
        profileCard.querySelector('.profile-settings-view').style.display = 'block';
    }
}

export function handleCloseSettingsClick(event) {
    const id = parseInt(event.currentTarget.dataset.id);
    const profileCard = document.getElementById(`profile-${id}`);
    if (profileCard) {
        profileCard.querySelector('.profile-main-view').style.display = 'block';
        profileCard.querySelector('.profile-settings-view').style.display = 'none';
    }
}

export function handleServerUrlChange(event) {
    const id = parseInt(event.target.id.split('-')[1]);
    loadData((profiles, activeProfileId, archivedProfiles) => {
        const profile = profiles.find(p => p.id === id);
        if (profile) {
            let newUrl = event.target.value.trim();
            if (newUrl.endsWith('/')) {
                newUrl = newUrl.slice(0, -1);
            }
            profile.serverUrl = newUrl || 'http://127.0.0.1:5010'; // Default if empty
            saveData(profiles, activeProfileId, archivedProfiles);
        }
    });
}

export function handleCustomInstructionsToggle(event) {
    const id = parseInt(event.target.dataset.id);
    const isChecked = event.target.checked;
    
    const profileCard = document.getElementById(`profile-${id}`);
    const textarea = profileCard.querySelector('.critical-instructions');
    if (textarea) {
        textarea.disabled = !isChecked;
    }

    loadData((profiles, activeProfileId, archivedProfiles) => {
        const profile = profiles.find(p => p.id === id);
        if (profile) {
            profile.isCriticalInstructionsEnabled = isChecked;
            saveData(profiles, activeProfileId, archivedProfiles);
        }
    });
}

export function handleBackendToggle(event, reRenderCallback) {
    const id = parseInt(event.target.dataset.id);
    const useServerBackend = event.target.checked;
    
    loadData((profiles, activeProfileId, archivedProfiles) => {
        const profile = profiles.find(p => p.id === id);
        if (profile) {
            profile.useServerBackend = useServerBackend;
            saveData(profiles, activeProfileId, archivedProfiles);
            // Re-render to show/hide the correct UI elements
            reRenderCallback(profiles, activeProfileId, archivedProfiles);
        }
    });
}