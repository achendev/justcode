import { loadData, saveData } from './storage.js';
import { getContext } from './get_context.js';
import { deployCode } from './deploy_code.js';

const defaultShortcutDomains = 'aistudio.google.com,grok.com,x.com,perplexity.ai,gemini.google.com,chatgpt.com';

// This is the main logic function that gets called by the listener.
async function executeCommand(command) {
    // --- Domain Check ---
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tab || !tab.url) {
        console.log("JustCode: Shortcut ignored. No active tab with a URL found.");
        return;
    }

    try {
        const settings = await chrome.storage.local.get({ shortcutDomains: defaultShortcutDomains });
        const allowedDomains = settings.shortcutDomains.split(',').map(d => d.trim().toLowerCase()).filter(Boolean);
        const currentHostname = new URL(tab.url).hostname;

        if (!allowedDomains.includes(currentHostname)) {
            console.log(`JustCode: Shortcut ignored on '${currentHostname}'. Domain not in the allowed list.`);
            return; // IMPORTANT: Stop execution if domain doesn't match
        }
    } catch (e) {
        // This might happen if the URL is not valid, e.g., "chrome://...".
        console.log(`JustCode: Shortcut ignored. Could not validate URL: ${tab.url}. Error: ${e.message}`);
        return;
    }
    // --- End Domain Check ---

    const actionFunc = command === "get-context-shortcut" ? getContext : (command === "deploy-code-shortcut" ? deployCode : null);
    if (!actionFunc) return;

    loadData(async (profiles, activeProfileId, archivedProfiles) => {
        if (!activeProfileId || !profiles || profiles.length === 0) {
            console.error(`JustCode: No active profile found for command '${command}'.`);
            return;
        }
        
        const activeProfile = profiles.find(p => p.id === activeProfileId);
        
        if (activeProfile) {
            console.log(`Executing '${command}' for profile: ${activeProfile.name}`);
            
            const result = await actionFunc(activeProfile, true); // fromShortcut = true
            
            const profileToUpdate = profiles.find(p => p.id === activeProfileId);
            if (profileToUpdate && result && result.text) {
                profileToUpdate.lastMessage = { text: result.text, type: result.type };
                saveData(profiles, activeProfileId, archivedProfiles);
            }

            if (command === 'get-context-shortcut') {
                chrome.runtime.sendMessage({ type: "closePopupOnShortcut" }).catch(() => {});
            }
            
            if (result && result.text) {
                try {
                    const [currentTarget] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
                    if (currentTarget) {
                        chrome.tabs.sendMessage(currentTarget.id, {
                            type: 'showNotificationOnPage',
                            text: result.text,
                            messageType: result.type
                        });
                    }
                } catch (err) {
                    console.log("Could not send message to content script. It might not be injected or the page may be protected.", err);
                }
            }
        } else {
             console.error(`JustCode: Active profile with ID ${activeProfileId} not found.`);
        }
    });
}

// Listen for the command defined in manifest.json
chrome.commands.onCommand.addListener(async (command) => {
    console.log(`Command received: ${command}`);
    await executeCommand(command);
});