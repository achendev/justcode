import { saveData, loadData } from './storage.js';
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

// Helper: Sleep for X milliseconds
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Update the profile's last message in storage (background compatible).
 */
async function updateProfileStatus(profileId, text, type) {
    return new Promise(resolve => {
        loadData((profiles, activeProfileId, archivedProfiles) => {
            const profile = profiles.find(p => p.id === profileId);
            if (profile) {
                profile.lastMessage = { text, type };
                saveData(profiles, activeProfileId, archivedProfiles, resolve);
            } else {
                resolve();
            }
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
    const tabs = await chrome.tabs.query({ url: ["http://*/*", "https://*/*"] });
    for (const tab of tabs) {
        if (tab.id) {
            await ensureContentScript(tab.id);
            injectShortcutListener(tab.id);
        }
    }
}

async function handleAutoDeployTrigger() {
    console.log("JustCode: Auto-deploy triggered (Background Service Worker).");
    
    // 1. Get the active tab to send notifications
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    
    // Use a single stable ID for the whole sequence so messages update in-place
    // rather than stacking up on the screen.
    const notificationId = 'justcode-autodeploy-active-sequence';

    // Helper to send notification if tab exists
    const notify = (text, type = 'info', spinner = false) => {
        if (tab && tab.id) {
            chrome.tabs.sendMessage(tab.id, { 
                type: 'showNotificationOnPage', 
                notificationId, 
                text, 
                messageType: type, 
                showSpinner: spinner 
            }).catch(() => {});
        }
    };

    // 2. Load Profile
    loadData(async (profiles, activeProfileId, archivedProfiles) => {
        const activeProfile = profiles.find(p => p.id === activeProfileId);
        
        if (!activeProfile || !activeProfile.autoDeploy) {
            console.log("JustCode: Auto-deploy ignored (disabled or no profile).");
            return;
        }

        // 3. Initial Delay (Rendering time)
        notify("Auto-deploy: Waiting for rendering...", "info", true);
        await sleep(1000); 

        // 4. Retry Loop
        const maxRetries = 3;
        const retryDelay = 5000;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                notify(`Auto-deploying... (Attempt ${attempt}/${maxRetries})`, "info", true);
                
                // We pass the tab hostname if available for context logic
                const hostname = tab && tab.url ? new URL(tab.url).hostname : null;
                
                const result = await deployCode(activeProfile, true, hostname); // fromShortcut=true suppresses some UI updates inside
                
                // If we get here without error, it succeeded
                await updateProfileStatus(activeProfile.id, result.text + " (Auto)", result.type);
                // Spinner=false will trigger the auto-hide timer in notification_manager.js
                notify(result.text + " (Auto)", result.type, false);
                return; // Exit loop on success

            } catch (e) {
                const isScriptNotFoundError = e.message && (
                    e.message.includes("No valid deploy script") || 
                    e.message.includes("Could not find target")
                );

                if (isScriptNotFoundError) {
                    console.log(`JustCode: Auto-deploy attempt ${attempt} failed (No script found).`);
                    
                    if (attempt < maxRetries) {
                        notify(`No script found yet. Retrying in ${retryDelay/1000}s...`, "warning", true);
                        await sleep(retryDelay);
                        continue; // Retry loop
                    } else {
                        // Final failure for script not found
                        const msg = "Auto-deploy failed: No script found after retries.";
                        await updateProfileStatus(activeProfile.id, msg, "error");
                        notify(msg, "error", false);
                    }
                } else {
                    // It was a real error (filesystem, server, etc), do not retry
                    console.error("JustCode: Auto-deploy fatal error:", e);
                    const msg = "Auto-deploy failed: " + e.message;
                    await updateProfileStatus(activeProfile.id, msg, "error");
                    notify(msg, "error", false);
                    break; 
                }
            }
        }
    });
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
        let activeProfileId = data.activeProfileId; 
        const tabProfileMap = data.tabProfileMap || {};

        let profileToUseId = activeProfileId;

        if (settings.rememberTabProfile) {
            const profileIdForTab = tabProfileMap[tab.id];
            if (profileIdForTab && profiles.some(p => p.id === profileIdForTab)) {
                profileToUseId = profileIdForTab;
            }
        }
        
        if (command === 'get-context-shortcut' && settings.rememberTabProfile) {
            tabProfileMap[tab.id] = profileToUseId;
            await chrome.storage.local.set({ tabProfileMap });
        }
        
        const profileToUse = profiles.find(p => p.id === profileToUseId);

        if (profileToUse) {
            const result = await actionFunc(profileToUse, true, hostname);
            const messageTextToShow = result?.text || 'Action completed.';
            const messageTypeToShow = result?.type || 'info';
            
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

// Listen for messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // 1. Direct Command execution
    if (message.type === 'execute-command' && message.command) {
        executeCommand(message.command, message.hostname);
        sendResponse({status: "Command received"});
        return true;
    }

    // 2. Verified Command Execution
    if (message.type === 'try-execute-command' && message.command) {
        loadAndEnsureSettings().then(settings => {
            const allowedDomains = (settings.shortcutDomains || '').split(',').map(d => d.trim().toLowerCase()).filter(Boolean);
            if (!allowedDomains.includes(message.hostname)) {
                return;
            }

            let isEnabled = false;
            switch(message.command) {
                case 'get-context-shortcut': isEnabled = settings.isGetContextShortcutEnabled; break;
                case 'deploy-code-shortcut': isEnabled = settings.isDeployCodeShortcutEnabled; break;
                case 'undo-code-shortcut': isEnabled = settings.isUndoShortcutEnabled; break;
                case 'redo-code-shortcut': isEnabled = settings.isRedoShortcutEnabled; break;
                case 'apply-replacements-shortcut': isEnabled = settings.isApplyReplacementsShortcutEnabled; break;
            }

            if (isEnabled) {
                executeCommand(message.command, message.hostname);
            }
        });
        return true;
    }

    // 3. Auto Deploy Trigger (From Content Script)
    if (message.type === 'auto_deploy_trigger') {
        handleAutoDeployTrigger();
        return true;
    }
    
    // 4. Content script ready signal
    if (message.type === 'justcode-content-script-ready') {
        loadAndEnsureSettings().then(settings => {
            sendResponse({status: 'success', settings: settings});
            if (sender.tab?.id) {
                injectShortcutListener(sender.tab.id);
            }
        });
        return true; 
    }
});


// On first install or update
chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
        chrome.tabs.create({ url: chrome.runtime.getURL('welcome/welcome.html') });
    }
    if (details.reason === 'install' || details.reason === 'update') {
        initializeAllTabs();
    }
});
chrome.runtime.onStartup.addListener(() => {
    initializeAllTabs();
});

// Immediately attempt to initialize all tabs
initializeAllTabs();

// Clean up tab-profile associations
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