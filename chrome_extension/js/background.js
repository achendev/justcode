import { loadData, saveData } from './storage.js';
import { getContext } from './get_context.js';
import { deployCode } from './deploy_code.js';
import { undoCode, redoCode } from './undo_redo.js';

// --- NEW: Default settings are now managed in the background script ---
const AppSettings = {
    shortcutDomains: 'aistudio.google.com,grok.com,x.com,perplexity.ai,gemini.google.com,chatgpt.com',
    notificationPosition: 'bottom-left',
    notificationTimeout: 4,
    showNotificationProgressBar: true,
    isGetContextShortcutEnabled: true,
    isDeployCodeShortcutEnabled: true,
    isUndoShortcutEnabled: true,
    isRedoShortcutEnabled: true
};

// --- NEW: Function to load settings and ensure defaults are set ---
async function loadAndEnsureSettings() {
    return new Promise(resolve => {
        chrome.storage.local.get(Object.keys(AppSettings), (storedSettings) => {
            const finalSettings = { ...AppSettings, ...storedSettings };
            // If any setting was missing, we can write it back to be safe, though not strictly necessary with this model.
            resolve(finalSettings);
        });
    });
}

/**
 * Ensures the content script is injected and ready in the target tab.
 * @param {number} tabId The ID of the tab to inject the script into.
 */
async function ensureContentScript(tabId) {
    try {
        await chrome.scripting.executeScript({
            target: { tabId: tabId },
            files: [
                "js/content_script/notification_dom.js",
                "js/content_script/notification_timer.js",
                "js/content_script/notification_manager.js",
                "js/content_script.js"
            ],
        });
    } catch (err) {
        console.log(`JustCode: Could not inject content script into tab ${tabId}: ${err.message}.`);
    }
}

// This is the main logic function that gets called by the listener.
async function executeCommand(command) {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tab || !tab.url) {
        console.log("JustCode: Shortcut ignored. No active tab with a URL found.");
        return;
    }

    await ensureContentScript(tab.id);
    
    let actionFunc, progressText;
    switch(command) {
        case "get-context-shortcut":
            actionFunc = getContext;
            progressText = 'Getting context...';
            break;
        case "deploy-code-shortcut":
            actionFunc = deployCode;
            progressText = 'Deploying code...';
            break;
        case "undo-code-shortcut":
            actionFunc = undoCode;
            progressText = 'Undoing last action...';
            break;
        case "redo-code-shortcut":
            actionFunc = redoCode;
            progressText = 'Redoing last undo...';
            break;
        default:
            return;
    }

    const notificationId = `justcode-action-${Date.now()}`;

    try {
        await chrome.tabs.sendMessage(tab.id, {
            type: 'showNotificationOnPage',
            notificationId: notificationId,
            text: progressText,
            messageType: 'info',
            showSpinner: true,
            fromShortcut: true
        });
    } catch (err) {
        console.log("Could not send initial notification to content script, but the action will proceed.", err);
    }

    loadData(async (profiles, activeProfileId, archivedProfiles) => {
        if (!activeProfileId || !profiles || profiles.length === 0) {
            console.error(`JustCode: No active profile found for command '${command}'.`);
            return;
        }
        
        const activeProfile = profiles.find(p => p.id === activeProfileId);
        
        if (activeProfile) {
            console.log(`Executing '${command}' for profile: ${activeProfile.name}`);
            
            const result = await actionFunc(activeProfile, true); // fromShortcut = true
            
            const messageTextToShow = (result && result.text) ? result.text : 'Action completed with no message.';
            const messageTypeToShow = (result && result.type) ? result.type : 'info';
            
            activeProfile.lastMessage = { text: messageTextToShow, type: messageTypeToShow };
            saveData(profiles, activeProfileId, archivedProfiles);

            try {
                await chrome.tabs.sendMessage(tab.id, {
                    type: 'showNotificationOnPage',
                    notificationId: notificationId,
                    text: messageTextToShow,
                    messageType: messageTypeToShow,
                    showSpinner: false,
                    fromShortcut: true
                });
            } catch (err) {
                console.log("Could not send final notification to content script.", err);
            }

            if (command === 'get-context-shortcut') {
                chrome.runtime.sendMessage({ type: "closePopupOnShortcut" }).catch(() => {});
            }

        } else {
             console.error(`JustCode: Active profile with ID ${activeProfileId} not found.`);
             try {
                await chrome.tabs.sendMessage(tab.id, {
                    type: 'showNotificationOnPage',
                    notificationId: notificationId,
                    text: `Error: Active profile with ID ${activeProfileId} not found.`,
                    messageType: 'error',
                    showSpinner: false,
                    fromShortcut: true
                });
            } catch (err) {
                console.log("Could not update notification with error message.", err);
            }
        }
    });
}

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'execute-command' && message.command) {
        executeCommand(message.command);
        sendResponse({status: "Command received by background script"});
        return true;
    }
    // --- NEW: Handle settings request from content script ---
    if (message.type === 'get-settings') {
        loadAndEnsureSettings().then(settings => {
            sendResponse({status: 'success', settings: settings});
        });
        return true; // Indicates async response
    }
});