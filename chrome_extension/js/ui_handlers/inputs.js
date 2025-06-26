import { loadData, saveData } from '../storage.js';

export function handleInputChange(event, fieldName, defaultValue = '') {
    const id = parseInt(event.target.id.split('-')[1]);
    loadData((profiles, activeProfileId, archivedProfiles) => {
        const profile = profiles.find(p => p.id === id);
        profile[fieldName] = event.target.value.trim() || defaultValue;
        saveData(profiles, activeProfileId, archivedProfiles);
    });
}

export function handleCheckboxChange(event, fieldName) {
    const id = parseInt(event.target.id.split('-')[1]);
    loadData((profiles, activeProfileId, archivedProfiles) => {
        const profile = profiles.find(p => p.id === id);
        profile[fieldName] = event.target.checked;
        saveData(profiles, activeProfileId, archivedProfiles);
    });
}