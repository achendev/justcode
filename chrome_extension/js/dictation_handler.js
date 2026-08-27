// Background coordinator for ChatGPT Dictation
let dedicatedDictationTabId = null;

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

export async function handleDictationStart(sendNotification) {
    const tab = await resolveDictationTab();
    if (!tab) {
        sendNotification("Dictation: No ChatGPT tab found. Please open chatgpt.com.", "error");
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
        } else if (res && res.error) {
            sendNotification("Dictation error: " + res.error, "error", false);
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
            const preview = transcript.length > 40 ? transcript.substring(0, 40) + "..." : transcript;
            sendNotification(`✓ Transcribed: "${preview}"`, "success", false);
            sendResultToWs(transcript);
        } else {
            sendNotification("Dictation: No speech captured.", "info", false);
        }
    } catch (e) {
        console.error("JustCode Dictation Stop Error:", e);
        sendNotification("Dictation error: " + e.message, "error", false);
    }
}