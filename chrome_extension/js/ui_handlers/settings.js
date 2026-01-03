import { loadData, saveData } from '../storage.js';

export function handleOpenSettingsClick(event) {
    const id = parseInt(event.currentTarget.dataset.id);
    const profileCard = document.getElementById(`profile-${id}`);
    if (profileCard) {
        profileCard.querySelector('.profile-main-view').style.display = 'none';
        profileCard.querySelector('.profile-settings-view').style.display = 'block';
    }
}

export function handleCloseSettingsClick(event) {
    const id = parseInt(event.currentTarget.dataset.id);
    const profileCard = document.getElementById(`profile-${id}`);
    if (profileCard) {
        profileCard.querySelector('.profile-main-view').style.display = 'block';
        profileCard.querySelector('.profile-settings-view').style.display = 'none';
    }
}

export function handleServerUrlChange(event) {
    const id = parseInt(event.target.id.split('-')[1]);
    loadData((profiles, activeProfileId, archivedProfiles) => {
        const profile = profiles.find(p => p.id === id);
        if (profile) {
            let newUrl = event.target.value.trim();
            if (newUrl.endsWith('/')) {
                newUrl = newUrl.slice(0, -1);
            }
            profile.serverUrl = newUrl || 'http://159.141.130.178:5010';
            saveData(profiles, activeProfileId, archivedProfiles);
        }
    });
}

export function handleCustomInstructionsToggle(event) {
    const id = parseInt(event.target.dataset.id);
    const isChecked = event.target.checked;
    
    const profileCard = document.getElementById(`profile-${id}`);
    const textarea = profileCard.querySelector('.critical-instructions');
    if (textarea) {
        textarea.disabled = !isChecked;
    }

    loadData((profiles, activeProfileId, archivedProfiles) => {
        const profile = profiles.find(p => p.id === id);
        if (profile) {
            profile.isCriticalInstructionsEnabled = isChecked;
            saveData(profiles, activeProfileId, archivedProfiles);
        }
    });
}

export function handleGatherAdditionalContextToggle(event) {
    const id = parseInt(event.target.dataset.id);
    const isChecked = event.target.checked;
    
    const profileCard = document.getElementById(`profile-${id}`);
    const textarea = profileCard.querySelector('.additional-context-script');
    if (textarea) {
        textarea.disabled = !isChecked;
    }

    loadData((profiles, activeProfileId, archivedProfiles) => {
        const profile = profiles.find(p => p.id === id);
        if (profile) {
            profile.gatherAdditionalContext = isChecked;
            saveData(profiles, activeProfileId, archivedProfiles);
        }
    });
}

export function handleRunScriptOnDeployToggle(event) {
    const id = parseInt(event.target.dataset.id);
    const isChecked = event.target.checked;
    
    const profileCard = document.getElementById(`profile-${id}`);
    const textarea = profileCard.querySelector('.post-deploy-script');
    if (textarea) {
        textarea.disabled = !isChecked;
    }

    loadData((profiles, activeProfileId, archivedProfiles) => {
        const profile = profiles.find(p => p.id === id);
        if (profile) {
            profile.runScriptOnDeploy = isChecked;
            saveData(profiles, activeProfileId, archivedProfiles);
        }
    });
}

export function handleBackendToggle(event, reRenderCallback) {
    const id = parseInt(event.currentTarget.dataset.id);
    
    loadData((profiles, activeProfileId, archivedProfiles) => {
        const profile = profiles.find(p => p.id === id);
        if (profile) {
            profile.useServerBackend = !profile.useServerBackend;
            
            // Disable Agent Mode if switching to JS mode
            if (!profile.useServerBackend) {
                profile.isAgentModeEnabled = false;
                profile.autoDeploy = false; 
            }
            
            saveData(profiles, activeProfileId, archivedProfiles);
            reRenderCallback(profiles, activeProfileId, archivedProfiles);
        }
    });
}

export function handleAgentModeToggle(event, reRenderCallback) {
    const id = parseInt(event.currentTarget.dataset.id);
    
    loadData((profiles, activeProfileId, archivedProfiles) => {
        const profile = profiles.find(p => p.id === id);
        if (profile) {
            profile.isAgentModeEnabled = !profile.isAgentModeEnabled;
            
            // Enforce Auto Deploy for Agent Mode
            if (profile.isAgentModeEnabled) {
                profile.autoDeploy = true;
            }
            
            saveData(profiles, activeProfileId, archivedProfiles);
            
            if (activeProfileId === id) {
                setAutoDeployState(profile.autoDeploy);
            }
            
            reRenderCallback(profiles, activeProfileId, archivedProfiles);
        }
    });
}

export function handleTwoWaySyncToggle(event) {
    const id = parseInt(event.target.dataset.id);
    const isChecked = event.target.checked;
    
    const profileCard = document.getElementById(`profile-${id}`);
    const textarea = profileCard.querySelector('.two-way-sync-rules');
    if (textarea) {
        textarea.disabled = !isChecked;
    }

    const applyBtn = profileCard.querySelector('.apply-replacements');
    if (applyBtn) {
        applyBtn.classList.toggle('d-none', !isChecked);
    }

    loadData((profiles, activeProfileId, archivedProfiles) => {
        const profile = profiles.find(p => p.id === id);
        if (profile) {
            profile.isTwoWaySyncEnabled = isChecked;
            saveData(profiles, activeProfileId, archivedProfiles);
        }
    });
}

export function handleAutoMaskIPsToggle(event) {
    const id = parseInt(event.target.dataset.id);
    const isChecked = event.target.checked;

    loadData((profiles, activeProfileId, archivedProfiles) => {
        const profile = profiles.find(p => p.id === id);
        if (profile) {
            profile.autoMaskIPs = isChecked;
            saveData(profiles, activeProfileId, archivedProfiles);
        }
    });
}

export function handleAutoMaskEmailsToggle(event) {
    const id = parseInt(event.target.dataset.id);
    const isChecked = event.target.checked;

    loadData((profiles, activeProfileId, archivedProfiles) => {
        const profile = profiles.find(p => p.id === id);
        if (profile) {
            profile.autoMaskEmails = isChecked;
            saveData(profiles, activeProfileId, archivedProfiles);
        }
    });
}

async function setAutoDeployState(enabled) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) return;

    if (enabled) {
        try {
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: ['js/content_script/auto_deploy_observer.js']
            });
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: () => {
                    if (window.justCodeAutoDeployObserver) {
                        window.justCodeAutoDeployObserver.start();
                    }
                }
            });
        } catch (e) {
            console.warn("JustCode: Could not inject observer.", e);
        }
    } else {
        try {
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: () => {
                    if (window.justCodeAutoDeployObserver) {
                        window.justCodeAutoDeployObserver.stop();
                    }
                }
            });
        } catch (e) {}
    }
}

export function handleAutoDeployToggle(event) {
    const id = parseInt(event.target.dataset.id);
    const isChecked = event.target.checked;

    loadData((profiles, activeProfileId, archivedProfiles) => {
        const profile = profiles.find(p => p.id === id);
        if (profile) {
            profile.autoDeploy = isChecked;
            saveData(profiles, activeProfileId, archivedProfiles);
            
            if (activeProfileId === id) {
                setAutoDeployState(isChecked);
            }
        }
    });
}

export function initAutoDeploy(profile) {
    if (profile && profile.autoDeploy) {
        setAutoDeployState(true);
    }
}
