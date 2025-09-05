import { loadData, saveData } from '../storage.js';
import { refreshUndoRedoCounts } from '../ui.js';

export function handleInputChange(event, fieldName, defaultValue = '') {
    const id = parseInt(event.target.id.split('-')[1]);
    loadData((profiles, activeProfileId, archivedProfiles) => {
        const profile = profiles.find(p => p.id === id);
        if (profile) {
            profile[fieldName] = event.target.value.trim() || defaultValue;
            saveData(profiles, activeProfileId, archivedProfiles);
        }
    });
}

export function handleProjectPathChange(event) {
    const id = parseInt(event.target.dataset.id);
    const index = parseInt(event.target.dataset.index);
    const newValue = event.target.value.trim();

    loadData((profiles, activeProfileId, archivedProfiles) => {
        const profile = profiles.find(p => p.id === id);
        if (profile && profile.projectPaths && profile.projectPaths[index] !== undefined) {
            profile.projectPaths[index] = newValue;
            saveData(profiles, activeProfileId, archivedProfiles);
            refreshUndoRedoCounts(profile);
        }
    });
}

export function handleAddProjectPath(event, reRenderCallback) {
    const id = parseInt(event.currentTarget.dataset.id);
    loadData((profiles, activeProfileId, archivedProfiles) => {
        const profile = profiles.find(p => p.id === id);
        if (profile) {
            if (!profile.projectPaths) {
                profile.projectPaths = [''];
            }
            profile.projectPaths.push('');
            saveData(profiles, activeProfileId, archivedProfiles, () => {
                reRenderCallback(profiles, activeProfileId, archivedProfiles);
            });
        }
    });
}

export function handleRemoveProjectPath(event, reRenderCallback) {
    const id = parseInt(event.currentTarget.dataset.id);
    const index = parseInt(event.currentTarget.dataset.index);

    loadData((profiles, activeProfileId, archivedProfiles) => {
        const profile = profiles.find(p => p.id === id);
        if (profile && profile.projectPaths && profile.projectPaths.length > 1) {
            profile.projectPaths.splice(index, 1);
            saveData(profiles, activeProfileId, archivedProfiles, () => {
                reRenderCallback(profiles, activeProfileId, archivedProfiles);
            });
        }
    });
}

export function handleCheckboxChange(event, fieldName) {
    const id = parseInt(event.target.id.split('-')[1]);
    loadData((profiles, activeProfileId, archivedProfiles) => {
        const profile = profiles.find(p => p.id === id);
        if (profile) {
            profile[fieldName] = event.target.checked;
            saveData(profiles, activeProfileId, archivedProfiles);
        }
    });
}

export function handleExcludeFocus(event) {
    const id = parseInt(event.target.id.split('-')[1]);
    const includeContainer = document.getElementById(`includeContainer-${id}`);
    if (includeContainer) {
        includeContainer.classList.remove('collapsed');
    }
}