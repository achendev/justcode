import { loadData, saveData } from './storage.js';
import { getContext } from './get_context.js';

// Listen for the command defined in manifest.json
chrome.commands.onCommand.addListener(async (command) => {
    console.log(`Command received: ${command}`);
    if (command === "get-context-shortcut") {
        // Load all data to find the active profile
        loadData(async (profiles, activeProfileId, archivedProfiles) => {
            if (!activeProfileId || !profiles || profiles.length === 0) {
                console.error("JustCode: No active profile found to get context from shortcut.");
                return;
            }
            
            const activeProfile = profiles.find(p => p.id === activeProfileId);
            
            if (activeProfile) {
                console.log(`Executing 'getContext' for profile: ${activeProfile.name}`);
                
                // Call the main getContext function and get the result message
                const result = await getContext(activeProfile, true);
                
                // Update the profile's lastMessage in storage so the popup is in sync.
                const profileToUpdate = profiles.find(p => p.id === activeProfileId);
                if (profileToUpdate && result && result.text) {
                    profileToUpdate.lastMessage = { text: result.text, type: result.type };
                    saveData(profiles, activeProfileId, archivedProfiles);
                }
                
                // If there's a result message, send it to the content script of the active tab
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
    }
});