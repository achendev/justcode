/**
 * Writes text to the clipboard, handling both popup and background script contexts.
 * @param {string} text The text to write.
 */
export async function writeToClipboard(text) {
    // If we're in a document context (like the popup), use the navigator directly.
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
        return navigator.clipboard.writeText(text);
    }
    
    // If we're in a background context (service worker), we need to inject a script
    // into the active tab to access the clipboard.
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (tab) {
        await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: (textToCopy) => navigator.clipboard.writeText(textToCopy),
            args: [text],
        });
    } else {
        throw new Error("No active tab found to write to clipboard.");
    }
}


async function readFromClipboardInBackground() {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tab) {
        console.error("JustCode: No active tab found to read clipboard from.");
        return null;
    }
    try {
        const results = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => navigator.clipboard.readText(),
        });
        if (chrome.runtime.lastError) {
            console.error("JustCode: Error reading clipboard:", chrome.runtime.lastError.message);
            return null;
        }
        return results[0]?.result || null;
    } catch (e) {
        console.error("JustCode: Exception while trying to read from clipboard.", e);
        return null;
    }
}

/**
 * Reads text from the clipboard, handling both popup and background script contexts.
 * @returns {Promise<string|null>} The clipboard text, or null if an error occurs.
 */
export async function readFromClipboard() {
    // If we're in a document context (like the popup), use the navigator directly.
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
        return await navigator.clipboard.readText();
    }
    // Otherwise, we're in the background script and need the injection method.
    return await readFromClipboardInBackground();
}