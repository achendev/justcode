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

export async function handleDictationStart(options = {}) {
    const debug = options.debug || (() => {});
    const focusContext = options.focusContext || {};
    debug('handler_start_entered');
    const targetTab = await resolveDictationTab();
    if (!targetTab) {
        debug('handler_start_no_chatgpt_tab');
        console.warn("JustCode Dictation: No ChatGPT tab found.");
        return false;
    }
    focusContext.targetTabId = targetTab.id;
    focusContext.targetWindowId = targetTab.windowId;
    debug('handler_target_resolved', { tabId: targetTab.id, windowId: targetTab.windowId });

    // Do not perform any ChatGPT DOM or focus action for an accidental tap.
    // Both modes must survive the hold threshold before activation begins.
    const activationDelayMs = options.activationDelayMs || 0;
    const elapsedSinceKeyDown = options.startedAt
        ? Math.max(0, Date.now() - options.startedAt)
        : 0;
    const remainingDelayMs = Math.max(0, activationDelayMs - elapsedSinceKeyDown);
    if (remainingDelayMs > 0) {
        await new Promise(resolve => setTimeout(resolve, remainingDelayMs));
    }
    if (options.isSessionActive && !options.isSessionActive()) {
        debug('handler_start_cancelled_before_focus');
        return false;
    }

    // Save a Chrome tab only when Chrome itself is the foreground app. When
    // dictation starts in Ghostty/VS Code, the Python daemon owns restoration.
    try {
        const chromeWindow = await chrome.windows.getLastFocused();
        const [activeTab] = chromeWindow?.focused
            ? await chrome.tabs.query({ active: true, windowId: chromeWindow.id })
            : [];
        if (activeTab && activeTab.id !== targetTab.id) {
            focusContext.previousActiveTabId = activeTab.id;
            focusContext.previousActiveWindowId = activeTab.windowId;
        } else {
            focusContext.previousActiveTabId = null;
            focusContext.previousActiveWindowId = null;
        }
    } catch (e) {
        focusContext.previousActiveTabId = null;
        focusContext.previousActiveWindowId = null;
        debug('handler_origin_capture_failed', { error: String(e) });
    }
    debug('handler_origin_captured', {
        previousActiveTabId: focusContext.previousActiveTabId ?? null,
        previousActiveWindowId: focusContext.previousActiveWindowId ?? null
    });

    // If Foreground Mode: Switch to ChatGPT tab and focus window immediately on start
    if (options.switchOnStart) {
        try {
            await chrome.tabs.update(targetTab.id, { active: true });
            if (targetTab.windowId) {
                await chrome.windows.update(targetTab.windowId, { focused: true });
            }
            debug('handler_chatgpt_focused_on_start');
        } catch (e) {
            debug('handler_start_focus_failed', { error: String(e) });
        }
    }

    await ensureDictationScriptInjected(targetTab.id);
    if (options.isSessionActive && !options.isSessionActive()) {
        debug('handler_start_cancelled_after_injection');
        return false;
    }

    try {
        const results = await chrome.scripting.executeScript({
            target: { tabId: targetTab.id },
            func: async (sessionId) => {
                if (window.justCodeChatGPTDictation) {
                    return await window.justCodeChatGPTDictation.start(sessionId);
                }
                return { success: false, error: "Script not loaded" };
            },
            args: [options.sessionId ?? null]
        });
        const res = results[0]?.result;
        const sessionIsActive = !options.isSessionActive || options.isSessionActive();
        debug('handler_driver_start_returned', {
            success: res?.success === true,
            error: res?.error || null,
            sessionStillActive: sessionIsActive
        });
        if (res && res.success) {
            return true;
        } else if (res && res.error && sessionIsActive) {
            console.warn("JustCode Dictation:", res.error);
        }
    } catch (e) {
        debug('handler_driver_start_failed', { error: String(e) });
        console.error("JustCode Dictation Start Error:", e);
    }
    return false;
}

export async function handleDictationStop(sendResultToWs, options = {}) {
    const debug = options.debug || (() => {});
    const focusContext = options.focusContext || {};
    let resultSent = false;
    const sendResultOnce = (text, result = {}) => {
        if (resultSent) return;
        resultSent = true;
        sendResultToWs(text, result);
    };
    debug('handler_stop_entered', { cancel: options.cancel === true, durationMs: options.durationMs || 0 });
    const targetTab = await resolveDictationTab();
    if (!targetTab) {
        debug('handler_stop_no_chatgpt_tab');
        sendResultOnce('', { success: false, error: 'No ChatGPT tab' });
        return;
    }

    // A very fast release may cancel before the start path injected the
    // current driver, so stop must independently guarantee the latest driver.
    await ensureDictationScriptInjected(targetTab.id);
    debug('handler_stop_driver_injected');

    if (options.focusOnStop !== false) {
        // Bring ChatGPT forward to unthrottle transcription and DOM events.
        try {
            await chrome.tabs.update(targetTab.id, { active: true });
            if (targetTab.windowId) {
                await chrome.windows.update(targetTab.windowId, { focused: true });
            }
            debug('handler_chatgpt_focused_on_stop');
        } catch (e) {
            debug('handler_stop_focus_failed', { error: String(e) });
        }

        // Allow the window focus event to settle in ChatGPT.
        await new Promise(r => setTimeout(r, 40));
    }

    try {
        const results = await chrome.scripting.executeScript({
            target: { tabId: targetTab.id },
            func: async (stopOptions) => {
                if (window.justCodeChatGPTDictation) {
                    return await window.justCodeChatGPTDictation.stop(stopOptions);
                }
                return { success: false, text: "" };
            },
            args: [{
                cancel: options.cancel === true,
                durationMs: options.durationMs || 0,
                sessionId: options.sessionId ?? null
            }]
        });

        const res = results[0]?.result;
        const transcript = res?.text || "";
        debug('handler_driver_stop_returned', {
            success: res?.success === true,
            cancelled: res?.cancelled === true,
            superseded: res?.superseded === true,
            textLength: transcript.length,
            error: res?.error || null
        });

        // Restore the original Chrome tab (e.g. Google or any other site) if dictation began on another tab
        if (focusContext.previousActiveTabId) {
            try {
                await chrome.tabs.update(focusContext.previousActiveTabId, { active: true });
                if (focusContext.previousActiveWindowId) {
                    await chrome.windows.update(focusContext.previousActiveWindowId, { focused: true });
                }
                debug('handler_chrome_origin_restored');
            } catch (e) {
                debug('handler_chrome_restore_failed', { error: String(e) });
            }
            focusContext.previousActiveTabId = null;
            focusContext.previousActiveWindowId = null;
        }

        // Always acknowledge completion so the daemon can release this
        // session's captured paste target, including cancel/no-speech cases.
        sendResultOnce(options.cancel ? '' : transcript, res || {});
    } catch (e) {
        debug('handler_driver_stop_failed', { error: String(e) });
        console.error("JustCode Dictation Stop Error:", e);
        if (focusContext.previousActiveTabId) {
            try {
                await chrome.tabs.update(focusContext.previousActiveTabId, { active: true });
                if (focusContext.previousActiveWindowId) {
                    await chrome.windows.update(focusContext.previousActiveWindowId, { focused: true });
                }
            } catch (err) {}
            focusContext.previousActiveTabId = null;
            focusContext.previousActiveWindowId = null;
        }
        // The daemon must always receive a terminal result so it can restore
        // the non-Chrome application even when ChatGPT DOM handling fails.
        sendResultOnce('', { success: false, error: String(e) });
    }
}
