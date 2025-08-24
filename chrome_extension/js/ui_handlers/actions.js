import { getContext, getExclusionSuggestion } from '../get_context.js';
import { deployCode } from '../deploy_code.js';
import { undoCode, redoCode } from '../undo_redo.js';
import { loadData, saveData } from '../storage.js';
import { updateAndSaveMessage, updateTemporaryMessage } from './message.js';
import { refreshUndoRedoCounts } from '../ui.js';
import { handleServerError } from './server_error_handler.js';

// --- Start of New Code ---
const GET_CONTEXT_HINT_KEY = 'getContextButtonUsageCount';
const DEPLOY_CODE_HINT_KEY = 'deployCodeButtonUsageCount';
const GET_CONTEXT_HINT_MESSAGE = "Pro Tip: Use the (ALT + ←) or (⌥←) shortcut next time!";
const DEPLOY_CODE_HINT_MESSAGE = "Pro Tip: Use the (ALT + →) or (⌥→) shortcut next time!";
const MAX_HINT_COUNT = 10;

async function getUsageCount(key) {
    const data = await chrome.storage.local.get({ [key]: 0 });
    return data[key];
}

async function incrementUsageCount(key) {
    const count = await getUsageCount(key);
    if (count < MAX_HINT_COUNT) {
        await chrome.storage.local.set({ [key]: count + 1 });
    }
}
// --- End of New Code ---


async function performAction(event, actionFunc, ...extraArgs) {
    const button = event.currentTarget;
    const originalButtonHTML = button.innerHTML;
    const id = parseInt(button.dataset.id);

    const profileCard = document.querySelector(`.profile-card.active#profile-${id}`);
    if (!profileCard) return;

    const getContextBtn = profileCard.querySelector('.get-context');
    const deployCodeBtn = profileCard.querySelector('.deploy-code');
    const undoCodeBtn = profileCard.querySelector('.undo-code');
    const redoCodeBtn = profileCard.querySelector('.redo-code');
    const allActionButtons = [getContextBtn, deployCodeBtn, undoCodeBtn, redoCodeBtn].filter(Boolean);

    allActionButtons.forEach(btn => btn.disabled = true);
    button.innerHTML = `<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>`;
    await updateTemporaryMessage(id, '');

    try {
        const result = await new Promise((resolve, reject) => {
            loadData(async (profiles) => {
                try {
                    const profile = profiles.find(p => p.id === id);
                    if (!profile) {
                        return reject(new Error("Profile not found."));
                    }
                    const actionResult = await actionFunc(profile, ...extraArgs);
                    resolve(actionResult);
                } catch (err) {
                    reject(err);
                }
            });
        });

        if (result && result.text) {
            let messageText = result.text;
            const fromShortcut = extraArgs[0] === true;

            // --- Start of Modified Code ---
            if (!fromShortcut && result.type === 'success') {
                if (actionFunc === getContext) {
                    const usageCount = await getUsageCount(GET_CONTEXT_HINT_KEY);
                    if (usageCount < MAX_HINT_COUNT) {
                        messageText += `\n${GET_CONTEXT_HINT_MESSAGE}`;
                        await incrementUsageCount(GET_CONTEXT_HINT_KEY);
                    }
                } else if (actionFunc === deployCode) {
                    const usageCount = await getUsageCount(DEPLOY_CODE_HINT_KEY);
                    if (usageCount < MAX_HINT_COUNT) {
                        messageText += `\n${DEPLOY_CODE_HINT_MESSAGE}`;
                        await incrementUsageCount(DEPLOY_CODE_HINT_KEY);
                    }
                }
            }
             // --- End of Modified Code ---
            
            await updateAndSaveMessage(id, messageText, result.type);

            if (actionFunc === getContext) {
                const settings = await chrome.storage.local.get({ closeOnGetContext: false });
                const isDetached = new URLSearchParams(window.location.search).get('view') === 'window';
                if (settings.closeOnGetContext && !isDetached && !fromShortcut) {
                    window.close();
                }
            }
        }
    } catch (error) {
        await updateAndSaveMessage(id, `Error: ${error.message}`, 'error');
        console.error("JustCode Action Error:", error);
    } finally {
        button.innerHTML = originalButtonHTML;
        
        loadData(profiles => {
            const activeProfile = profiles.find(p => p.id === id);
            if (activeProfile) {
                getContextBtn && (getContextBtn.disabled = false);
                deployCodeBtn && (deployCodeBtn.disabled = false);
                refreshUndoRedoCounts(activeProfile);
            }
        });
    }
}


export function handleGetContextClick(event) {
    performAction(event, getContext, false); // fromShortcut = false
}

export function handleDeployCodeClick(event) {
    performAction(event, deployCode, false); // fromShortcut = false
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
            await updateAndSaveMessage(id, 'Error: No active profile or server URL configured.', 'error');
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

            const response = await fetch(endpoint, { method: 'POST', headers: headers });
            const resultText = await response.text();
            if (!response.ok) throw new Error(resultText);
            
            await updateAndSaveMessage(id, resultText, 'success');

        } catch (error) {
            const message = handleServerError(error, true);
            await updateAndSaveMessage(id, message, 'error');
            console.error('JustCode Update Error:', error);
        } finally {
            button.disabled = false;
            button.innerHTML = originalButtonHTML;
        }
    });
}