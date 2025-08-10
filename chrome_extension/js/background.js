import { loadData, saveData } from './storage.js';
import { getContext } from './get_context.js';
import { deployCode } from './deploy_code.js';

// Central function to show notification on the active page
async function showNotification(result) {
    if (!result || !result.text) return;

    try {
        const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        if (tab) {
            await chrome.tabs.sendMessage(tab.id, {
                type: 'showNotificationOnPage',
                text: result.text,
                messageType: result.type
            });
        }
    } catch (err) {
        // This can happen if the content script is not injected on the page (e.g., chrome:// pages)
        console.log("Could not send notification to content script. It might not be injected or the page may be protected.", err);
    }
}

// Main command handler
chrome.commands.onCommand.addListener(async (command) => {
    console.log(`JustCode Command Received: ${command}`);

    if (command !== "get-context-shortcut" && command !== "deploy-code-shortcut") {
        return;
    }

    loadData(async (profiles, activeProfileId, archivedProfiles) => {
        if (!activeProfileId || !profiles || profiles.length === 0) {
            console.error("JustCode Error: No active profile found for shortcut.");
            return;
        }
        
        const activeProfile = profiles.find(p => p.id === activeProfileId);
        if (!activeProfile) {
            console.error(`JustCode Error: Active profile with ID ${activeProfileId} not found.`);
            return;
        }

        let result;

        if (command === "get-context-shortcut") {
            console.log(`Executing 'getContext' for profile: ${activeProfile.name}`);
            result = await getContext(activeProfile, true);
        } else if (command === "deploy-code-shortcut") {
            console.log(`Executing 'deployCode' for profile: ${activeProfile.name}`);
            result = await deployCode(activeProfile, true);
        }

        if (result) {
            // Update the profile's lastMessage in storage so the popup is in sync.
            const profileToUpdate = profiles.find(p => p.id === activeProfileId);
            if (profileToUpdate) {
                profileToUpdate.lastMessage = { text: result.text, type: result.type };
                saveData(profiles, activeProfileId, archivedProfiles);
            }
            // Show notification on the active page
            await showNotification(result);
        }

        // Attempt to close the popup if it's open.
        chrome.runtime.sendMessage({ type: "closePopupOnShortcut" }).catch(() => {});
    });
});