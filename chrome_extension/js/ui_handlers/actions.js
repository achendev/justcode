import { getContext, getExclusionSuggestion } from '../get_context.js';
import { deployCode } from '../deploy_code.js';
import { undoCode, redoCode } from '../undo_redo.js';
import { loadData } from '../storage.js';
import { updateAndSaveMessage, updateTemporaryMessage } from './message.js';
import { refreshUndoRedoCounts } from '../ui.js';

async function performAction(event, actionFunc, ...extraArgs) {
    const button = event.currentTarget;
    const originalButtonHTML = button.innerHTML;
    const id = parseInt(button.dataset.id);

    const profileCard = document.querySelector(`.profile-card.active#profile-${id}`);
    if (!profileCard) return;

    // --- Select all buttons ---
    const getContextBtn = profileCard.querySelector('.get-context');
    const deployCodeBtn = profileCard.querySelector('.deploy-code');
    const undoCodeBtn = profileCard.querySelector('.undo-code');
    const redoCodeBtn = profileCard.querySelector('.redo-code');
    const mainButtons = [getContextBtn, deployCodeBtn].filter(Boolean);
    const allActionButtons = [getContextBtn, deployCodeBtn, undoCodeBtn, redoCodeBtn].filter(Boolean);

    // --- Prepare UI for loading state ---
    // Fix the size of the main action buttons to prevent layout shift during loading.
    mainButtons.forEach(btn => {
        const style = window.getComputedStyle(btn);
        btn.style.width = style.width;
        btn.style.height = style.height;
    });

    // Disable all action buttons and show spinner on the clicked one.
    allActionButtons.forEach(btn => btn.disabled = true);
    button.innerHTML = `<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>`;
    updateTemporaryMessage(id, '');

    // --- Execute Action ---
    try {
        await new Promise((resolve, reject) => {
            loadData(async (profiles) => {
                const profile = profiles.find(p => p.id === id);
                if (!profile) return reject(new Error("Profile not found."));
                // The action function (e.g., deployCode) is responsible for calling
                // refreshUndoRedoCounts on success.
                await actionFunc(profile, ...extraArgs);
                resolve();
            });
        });
    } catch (error) {
        updateAndSaveMessage(id, `Error: ${error.message}`, 'error');
        console.error("JustCode Action Error:", error);
    } finally {
        // --- Restore UI ---
        // Restore the original content of the clicked button.
        button.innerHTML = originalButtonHTML;

        // Remove the fixed sizes from the main buttons.
        mainButtons.forEach(btn => {
            btn.style.width = '';
            btn.style.height = '';
        });

        // Re-enable the main action buttons.
        getContextBtn && (getContextBtn.disabled = false);
        deployCodeBtn && (deployCodeBtn.disabled = false);
        
        // The state of undo/redo buttons is handled by refreshUndoRedoCounts,
        // which is called by the deploy, undo, and redo actions.
        // To ensure the UI is consistent for ALL actions (including getContext),
        // we'll just call it here again for the active profile.
        loadData(profiles => {
            const activeProfile = profiles.find(p => p.id === id);
            if (activeProfile) {
                refreshUndoRedoCounts(activeProfile);
            }
        });
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