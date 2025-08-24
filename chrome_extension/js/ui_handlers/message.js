import { loadData, saveData } from '../storage.js';

async function updateMessageInDOM(profileId, text, type) {
    if (typeof document === 'undefined') return;

    const profileCard = document.getElementById(`profile-${profileId}`);
    if (profileCard) {
        const container = profileCard.querySelector('.status-container');
        const messageDiv = container?.querySelector('.status-message');
        const textSpan = container?.querySelector('.message-text');

        if (container && messageDiv && textSpan) {
            if (text) {
                const settings = await chrome.storage.local.get({ wordWrapMessagesEnabled: true });
                textSpan.innerHTML = text;
                textSpan.classList.toggle('word-wrap-enabled', settings.wordWrapMessagesEnabled);
                messageDiv.className = `status-message status-${type}`;
                container.classList.remove('d-none');
            } else {
                textSpan.innerHTML = '';
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
 * @returns {Promise<void>} A promise that resolves when the message is saved.
 */
export function updateAndSaveMessage(profileId, text, type = 'info') {
    return new Promise(async (resolve) => {
        await updateMessageInDOM(profileId, text, type);
        
        loadData((profiles, activeProfileId, archivedProfiles) => {
            const profile = profiles.find(p => p.id === profileId);
            if (profile) {
                profile.lastMessage = { text, type };
                saveData(profiles, activeProfileId, archivedProfiles, resolve);
            } else {
                resolve();
            }
        });
    });
}

/**
 * Updates a profile's status message in the DOM only (for temporary messages like "Working...").
 * @param {number} profileId The ID of the profile to update.
 * @param {string} text The message text.
 * @param {'info' | 'success' | 'error'} type The type of message.
 */
export async function updateTemporaryMessage(profileId, text, type = 'info') {
    await updateMessageInDOM(profileId, text, type);
}

/**
 * Handles the click event for closing a status message.
 * @param {MouseEvent} event The click event.
 */
export async function handleCloseMessage(event) {
    const profileId = parseInt(event.currentTarget.dataset.id);
    await updateAndSaveMessage(profileId, '', 'info');
}