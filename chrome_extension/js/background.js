import { loadData, saveData } from './storage.js';
import { getContext } from './get_context.js';
import { deployCode } from './deploy_code.js';
import { undoCode, redoCode } from './undo_redo.js';

// --- Default settings are now managed here as a single source of truth ---
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

// --- Function to load settings and ensure defaults are set ---
async function loadAndEnsureSettings() {
    return new Promise(resolve => {
        chrome.storage.local.get(Object.keys(AppSettings), (storedSettings) => {
            const finalSettings = { ...AppSettings, ...storedSettings };
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
        const results = await chrome.scripting.executeScript({
            target: { tabId: tabId },
            func: () => window.justCodeContentLoaded,
        });
        
        if (results && results[0] && results[0].result) {
            return; // Already injected
        }

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
        // This is expected on special pages like chrome://extensions where scripts can't be injected.
    }
}

async function executeCommand(command, hostname) {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tab || !tab.id) return;

    await ensureContentScript(tab.id);
    
    let actionFunc, progressText;
    switch(command) {
        case "get-context-shortcut": actionFunc = getContext; progressText = 'Getting context...'; break;
        case "deploy-code-shortcut": actionFunc = deployCode; progressText = 'Deploying code...'; break;
        case "undo-code-shortcut": actionFunc = undoCode; progressText = 'Undoing last action...'; break;
        case "redo-code-shortcut": actionFunc = redoCode; progressText = 'Redoing last undo...'; break;
        default: return;
    }

    const notificationId = `justcode-action-${Date.now()}`;
    
    chrome.tabs.sendMessage(tab.id, { type: 'showNotificationOnPage', notificationId, text: progressText, messageType: 'info', showSpinner: true, fromShortcut: true })
        .catch(err => console.log("Could not send initial notification.", err.message));

    loadData(async (profiles, activeProfileId, archivedProfiles) => {
        const activeProfile = profiles.find(p => p.id === activeProfileId);
        if (activeProfile) {
            const result = await actionFunc(activeProfile, true, hostname); // Pass hostname
            const messageTextToShow = result?.text || 'Action completed.';
            const messageTypeToShow = result?.type || 'info';
            
            activeProfile.lastMessage = { text: messageTextToShow, type: messageTypeToShow };
            saveData(profiles, activeProfileId, archivedProfiles);

            chrome.tabs.sendMessage(tab.id, { type: 'showNotificationOnPage', notificationId, text: messageTextToShow, messageType: messageTypeToShow, showSpinner: false, fromShortcut: true })
                .catch(err => console.log("Could not send final notification.", err.message));
        } else {
            chrome.tabs.sendMessage(tab.id, { type: 'showNotificationOnPage', notificationId, text: 'Error: Active profile not found.', messageType: 'error', showSpinner: false, fromShortcut: true })
                .catch(err => console.log("Could not send error notification.", err.message));
        }
    });
}

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'execute-command' && message.command) {
        executeCommand(message.command, message.hostname); // Receive hostname
        sendResponse({status: "Command received"});
        return true;
    }
    // Content script is announcing it's ready. Respond with settings.
    if (message.type === 'justcode-content-script-ready') {
        loadAndEnsureSettings().then(settings => {
            sendResponse({status: 'success', settings: settings});
        });
        return true; // Indicates async response
    }
});

// On first install or update, inject into all existing tabs.
// The content script will then call the 'justcode-content-script-ready' message to get its settings.
chrome.runtime.onInstalled.addListener(async (details) => {
    if (details.reason === 'install' || details.reason === 'update') {
        const tabs = await chrome.tabs.query({url: ["http://*/*", "https://*/*"]});
        for (const tab of tabs) {
            if (tab.id) {
                await ensureContentScript(tab.id);
            }
        }
    }
});