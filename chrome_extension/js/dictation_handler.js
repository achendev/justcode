// Background coordinator for ChatGPT Dictation
let dedicatedDictationTabId = null;
let previousActiveTabId = null;
let previousActiveWindowId = null;

export function setDedicatedDictationTab(tabId) {
    dedicatedDictationTabId = tabId;
    console.log(`JustCode: Dedicated ChatGPT dictation tab set to ID ${tabId}`);
}

export async function resolveDictationTab() {
    if (dedicatedDictationTabId) {
        try {
            const tab = await chrome.tabs.get(dedicatedDictationTabId);
            if (tab && tab.url && tab.url.includes('chatgpt.com')) {
                return tab;
            }
        } catch (e) {
            dedicatedDictationTabId = null;
        }
    }

    const tabs = await chrome.tabs.query({ url: "*://*.chatgpt.com/*" });
    if (tabs.length > 0) {
        dedicatedDictationTabId = tabs[0].id;
        return tabs[0];
    }

    return null;
}

export async function ensureDictationScriptInjected(tabId) {
    try {
        await chrome.scripting.executeScript({
            target: { tabId: tabId },
            files: ['js/content_script/chatgpt_dictation.js']
        });
    } catch (e) {
        console.error("JustCode: Could not inject dictation script:", e);
    }
}

export async function handleDictationStart(sendNotification, options = {}) {
    const targetTab = await resolveDictationTab();
    if (!targetTab) {
        sendNotification("Dictation: No ChatGPT tab found. Please open chatgpt.com.", "error", false);
        return;
    }

    // Save whichever Chrome tab was active prior to dictation
    try {
        const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        if (activeTab && activeTab.id !== targetTab.id) {
            previousActiveTabId = activeTab.id;
            previousActiveWindowId = activeTab.windowId;
        } else {
            previousActiveTabId = null;
            previousActiveWindowId = null;
        }
    } catch (e) {
        previousActiveTabId = null;
        previousActiveWindowId = null;
    }

    // If Foreground Mode: Switch to ChatGPT tab and focus window immediately on start
    if (options.switchOnStart) {
        try {
            await chrome.tabs.update(targetTab.id, { active: true });
            if (targetTab.windowId) {
                await chrome.windows.update(targetTab.windowId, { focused: true });
            }
        } catch (e) {}
    }

    await ensureDictationScriptInjected(targetTab.id);

    try {
        const results = await chrome.scripting.executeScript({
            target: { tabId: targetTab.id },
            func: async () => {
                if (window.justCodeChatGPTDictation) {
                    return await window.justCodeChatGPTDictation.start();
                }
                return { success: false, error: "Script not loaded" };
            }
        });
        const res = results[0]?.result;
        if (res && res.success) {
            sendNotification("🎙️ Listening...", "info", true);
        } else if (res && res.error) {
            sendNotification("Dictation error: " + res.error, "error", false);
        }
    } catch (e) {
        console.error("JustCode Dictation Start Error:", e);
    }
}

export async function handleDictationStop(sendResultToWs, sendNotification) {
    const targetTab = await resolveDictationTab();
    if (!targetTab) return;

    // Bring ChatGPT tab to active focus on release to unthrottle transcription & DOM event dispatch
    try {
        await chrome.tabs.update(targetTab.id, { active: true });
        if (targetTab.windowId) {
            await chrome.windows.update(targetTab.windowId, { focused: true });
        }
    } catch (e) {}

    // Allow 40ms for window focus event to settle in ChatGPT
    await new Promise(r => setTimeout(r, 40));

    try {
        const results = await chrome.scripting.executeScript({
            target: { tabId: targetTab.id },
            func: async () => {
                if (window.justCodeChatGPTDictation) {
                    return await window.justCodeChatGPTDictation.stop();
                }
                return { success: false, text: "" };
            }
        });

        const res = results[0]?.result;
        const transcript = res?.text || "";

        // Restore the original Chrome tab (e.g. Google or any other site) if dictation began on another tab
        if (previousActiveTabId) {
            try {
                await chrome.tabs.update(previousActiveTabId, { active: true });
                if (previousActiveWindowId) {
                    await chrome.windows.update(previousActiveWindowId, { focused: true });
                }
            } catch (e) {}
            previousActiveTabId = null;
            previousActiveWindowId = null;
        }

        if (transcript) {
            sendNotification("✓ Dictated", "success", false);
            sendResultToWs(transcript);
        } else {
            sendNotification("Dictation: No speech captured.", "info", false);
        }
    } catch (e) {
        console.error("JustCode Dictation Stop Error:", e);
        if (previousActiveTabId) {
            try {
                await chrome.tabs.update(previousActiveTabId, { active: true });
            } catch (err) {}
            previousActiveTabId = null;
            previousActiveWindowId = null;
        }
        sendNotification("Dictation error: " + e.message, "error", false);
    }
}