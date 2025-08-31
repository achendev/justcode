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