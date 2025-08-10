import { getContext, getExclusionSuggestion } from '../get_context.js';
import { deployCode } from '../deploy_code.js';
import { undoCode, redoCode } from '../undo_redo.js';
import { loadData, saveData } from '../storage.js';
import { updateAndSaveMessage, updateTemporaryMessage } from './message.js';
import { refreshUndoRedoCounts } from '../ui.js';

async function performAction(event, actionFunc, ...extraArgs) {
    const button = event.currentTarget;
    const originalButtonHTML = button.innerHTML;
    const id = parseInt(button.dataset.id);
    const isFromShortcut = extraArgs.includes(true);

    const profileCard = document.querySelector(`.profile-card.active#profile-${id}`);
    if (!profileCard) return;

    const getContextBtn = profileCard.querySelector('.get-context');
    const deployCodeBtn = profileCard.querySelector('.deploy-code');
    const undoCodeBtn = profileCard.querySelector('.undo-code');
    const redoCodeBtn = profileCard.querySelector('.redo-code');
    const allActionButtons = [getContextBtn, deployCodeBtn, undoCodeBtn, redoCodeBtn].filter(Boolean);

    allActionButtons.forEach(btn => btn.disabled = true);
    button.innerHTML = `<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>`;
    updateTemporaryMessage(id, '');

    try {
        const result = await new Promise((resolve, reject) => {
            loadData(async (profiles) => {
                const profile = profiles.find(p => p.id === id);
                if (!profile) {
                    return reject(new Error("Profile not found."));
                }
                // Pass all extra args, including the fromShortcut boolean if present
                const actionResult = await actionFunc(profile, ...extraArgs);
                resolve(actionResult);
            });
        });

        // If the action returned a message, display it.
        if (result && result.text) {
            updateAndSaveMessage(id, result.text, result.type);

            // Handle closing the popup window after a successful "Get Context" action
            if (actionFunc === getContext) {
                const settings = await chrome.storage.local.get({ closeOnGetContext: false });
                const isDetached = new URLSearchParams(window.location.search).get('view') === 'window';
                if ((isFromShortcut || settings.closeOnGetContext) && !isDetached) {
                    window.close();
                }
            }
        }
    } catch (error) {
        updateAndSaveMessage(id, `Error: ${error.message}`, 'error');
        console.error("JustCode Action Error:", error);
    } finally {
        button.innerHTML = originalButtonHTML;
        
        loadData(profiles => {
            const activeProfile = profiles.find(p => p.id === id);
            if (activeProfile) {
                // Re-enable main buttons
                getContextBtn && (getContextBtn.disabled = false);
                deployCodeBtn && (deployCodeBtn.disabled = false);
                // Refresh undo/redo buttons state
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

export function handleGetExclusionSuggestionClick(event) {
    performAction(event, getExclusionSuggestion);
}

export function handleUpdateAppClick(event) {
    const button = event.currentTarget;
    const originalButtonHTML = button.innerHTML;
    const id = parseInt(button.dataset.id);
    
    button.disabled = true;
    button.innerHTML = `<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>`;
    updateTemporaryMessage(id, 'Checking for updates...');

    loadData(async (profiles) => {
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
                headers['Authorization'] = 'Basic ' + btoa(`${activeProfile.username}:${active.password}`);
            }

            const response = await fetch(endpoint, { method: 'POST', headers: headers });
            const resultText = await response.text();
            if (!response.ok) throw new Error(resultText);
            
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