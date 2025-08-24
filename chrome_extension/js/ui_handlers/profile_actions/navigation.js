import { loadData, saveData } from '../../storage.js';

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

export function handleProfileReorder(draggedId, targetId, reRenderCallback) {
    loadData((profiles, activeProfileId, archivedProfiles) => {
        const draggedIndex = profiles.findIndex(p => p.id === draggedId);
        const targetIndex = profiles.findIndex(p => p.id === targetId);

        if (draggedIndex === -1 || targetIndex === -1 || draggedIndex === targetIndex) {
            return;
        }

        const newProfiles = [...profiles];
        const [draggedProfile] = newProfiles.splice(draggedIndex, 1);
        newProfiles.splice(targetIndex, 0, draggedProfile);

        saveData(newProfiles, activeProfileId, archivedProfiles);
        reRenderCallback(newProfiles, activeProfileId, archivedProfiles);
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

export function handleMoveProfileLeft(event, reRenderCallback) {
    const id = parseInt(event.currentTarget.dataset.id);
    moveProfile(id, -1, reRenderCallback);
}

export function handleMoveProfileRight(event, reRenderCallback) {
    const id = parseInt(event.currentTarget.dataset.id);
    moveProfile(id, 1, reRenderCallback);
}