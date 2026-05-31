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

export function handleProjectPathInput(event) {
    const id = parseInt(event.target.dataset.id);
    const index = parseInt(event.target.dataset.index);
    const newValue = event.target.value.trim();

    loadData((profiles, activeProfileId, archivedProfiles) => {
        const profile = profiles.find(p => p.id === id);
        if (profile && profile.projectPaths && profile.projectPaths[index] !== undefined) {
            profile.projectPaths[index] = newValue;
            saveData(profiles, activeProfileId, archivedProfiles);
        }
    });
}

export function handleProjectPathChange(event) {
    const id = parseInt(event.target.dataset.id);
    loadData((profiles, activeProfileId, archivedProfiles) => {
        const profile = profiles.find(p => p.id === id);
        if (profile) {
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
            if (profile.projectAliases) profile.projectAliases.push('');
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
            if (profile.projectAliases) profile.projectAliases.splice(index, 1);
            saveData(profiles, activeProfileId, archivedProfiles, () => {
                reRenderCallback(profiles, activeProfileId, archivedProfiles);
            });
        }
    });
}

export function handleToggleServerAlias(event) {
    const id = parseInt(event.currentTarget.dataset.id);
    const index = parseInt(event.currentTarget.dataset.index);
    const aliasInput = document.getElementById(`projectAlias-${id}-${index}`);
    
    if (aliasInput) {
        if (aliasInput.classList.contains('d-none')) {
            aliasInput.classList.remove('d-none');
            
            // Set default alias to basename
            loadData((profiles, activeProfileId, archivedProfiles) => {
                const profile = profiles.find(p => p.id === id);
                if (profile && profile.projectPaths[index]) {
                    const path = profile.projectPaths[index];
                    const cleanPath = path.replace(/[/\\]$/, '');
                    const parts = cleanPath.split(/[/\\]/);
                    const basename = parts[parts.length - 1];
                    
                    aliasInput.value = basename;
                    if (!profile.projectAliases) profile.projectAliases = [];
                    profile.projectAliases[index] = basename;
                    saveData(profiles, activeProfileId, archivedProfiles);
                }
            });
            aliasInput.focus();
        } else {
            aliasInput.classList.add('d-none');
            aliasInput.value = '';
            
            loadData((profiles, activeProfileId, archivedProfiles) => {
                const profile = profiles.find(p => p.id === id);
                if (profile && profile.projectAliases) {
                    profile.projectAliases[index] = '';
                    saveData(profiles, activeProfileId, archivedProfiles);
                }
            });
        }
    }
}

export function handleServerAliasInput(event) {
    const id = parseInt(event.target.dataset.id);
    const index = parseInt(event.target.dataset.index);
    const newValue = event.target.value.trim();

    loadData((profiles, activeProfileId, archivedProfiles) => {
        const profile = profiles.find(p => p.id === id);
        if (profile) {
            if (!profile.projectAliases) profile.projectAliases = [];
            profile.projectAliases[index] = newValue;
            saveData(profiles, activeProfileId, archivedProfiles);
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