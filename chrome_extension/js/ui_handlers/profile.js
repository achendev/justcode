import { loadProfiles, saveProfiles } from '../storage.js';

export function handleAddProfile(reRenderCallback) {
    loadProfiles((profiles) => {
        const newProfile = {
            id: Date.now(),
            name: `Profile ${profiles.length + 1}`,
            projectPath: '',
            copyToClipboard: true,
            deployFromClipboard: false,
            excludePatterns: '.git/,venv/,.env,log/,logs/,tmp/',
            includePatterns: '',
            serverUrl: 'http://127.0.0.1:5010',
            isAuthEnabled: false,
            username: '',
            password: ''
        };
        profiles.push(newProfile);
        const newActiveProfileId = newProfile.id;
        saveProfiles(profiles, newActiveProfileId);
        reRenderCallback(profiles, newActiveProfileId);
    });
}

export function handleTabSwitch(event, reRenderCallback) {
    event.preventDefault();
    const id = parseInt(event.target.dataset.id);
    loadProfiles((profiles) => {
        saveProfiles(profiles, id);
        reRenderCallback(profiles, id);
    });
}

export function handleProfileNameChange(event, reRenderCallback) {
    const id = parseInt(event.target.dataset.id);
    loadProfiles((profiles, activeProfileId) => {
        const profile = profiles.find(p => p.id === id);
        profile.name = event.target.value.trim() || 'Unnamed';
        saveProfiles(profiles, activeProfileId);
        reRenderCallback(profiles, activeProfileId);
    });
}

export function handleDeleteProfile(event, errorDiv, reRenderCallback) {
    const id = parseInt(event.currentTarget.dataset.id);
    loadProfiles((profiles, activeProfileId) => {
        if (profiles.length <= 1) {
            errorDiv.textContent = 'Cannot delete the last profile.';
            return;
        }
        const updatedProfiles = profiles.filter(p => p.id !== id);
        const newActiveProfileId = activeProfileId === id ? updatedProfiles[0].id : activeProfileId;
        saveProfiles(updatedProfiles, newActiveProfileId);
        reRenderCallback(updatedProfiles, newActiveProfileId);
    });
}