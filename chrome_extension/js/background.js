import { saveData } from './storage.js';
import { getContext } from './get_context.js';
import { deployCode } from './deploy_code.js';
import { undoCode, redoCode } from './undo_redo.js';
import { applyReplacementsAndPaste } from './apply_replacements.js';
import { injectShortcutListener } from './background/shortcuts.js';

// --- Default settings are now managed here as a single source of truth ---
const AppSettings = {
    shortcutDomains: 'aistudio.google.com,grok.com,x.com,www.perplexity.ai,gemini.google.com,chatgpt.com,claude.ai',
    notificationPosition: 'bottom-left',
    notificationTimeout: 4,
    showNotificationProgressBar: true,
    isGetContextShortcutEnabled: true,
    isDeployCodeShortcutEnabled: true,
    isUndoShortcutEnabled: true,
    isRedoShortcutEnabled: true,
    isApplyReplacementsShortcutEnabled: true,
    rememberTabProfile: true,
    splitContextBySize: false,
    contextSplitSize: 450
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
 * Ensures the base content script (for notifications) is injected into a tab.
 * @param {number} tabId The ID of the tab to inject the script into.
 */
async function ensureContentScript(tabId) {
    try {
        const results = await chrome.scripting.executeScript({
            target: { tabId: tabId },
            func: () => window.justCodeContentLoaded,
        });
        
        if (results && results && results.result) {
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
        case "apply-replacements-shortcut": actionFunc = applyReplacementsAndPaste; progressText = 'Applying replacements...'; break;
        default: return;
    }

    const notificationId = `justcode-action-${Date.now()}`;
    
    chrome.tabs.sendMessage(tab.id, { type: 'showNotificationOnPage', notificationId, text: progressText, messageType: 'info', showSpinner: true, fromShortcut: true })
        .catch(err => console.log("Could not send initial notification.", err.message));

    try {
        const settings = await chrome.storage.local.get({ rememberTabProfile: true });
        const data = await chrome.storage.local.get(['profiles', 'activeProfileId', 'archivedProfiles', 'tabProfileMap']);

        const profiles = data.profiles || [];
        const archivedProfiles = data.archivedProfiles || [];
        let activeProfileId = data.activeProfileId; // This is the global active profile
        const tabProfileMap = data.tabProfileMap || {};

        let profileToUseId = activeProfileId;

        if (settings.rememberTabProfile) {
            const profileIdForTab = tabProfileMap[tab.id];
            if (profileIdForTab && profiles.some(p => p.id === profileIdForTab)) {
                profileToUseId = profileIdForTab;
            }
        }
        
        // If getContext is used, update the association for the current tab.
        // It uses the profile determined above (either tab-specific or global default).
        if (command === 'get-context-shortcut' && settings.rememberTabProfile) {
            tabProfileMap[tab.id] = profileToUseId;
            await chrome.storage.local.set({ tabProfileMap });
        }
        
        const profileToUse = profiles.find(p => p.id === profileToUseId);

        if (profileToUse) {
            const result = await actionFunc(profileToUse, true, hostname);
            const messageTextToShow = result?.text || 'Action completed.';
            const messageTypeToShow = result?.type || 'info';
            
            // Update the profile's last message and save all data.
            // Note: we save the original global activeProfileId, not the one we used for this action.
            const profileInArray = profiles.find(p => p.id === profileToUseId);
            if (profileInArray) {
                profileInArray.lastMessage = { text: messageTextToShow, type: messageTypeToShow };
            }
            saveData(profiles, activeProfileId, archivedProfiles);

            chrome.tabs.sendMessage(tab.id, { type: 'showNotificationOnPage', notificationId, text: messageTextToShow, messageType: messageTypeToShow, showSpinner: false, fromShortcut: true })
                .catch(err => console.log("Could not send final notification.", err.message));
        } else {
            throw new Error('Active profile not found.');
        }
    } catch (error) {
        console.error("JustCode shortcut error:", error);
        chrome.tabs.sendMessage(tab.id, { type: 'showNotificationOnPage', notificationId, text: `Error: ${error.message}`, messageType: 'error', showSpinner: false, fromShortcut: true })
                .catch(err => console.log("Could not send error notification.", err.message));
    }
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
    if (details.reason === 'install') {
        // Open the welcome page on first install
        chrome.tabs.create({ url: chrome.runtime.getURL('welcome/welcome.html') });
    }
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

// Clean up tab-profile associations for closed tabs.
chrome.tabs.onRemoved.addListener(async (tabId, removeInfo) => {
    const settings = await chrome.storage.local.get({ rememberTabProfile: true });
    if (settings.rememberTabProfile) {
        const data = await chrome.storage.local.get({ tabProfileMap: {} });
        const tabProfileMap = data.tabProfileMap;
        if (tabProfileMap[tabId]) {
            delete tabProfileMap[tabId];
            await chrome.storage.local.set({ tabProfileMap });
            console.log(`JustCode: Cleaned up tab-profile association for closed tab ${tabId}`);
        }
    }
});