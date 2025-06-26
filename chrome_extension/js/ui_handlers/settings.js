import { loadProfiles, saveProfiles } from '../storage.js';

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
    loadProfiles((profiles, activeProfileId) => {
        const profile = profiles.find(p => p.id === id);
        let newUrl = event.target.value.trim();
        if (newUrl.endsWith('/')) {
            newUrl = newUrl.slice(0, -1);
        }
        profile.serverUrl = newUrl || 'http://127.0.0.1:5010'; // Default if empty
        saveProfiles(profiles, activeProfileId);
    });
}