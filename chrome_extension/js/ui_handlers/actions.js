import { getContext, getExclusionSuggestion } from '../get_context.js';
import { deployCode } from '../deploy_code.js';
import { undoCode, redoCode } from '../undo_redo.js';
import { loadData } from '../storage.js';
import { updateAndSaveMessage, updateTemporaryMessage } from './message.js';

function setActionButtonsDisabled(profileId, isDisabled) {
    const profileCard = document.querySelector(`.profile-card.active#profile-${profileId}`);
    if (profileCard) {
        const getContextBtn = profileCard.querySelector('.get-context');
        const deployCodeBtn = profileCard.querySelector('.deploy-code');
        const undoCodeBtn = profileCard.querySelector('.undo-code');
        const redoCodeBtn = profileCard.querySelector('.redo-code');

        if (getContextBtn) getContextBtn.disabled = isDisabled;
        if (deployCodeBtn) deployCodeBtn.disabled = isDisabled;
        if (undoCodeBtn) undoCodeBtn.disabled = isDisabled;
        if (redoCodeBtn) redoCodeBtn.disabled = isDisabled;
    }
}

async function performAction(event, actionFunc, ...extraArgs) {
    const button = event.currentTarget;
    const originalButtonHTML = button.innerHTML;
    const id = parseInt(button.dataset.id);

    // Temporarily disable all action buttons for the profile
    const profileCard = document.querySelector(`.profile-card.active#profile-${id}`);
    if (profileCard) {
        profileCard.querySelectorAll('.get-context, .deploy-code, .undo-code, .redo-code').forEach(btn => btn.disabled = true);
    }
    
    button.innerHTML = `<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>`;
    updateTemporaryMessage(id, ''); // Clear previous persistent message

    try {
        await new Promise((resolve, reject) => {
            loadData(async (profiles, activeProfileId, archivedProfiles) => {
                try {
                    const profile = profiles.find(p => p.id === id);
                    if (!profile) {
                        throw new Error("Action failed: Profile not found.");
                    }
                    await actionFunc(profile, ...extraArgs);
                    resolve();
                } catch (error) {
                    reject(error);
                }
            });
        });
    } catch (error) {
        console.error("JustCode Action Error:", error.message);
        updateAndSaveMessage(id, `Error: ${error.message}`, 'error');
    } finally {
        // Re-enable buttons based on their actual state by calling refresh
        loadData((profiles, activeProfileId) => {
             const profile = profiles.find(p => p.id === id);
             if(profile) {
                // This will re-enable/disable undo/redo based on counts
                // and we need to manually re-enable the others.
                const getContextBtn = profileCard.querySelector('.get-context');
                const deployCodeBtn = profileCard.querySelector('.deploy-code');
                if(getContextBtn) getContextBtn.disabled = false;
                if(deployCodeBtn) deployCodeBtn.disabled = false;
             }
        });
        button.innerHTML = originalButtonHTML;
    }
}

export function handleGetContextClick(event, fromShortcut = false) {
    performAction(event, getContext, fromShortcut);
}

export function handleDeployCodeClick(event) {
    performAction(event, deployCode);
}

export function handleUndoCodeClick(event) {
    performAction(event, undoCode);
}

export function handleRedoCodeClick(event) {
    performAction(event, redoCode);
}


export async function handleGetExclusionSuggestionClick(event) {
    const button = event.currentTarget;
    const originalButtonHTML = button.innerHTML;
    const id = parseInt(button.dataset.id);
    
    button.disabled = true;
    button.innerHTML = `<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>`;
    updateTemporaryMessage(id, '');

    try {
        await new Promise((resolve, reject) => {
            loadData(async (profiles, activeProfileId, archivedProfiles) => {
                try {
                    const profile = profiles.find(p => p.id === id);
                    if (!profile) {
                        throw new Error("Action failed: Profile not found.");
                    }
                    // The called function handles its own messaging.
                    await getExclusionSuggestion(profile);
                    resolve();
                } catch (error) {
                    reject(error);
                }
            });
        });
    } catch (error) {
        // This is a fallback error handler. The action function should handle its own UI updates.
        console.error("JustCode Action Error:", error);
        updateAndSaveMessage(id, `Error: ${error.message}`, 'error');
    } finally {
        button.disabled = false;
        button.innerHTML = originalButtonHTML;
    }
}

export function handleUpdateAppClick(event) {
    const button = event.currentTarget;
    const originalButtonHTML = button.innerHTML;
    const id = parseInt(button.dataset.id);
    
    button.disabled = true;
    button.innerHTML = `<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>`;
    updateTemporaryMessage(id, 'Checking for updates...');

    loadData(async (profiles, activeProfileId) => {
        const activeProfile = profiles.find(p => p.id === id);
        if (!activeProfile || !activeProfile.serverUrl) {
            updateAndSaveMessage(id, 'Error: No active profile or server URL configured.', 'error');
            button.disabled = false;
            button.innerHTML = originalButtonHTML;
            return;
        }
        
        const serverUrl = activeProfile.serverUrl.endsWith('/') ? activeProfile.serverUrl.slice(0, -1) : activeProfile.serverUrl;
        const endpoint = `${serverUrl}/update`;

        try {
            const headers = { 'Content-Type': 'text/plain' };
            if (activeProfile.isAuthEnabled && activeProfile.username) {
                headers['Authorization'] = 'Basic ' + btoa(`${activeProfile.username}:${activeProfile.password}`);
            }

            const response = await fetch(endpoint, {
                method: 'POST',
                headers: headers
            });

            const resultText = await response.text();
            if (!response.ok) {
                throw new Error(resultText);
            }
            
            updateAndSaveMessage(id, resultText, 'success');

        } catch (error) {
            updateAndSaveMessage(id, `Update failed: ${error.message}`, 'error');
            console.error('JustCode Update Error:', error);
        } finally {
            button.disabled = false;
            button.innerHTML = originalButtonHTML;
        }
    });
}