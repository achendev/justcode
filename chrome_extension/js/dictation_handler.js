// Extension background handler for coordinating ChatGPT Dictation tabs
let dedicatedDictationTabId = null;

export function setDedicatedDictationTab(tabId) {
    dedicatedDictationTabId = tabId;
    console.log(`JustCode: Set dedicated ChatGPT dictation tab to ID ${tabId}`);
}

export function getDedicatedDictationTab() {
    return dedicatedDictationTabId;
}

export async function resolveDictationTab() {
    // 1. Check if dedicated tab exists and is still valid
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

    // 2. Query any open ChatGPT tab
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

export async function handleDictationStart(sendNotification) {
    const tab = await resolveDictationTab();
    if (!tab) {
        console.warn("JustCode Dictation: No ChatGPT tab open.");
        sendNotification("Dictation: No ChatGPT tab found. Open chatgpt.com first.", "error");
        return;
    }

    await ensureDictationScriptInjected(tab.id);

    try {
        const results = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
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
        }
    } catch (e) {
        console.error("JustCode Dictation Start Error:", e);
    }
}

export async function handleDictationStop(sendResultToWs, sendNotification) {
    const tab = await resolveDictationTab();
    if (!tab) return;

    sendNotification("⏳ Transcribing...", "info", true);

    try {
        const results = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: async () => {
                if (window.justCodeChatGPTDictation) {
                    return await window.justCodeChatGPTDictation.stop();
                }
                return { success: false, text: "" };
            }
        });

        const res = results[0]?.result;
        const transcript = res?.text || "";

        if (transcript) {
            sendNotification(`✓ Dictated: "${transcript.substring(0, 45)}${transcript.length > 45 ? '...' : ''}"`, "success", false);
            sendResultToWs(transcript);
        } else {
            sendNotification("Dictation finished (no text captured).", "info", false);
        }
    } catch (e) {
        console.error("JustCode Dictation Stop Error:", e);
        sendNotification("Dictation error: " + e.message, "error", false);
    }
}