import { loadData, saveData } from './storage.js';
import { getContext } from './get_context.js';
import { deployCode } from './deploy_code.js';

// Listen for the command defined in manifest.json
chrome.commands.onCommand.addListener(async (command) => {
    console.log(`Command received: ${command}`);

    const handleCommand = async (actionFunc, fromShortcut) => {
        loadData(async (profiles, activeProfileId, archivedProfiles) => {
            if (!activeProfileId || !profiles || profiles.length === 0) {
                console.error(`JustCode: No active profile found for command '${command}'.`);
                return;
            }
            
            const activeProfile = profiles.find(p => p.id === activeProfileId);
            
            if (activeProfile) {
                console.log(`Executing '${command}' for profile: ${activeProfile.name}`);
                
                const result = await actionFunc(activeProfile, fromShortcut);
                
                const profileToUpdate = profiles.find(p => p.id === activeProfileId);
                if (profileToUpdate && result && result.text) {
                    profileToUpdate.lastMessage = { text: result.text, type: result.type };
                    saveData(profiles, activeProfileId, archivedProfiles);
                }

                // Close the popup if it's open (only for get-context)
                if (command === 'get-context-shortcut') {
                    chrome.runtime.sendMessage({ type: "closePopupOnShortcut" }).catch(() => {});
                }
                
                if (result && result.text) {
                    try {
                        const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
                        if (tab) {
                            chrome.tabs.sendMessage(tab.id, {
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
    };

    if (command === "get-context-shortcut") {
        handleCommand(getContext, true);
    } else if (command === "deploy-code-shortcut") {
        handleCommand(deployCode, true);
    }
});