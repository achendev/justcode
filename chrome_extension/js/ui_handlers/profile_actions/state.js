import { loadData, saveData } from '../../storage.js';
import { updateAndSaveMessage } from '../message.js';
import { forgetHandle } from '../../file_system_manager.js';

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