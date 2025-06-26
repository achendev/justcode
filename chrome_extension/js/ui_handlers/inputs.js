import { loadProfiles, saveProfiles } from '../storage.js';

export function handleInputChange(event, fieldName, defaultValue = '') {
    const id = parseInt(event.target.id.split('-')[1]);
    loadProfiles((profiles, activeProfileId) => {
        const profile = profiles.find(p => p.id === id);
        profile[fieldName] = event.target.value.trim() || defaultValue;
        saveProfiles(profiles, activeProfileId);
    });
}

export function handleCheckboxChange(event, fieldName) {
    const id = parseInt(event.target.id.split('-')[1]);
    loadProfiles((profiles, activeProfileId) => {
        const profile = profiles.find(p => p.id === id);
        profile[fieldName] = event.target.checked;
        saveProfiles(profiles, activeProfileId);
    });
}