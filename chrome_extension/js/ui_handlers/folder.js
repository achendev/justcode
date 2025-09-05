import { forgetHandle, saveHandle, getHandles } from '../file_system_manager.js';
import { updateAndSaveMessage } from './message.js';
import { updateFolderName } from '../ui.js';
import { loadData, saveData } from '../storage.js';

/**
 * Opens a dedicated picker window to handle folder selection.
 * This is necessary because showDirectoryPicker's permission prompt does not
 * reliably appear when called from the main extension popup.
 * The picker window will handle the API call and communicate the result back.
 */
export async function handleSelectFolder(event) {
    const id = parseInt(event.currentTarget.dataset.id);
    const index = parseInt(event.currentTarget.dataset.index);
    const pickerUrl = chrome.runtime.getURL(`picker.html?profileId=${id}&index=${index}`);

    chrome.windows.create({
        url: pickerUrl,
        type: 'popup',
        width: 450,
        height: 170,
    });
}

export async function handleForgetFolder(event) {
    const id = parseInt(event.currentTarget.dataset.id);
    const index = parseInt(event.currentTarget.dataset.index);

    if (confirm('Are you sure you want to forget this folder? You will need to select it again to grant access.')) {
        await forgetHandle(id, index);
        
        loadData((profiles, activeProfileId, archivedProfiles) => {
            const profile = profiles.find(p => p.id === id);
            if (profile && profile.jsProjectFolderNames && profile.jsProjectFolderNames[index] !== undefined) {
                profile.jsProjectFolderNames[index] = '';
                saveData(profiles, activeProfileId, archivedProfiles);
                updateFolderName(id, index, null);
                updateAndSaveMessage(id, 'Folder access has been removed.', 'info');
            }
        });
    }
}

export function handleAddJsProjectFolder(event, reRenderCallback) {
    const id = parseInt(event.currentTarget.dataset.id);
    loadData((profiles, activeProfileId, archivedProfiles) => {
        const profile = profiles.find(p => p.id === id);
        if (profile) {
            profile.jsProjectFolderNames.push('');
            saveData(profiles, activeProfileId, archivedProfiles, () => {
                reRenderCallback(profiles, activeProfileId, archivedProfiles);
            });
        }
    });
}

export async function handleRemoveJsProjectFolder(event, reRenderCallback) {
    const id = parseInt(event.currentTarget.dataset.id);
    const indexToRemove = parseInt(event.currentTarget.dataset.index);

    loadData(async (profiles, activeProfileId, archivedProfiles) => {
        const profile = profiles.find(p => p.id === id);
        if (profile && profile.jsProjectFolderNames && profile.jsProjectFolderNames.length > 1) {
            const currentCount = profile.jsProjectFolderNames.length;
            
            // Get all handles from the one to be removed to the end
            const handlesToShift = await getHandles(id, currentCount);
            
            // Remove the folder name and handle at the specified index
            profile.jsProjectFolderNames.splice(indexToRemove, 1);
            await forgetHandle(id, indexToRemove);

            // Shift subsequent handles down
            for (let i = indexToRemove; i < currentCount - 1; i++) {
                const handleToMove = handlesToShift[i + 1];
                if (handleToMove) {
                    await saveHandle(id, i, handleToMove);
                } else {
                    await forgetHandle(id, i); // Ensure the new slot is empty if the old one was
                }
            }
            // Forget the last handle's old position
            await forgetHandle(id, currentCount - 1);

            saveData(profiles, activeProfileId, archivedProfiles, () => {
                reRenderCallback(profiles, activeProfileId, archivedProfiles);
            });
        }
    });
}