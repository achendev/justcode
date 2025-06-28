import { loadData, saveData } from '../storage.js';

function updateMessageInDOM(profileId, text, type) {
    const profileCard = document.getElementById(`profile-${profileId}`);
    if (profileCard) {
        const messageDiv = profileCard.querySelector('.status-message');
        if (messageDiv) {
            messageDiv.textContent = text;
            // Reset classes and add the new ones
            messageDiv.className = `status-message mt-3 status-${type}`; 
        }
    }
}

/**
 * Updates a profile's status message in the DOM and saves it to storage.
 * @param {number} profileId The ID of the profile to update.
 * @param {string} text The message text.
 * @param {'info' | 'success' | 'error'} type The type of message.
 */
export function updateAndSaveMessage(profileId, text, type = 'info') {
    updateMessageInDOM(profileId, text, type);
    
    loadData((profiles, activeProfileId, archivedProfiles) => {
        const profile = profiles.find(p => p.id === profileId);
        if (profile) {
            profile.lastMessage = { text, type };
            saveData(profiles, activeProfileId, archivedProfiles);
        }
    });
}

/**
 * Updates a profile's status message in the DOM only (for temporary messages like "Working...").
 * @param {number} profileId The ID of the profile to update.
 * @param {string} text The message text.
 * @param {'info' | 'success' | 'error'} type The type of message.
 */
export function updateTemporaryMessage(profileId, text, type = 'info') {
    updateMessageInDOM(profileId, text, type);
}