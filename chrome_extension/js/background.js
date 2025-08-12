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
 * Injects or replaces the global keyboard shortcut listener in a specific tab.
 * This function is designed to be called whenever the extension starts or is reloaded,
 * ensuring that tabs always have a listener connected to the live service worker.
 * @param {number} tabId The ID of the tab to inject the script into.
 * @param {object} settings The current application settings, which include shortcut configurations.
 */
function injectShortcutListener(tabId, settings) {
    if (!settings) return;

    const listenerFunc = (settings) => {
        const listenerName = 'justCodeGlobalKeyDownHandler';
        
        // If an old listener from a previous extension context exists, remove it.
        if (window[listenerName]) {
            document.removeEventListener('keydown', window[listenerName], true);
        }

        // Define the new listener function.
        window[listenerName] = (event) => {
            // Self-destruct mechanism: If the extension context is lost (e.g., reloaded again),
            // remove the listener to prevent errors and memory leaks.
            if (!chrome.runtime?.id) {
                document.removeEventListener('keydown', window[listenerName], true);
                delete window[listenerName];
                return;
            }
            
            // We only care about the Alt key being pressed, without Ctrl or Meta.
            if (!event.altKey || event.ctrlKey || event.metaKey) {
                return;
            }

            // Check if shortcuts are enabled for the current domain.
            const allowedDomains = (settings.shortcutDomains || '').split(',').map(d => d.trim().toLowerCase()).filter(Boolean);
            if (!allowedDomains.includes(window.location.hostname)) {
                return;
            }

            let command = null;
            switch (event.key) {
                case 'ArrowLeft': 
                    if (settings.isGetContextShortcutEnabled) command = 'get-context-shortcut'; 
                    break;
                case 'ArrowRight': 
                    if (settings.isDeployCodeShortcutEnabled) command = 'deploy-code-shortcut'; 
                    break;
            }
            
            // Use event.code to robustly handle '<' and '>' regardless of Shift key.
            switch (event.code) {
                case 'Comma':
                    if (settings.isUndoShortcutEnabled) command = 'undo-code-shortcut';
                    break;
                case 'Period':
                     if (settings.isRedoShortcutEnabled) command = 'redo-code-shortcut';
                     break;
            }

            if (command) {
                event.preventDefault();
                event.stopPropagation();
                // This `sendMessage` call is valid because it's in a freshly injected script context.
                chrome.runtime.sendMessage({ type: 'execute-command', command: command, hostname: window.location.hostname });
            }
        };

        // Attach the new listener to the document.
        document.addEventListener('keydown', window[listenerName], true);
    };
    
    // Execute the function in the target tab.
    chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: listenerFunc,
        args: [settings]
    }).catch(err => console.log(`JustCode: Could not inject shortcut listener into tab ${tabId}.`, err.message));
}


/**
 * Ensures the base content script (for notifications) is injected into a tab.
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
        // Expected on special pages like chrome://extensions where scripts can't be injected.
    }
}


/**
 * Initializes all compatible tabs by ensuring content scripts and shortcut listeners are active.
 */
async function initializeAllTabs() {
    const settings = await loadAndEnsureSettings();
    const tabs = await chrome.tabs.query({ url: ["http://*/*", "https://*/*"] });
    for (const tab of tabs) {
        if (tab.id) {
            await ensureContentScript(tab.id);
            // After ensuring the base script is there, inject the listener.
            // This is necessary for tabs that already exist during a reload.
            injectShortcutListener(tab.id, settings);
        }
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

// Listen for messages from content scripts or other parts of the extension.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'execute-command' && message.command) {
        executeCommand(message.command, message.hostname);
        sendResponse({status: "Command received"});
        return true;
    }
    
    // A content script is announcing it is ready.
    if (message.type === 'justcode-content-script-ready') {
        loadAndEnsureSettings().then(settings => {
            // Send the latest settings to the content script for notifications.
            sendResponse({status: 'success', settings: settings});
            // Now that the content script is ready, inject the "live" shortcut listener.
            if (sender.tab?.id) {
                injectShortcutListener(sender.tab.id, settings);
            }
        });
        return true; // Indicates an asynchronous response.
    }
});


// On first install or update, and on browser startup, ensure all tabs are initialized.
chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install' || details.reason === 'update') {
        initializeAllTabs();
    }
});
chrome.runtime.onStartup.addListener(() => {
    initializeAllTabs();
});

// Immediately attempt to initialize all tabs when the service worker starts up.
// This is the key part that handles developer reloads.
initializeAllTabs();