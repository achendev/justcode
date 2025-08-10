import { loadData, saveData } from './storage.js';
import { getContext } from './get_context.js';
import { deployCode } from './deploy_code.js';
import { undoCode, redoCode } from './undo_redo.js';

const defaultShortcutDomains = 'aistudio.google.com,grok.com,x.com,perplexity.ai,gemini.google.com,chatgpt.com';

/**
 * Ensures the content script is injected and ready in the target tab.
 * This is crucial to make sure notifications work even after an extension reload.
 * @param {number} tabId The ID of the tab to inject the script into.
 */
async function ensureContentScript(tabId) {
    try {
        await chrome.scripting.executeScript({
            target: { tabId: tabId },
            files: ['js/content_script.js'],
        });
    } catch (err) {
        console.log(`JustCode: Could not inject content script into tab ${tabId}: ${err.message}. This can happen on special pages.`);
    }
}

// This is the main logic function that gets called by the listener.
async function executeCommand(command) {
    // Check if the specific shortcut is enabled.
    const shortcutSettings = await chrome.storage.local.get({
        isGetContextShortcutEnabled: true,
        isDeployCodeShortcutEnabled: true,
        isUndoShortcutEnabled: false,
        isRedoShortcutEnabled: false,
    });

    const commandToSettingMap = {
        'get-context-shortcut': 'isGetContextShortcutEnabled',
        'deploy-code-shortcut': 'isDeployCodeShortcutEnabled',
        'undo-code-shortcut': 'isUndoShortcutEnabled',
        'redo-code-shortcut': 'isRedoShortcutEnabled',
    };

    const settingKey = commandToSettingMap[command];
    if (!settingKey || !shortcutSettings[settingKey]) {
        console.log(`JustCode: Shortcut for '${command}' is disabled in settings. Command ignored.`);
        return;
    }

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
            return;
        }
    } catch (e) {
        console.log(`JustCode: Shortcut ignored. Could not validate URL: ${tab.url}. Error: ${e.message}`);
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
            showSpinner: true
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
            
            if (result && result.text) {
                try {
                    await chrome.tabs.sendMessage(tab.id, {
                        type: 'showNotificationOnPage',
                        notificationId: notificationId,
                        text: result.text,
                        messageType: result.type,
                        showSpinner: false
                    });
                } catch (err) {
                    console.log("Could not send final notification to content script.", err);
                }
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
                    showSpinner: false
                });
            } catch (err) {
                console.log("Could not update notification with error message.", err);
            }
        }
    });
}

chrome.commands.onCommand.addListener(async (command) => {
    console.log(`Command received: ${command}`);
    await executeCommand(command);
});