import { getContext } from '../get_context.js';
import { deployCode } from '../deploy_code.js';
import { rollbackCode } from '../rollback.js';
import { loadData } from '../storage.js';

function setActionButtonsDisabled(profileId, isDisabled) {
    const profileCard = document.querySelector(`.profile-card.active#profile-${profileId}`);
    if (profileCard) {
        const getContextBtn = profileCard.querySelector('.get-context');
        const deployCodeBtn = profileCard.querySelector('.deploy-code');
        const rollbackCodeBtn = profileCard.querySelector('.rollback-code');

        if (getContextBtn) getContextBtn.disabled = isDisabled;
        if (deployCodeBtn) deployCodeBtn.disabled = isDisabled;
        if (rollbackCodeBtn) rollbackCodeBtn.disabled = isDisabled;
    }
}

async function performAction(event, errorDiv, actionFunc, ...extraArgs) {
    const button = event.currentTarget;
    const originalButtonHTML = button.innerHTML;
    const id = parseInt(button.dataset.id);

    setActionButtonsDisabled(id, true);
    button.innerHTML = `<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Working...`;

    try {
        // Wrap the callback-based loadData in a Promise to use with async/await
        await new Promise((resolve, reject) => {
            loadData(async (profiles, activeProfileId, archivedProfiles) => {
                try {
                    const profile = profiles.find(p => p.id === id);
                    if (!profile) {
                        // This error will be caught by the outer catch block
                        throw new Error("Action failed: Profile not found.");
                    }
                    // The actionFunc is responsible for updating the errorDiv on its own
                    await actionFunc(profile, errorDiv, ...extraArgs);
                    resolve();
                } catch (error) {
                    reject(error);
                }
            });
        });
    } catch (error) {
        // The individual action functions should have already updated the UI.
        // We log the error here for debugging purposes, but avoid overwriting a specific error message.
        console.error("JustCode Action Error:", error.message);
        if (!errorDiv.textContent) {
             errorDiv.textContent = `Error: ${error.message}`;
        }
    } finally {
        setActionButtonsDisabled(id, false);
        button.innerHTML = originalButtonHTML;
    }
}

export function handleGetContextClick(event, errorDiv, fromShortcut = false) {
    performAction(event, errorDiv, getContext, fromShortcut);
}

export function handleDeployCodeClick(event, errorDiv) {
    performAction(event, errorDiv, deployCode);
}

export function handleRollbackCodeClick(event, errorDiv) {
    performAction(event, errorDiv, rollbackCode);
}

export function handleUpdateAppClick(event, errorDiv) {
    const button = event.currentTarget;
    const originalButtonHTML = button.innerHTML;
    
    button.disabled = true;
    button.innerHTML = `<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>`;
    errorDiv.textContent = 'Checking for updates...';

    loadData(async (profiles, activeProfileId) => {
        const activeProfile = profiles.find(p => p.id === activeProfileId);
        if (!activeProfile || !activeProfile.serverUrl) {
            errorDiv.textContent = 'Error: No active profile or server URL configured.';
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
            
            errorDiv.textContent = resultText;

        } catch (error) {
            errorDiv.textContent = `Update failed: ${error.message}`;
            console.error('JustCode Update Error:', error);
        } finally {
            button.disabled = false;
            button.innerHTML = originalButtonHTML;
        }
    });
}