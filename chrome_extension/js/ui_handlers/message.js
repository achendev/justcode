import { loadData, saveData } from '../storage.js';

function updateMessageInDOM(profileId, text, type) {
    // If document is not defined, we're likely in a background script. Do nothing.
    if (typeof document === 'undefined') return;

    const profileCard = document.getElementById(`profile-${profileId}`);
    if (profileCard) {
        const container = profileCard.querySelector('.status-container');
        const messageDiv = container?.querySelector('.status-message');
        const textSpan = container?.querySelector('.message-text');

        if (container && messageDiv && textSpan) {
            if (text) {
                textSpan.textContent = text;
                // Only change the type class, the other classes are for structure
                messageDiv.className = `status-message status-${type}`;
                container.classList.remove('d-none');
            } else {
                textSpan.textContent = '';
                container.classList.add('d-none');
            }
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

/**
 * Handles the click event for closing a status message.
 * @param {MouseEvent} event The click event.
 */
export function handleCloseMessage(event) {
    const profileId = parseInt(event.currentTarget.dataset.id);
    // This function will call updateMessageInDOM with empty text, hiding the element
    // and also clearing the message from storage so it doesn't reappear.
    updateAndSaveMessage(profileId, '', 'info');
}