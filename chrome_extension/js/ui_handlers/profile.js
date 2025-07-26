import { loadData, saveData } from '../storage.js';
import { updateAndSaveMessage } from './message.js';
import { defaultCriticalInstructions } from '../default_instructions.js';
import { forgetHandle } from '../file_system_manager.js';

export function handleAddProfile(reRenderCallback) {
    loadData((profiles, activeProfileId, archivedProfiles) => {
        const newProfile = {
            id: Date.now(),
            name: `Profile ${profiles.length + 1}`,
            // Universal fields
            getContextTarget: 'ui',
            deployCodeSource: 'ui',
            contextAsFile: true,
            separateInstructionsAsFile: true,
            excludePatterns: '.git/,venv/,.env,log/,*logs/,tmp/,node_modules/',
            includePatterns: '',
            contextSizeLimit: 3000000,
            isCriticalInstructionsEnabled: false,
            criticalInstructions: defaultCriticalInstructions,
            codeBlockDelimiter: '```',
            tolerateErrors: true,
            lastMessage: { text: '', type: 'info' },
            // Mode toggle
            useServerBackend: false,
            // Server-specific fields
            projectPath: '',
            serverUrl: 'http://127.0.0.1:5010',
            isAuthEnabled: false,
            username: '',
            password: '',
        };
        profiles.push(newProfile);
        const newActiveProfileId = newProfile.id;
        saveData(profiles, newActiveProfileId, archivedProfiles);
        reRenderCallback(profiles, newActiveProfileId, archivedProfiles);
    });
}

export function handleTabSwitch(event, reRenderCallback) {
    event.preventDefault();
    const id = parseInt(event.target.dataset.id);
    loadData((profiles, activeProfileId, archivedProfiles) => {
        saveData(profiles, id, archivedProfiles);
        reRenderCallback(profiles, id, archivedProfiles);
    });
}

export function handleProfileNameChange(event, reRenderCallback) {
    const id = parseInt(event.target.dataset.id);
    loadData((profiles, activeProfileId, archivedProfiles) => {
        const profile = profiles.find(p => p.id === id);
        profile.name = event.target.value.trim() || 'Unnamed';
        saveData(profiles, activeProfileId, archivedProfiles);
        reRenderCallback(profiles, activeProfileId, archivedProfiles);
    });
}

export function handleCopyProfile(event, reRenderCallback) {
    const id = parseInt(event.currentTarget.dataset.id);
    loadData((profiles, activeProfileId, archivedProfiles) => {
        const profileToCopy = profiles.find(p => p.id === id);
        if (!profileToCopy) return;

        const newProfile = JSON.parse(JSON.stringify(profileToCopy));
        
        newProfile.id = Date.now();
        newProfile.name = `${profileToCopy.name} (Copy)`;
        newProfile.lastMessage = { text: '', type: 'info' }; 
        
        // Don't copy the folder handle, user must select it again for the new profile
        forgetHandle(newProfile.id);

        const originalIndex = profiles.findIndex(p => p.id === id);
        profiles.splice(originalIndex !== -1 ? originalIndex + 1 : profiles.length, 0, newProfile);

        const newActiveProfileId = newProfile.id;
        saveData(profiles, newActiveProfileId, archivedProfiles);
        reRenderCallback(profiles, newActiveProfileId, archivedProfiles);
    });
}

export function handleArchiveProfile(event, reRenderCallback) {
    const id = parseInt(event.currentTarget.dataset.id);
    loadData((profiles, activeProfileId, archivedProfiles) => {
        if (profiles.length <= 1) {
            updateAndSaveMessage(id, 'Cannot archive the last profile.', 'error');
            return;
        }
        const profileToArchive = profiles.find(p => p.id === id);
        if (!profileToArchive) return;

        const updatedProfiles = profiles.filter(p => p.id !== id);
        const updatedArchivedProfiles = [...archivedProfiles, profileToArchive];

        const newActiveProfileId = activeProfileId === id ? updatedProfiles[0].id : activeProfileId;
        
        saveData(updatedProfiles, newActiveProfileId, updatedArchivedProfiles);
        reRenderCallback(updatedProfiles, newActiveProfileId, updatedArchivedProfiles);
    });
}

export function handleDirectPermanentDeleteProfile(event, reRenderCallback) {
    const id = parseInt(event.currentTarget.dataset.id);
    loadData((profiles, activeProfileId, archivedProfiles) => {
        if (profiles.length <= 1) {
            updateAndSaveMessage(id, 'Cannot delete the last profile.', 'error');
            return;
        }

        const profileToDeleteIndex = profiles.findIndex(p => p.id === id);
        if (profileToDeleteIndex === -1) return;

        forgetHandle(id); // Clean up IndexedDB
        const updatedProfiles = profiles.filter(p => p.id !== id);
        
        let newActiveProfileId = activeProfileId;
        if (activeProfileId === id) {
            const newIndex = Math.max(0, profileToDeleteIndex - 1);
            newActiveProfileId = updatedProfiles[newIndex].id;
        }
        
        saveData(updatedProfiles, newActiveProfileId, archivedProfiles);
        reRenderCallback(updatedProfiles, newActiveProfileId, archivedProfiles);
    });
}

function moveProfile(id, direction, reRenderCallback) {
    loadData((profiles, activeProfileId, archivedProfiles) => {
        if (profiles.length <= 1) return;
        const currentIndex = profiles.findIndex(p => p.id === id);
        if (currentIndex === -1) return;
        const newProfiles = [...profiles];
        const [movedProfile] = newProfiles.splice(currentIndex, 1);
        const newIndex = (currentIndex + direction + profiles.length) % profiles.length;
        newProfiles.splice(newIndex, 0, movedProfile);
        saveData(newProfiles, activeProfileId, archivedProfiles);
        reRenderCallback(newProfiles, activeProfileId, archivedProfiles);
    });
}

export function handleMoveProfileLeft(event, reRenderCallback) {
    const id = parseInt(event.currentTarget.dataset.id);
    moveProfile(id, -1, reRenderCallback);
}

export function handleMoveProfileRight(event, reRenderCallback) {
    const id = parseInt(event.currentTarget.dataset.id);
    moveProfile(id, 1, reRenderCallback);
}

export function handleRestoreProfile(event, reRenderCallback) {
    const id = parseInt(event.currentTarget.dataset.id);
    loadData((profiles, activeProfileId, archivedProfiles) => {
        const profileToRestore = archivedProfiles.find(p => p.id === id);
        if (!profileToRestore) return;

        const updatedArchivedProfiles = archivedProfiles.filter(p => p.id !== id);
        const updatedProfiles = [...profiles, profileToRestore];
        
        const newActiveProfileId = profileToRestore.id;

        saveData(updatedProfiles, newActiveProfileId, updatedArchivedProfiles);
        reRenderCallback(updatedProfiles, newActiveProfileId, updatedArchivedProfiles);
    });
}

export function handlePermanentDeleteProfile(event, reRenderCallback) {
    const id = parseInt(event.currentTarget.dataset.id);
    loadData((profiles, activeProfileId, archivedProfiles) => {
        forgetHandle(id); // Clean up IndexedDB
        const updatedArchivedProfiles = archivedProfiles.filter(p => p.id !== id);
        saveData(profiles, activeProfileId, updatedArchivedProfiles);
        reRenderCallback(profiles, activeProfileId, archivedProfiles);
    });
}