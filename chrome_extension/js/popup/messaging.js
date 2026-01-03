import { updateFolderName } from '../ui.js';
import { updateAndSaveMessage } from '../ui_handlers/message.js';
import { loadData, saveData } from '../storage.js';

export function initializeMessaging(reRender) {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        // Ignore messages from content scripts or other tabs 
        if (sender.tab) return;

        switch (message.type) {
            case "folderSelected":
                loadData((profiles, activeProfileId, archivedProfiles) => {
                    const profile = profiles.find(p => p.id === message.profileId);
                    if (profile && profile.jsProjectFolderNames[message.index] !== undefined) {
                        profile.jsProjectFolderNames[message.index] = message.folderName;
                        saveData(profiles, activeProfileId, archivedProfiles);
                    }
                });
                updateFolderName(message.profileId, message.index, message.folderName);
                updateAndSaveMessage(message.profileId, `Folder '${message.folderName}' access granted.`, 'success');
                break;
            
            case "closePopupOnShortcut":
                const isDetachedWindow = new URLSearchParams(window.location.search).get('view') === 'window';
                if (!isDetachedWindow) {
                    window.close();
                }
                break;
        }
        
        // Return true to indicate you wish to send a response asynchronously (even if you don't).
        return true; 
    });
}