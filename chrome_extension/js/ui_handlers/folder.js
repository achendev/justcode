import { forgetHandle } from '../file_system_manager.js';
import { updateAndSaveMessage } from './message.js';
import { updateFolderName } from '../ui.js';

/**
 * Opens a dedicated picker window to handle folder selection.
 * This is necessary because showDirectoryPicker's permission prompt does not
 * reliably appear when called from the main extension popup.
 * The picker window will handle the API call and communicate the result back.
 */
export async function handleSelectFolder(event) {
    const id = parseInt(event.currentTarget.dataset.id);
    const pickerUrl = chrome.runtime.getURL(`picker.html?profileId=${id}`);

    // Create a small popup window. The OS folder picker will open on top of this.
    chrome.windows.create({
        url: pickerUrl,
        type: 'popup',
        width: 450,
        height: 170,
    });
}

export async function handleForgetFolder(event) {
    const id = parseInt(event.currentTarget.dataset.id);
    if (confirm('Are you sure you want to forget this folder? You will need to select it again to grant access.')) {
        await forgetHandle(id);
        updateFolderName(id, null);
        await updateAndSaveMessage(id, 'Folder access has been removed.', 'info');
    }
}