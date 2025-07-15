import { loadData, saveData } from '../storage.js';
import { refreshUndoRedoCounts } from '../ui.js';

export function handleInputChange(event, fieldName, defaultValue = '') {
    const id = parseInt(event.target.id.split('-')[1]);
    loadData((profiles, activeProfileId, archivedProfiles) => {
        const profile = profiles.find(p => p.id === id);
        profile[fieldName] = event.target.value.trim() || defaultValue;
        saveData(profiles, activeProfileId, archivedProfiles);
        // If the project path changes, we need to refresh the undo/redo counts
        if (fieldName === 'projectPath') {
            refreshUndoRedoCounts(profile);
        }
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

export function handleExcludeFocus(event) {
    const id = parseInt(event.target.id.split('-')[1]);
    const includeContainer = document.getElementById(`includeContainer-${id}`);
    if (includeContainer) {
        includeContainer.classList.remove('collapsed');
    }
}