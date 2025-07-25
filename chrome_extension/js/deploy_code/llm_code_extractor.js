/**
 * Extracts the deployment script from either the clipboard or the active LLM page.
 * @param {object} profile - The active user profile.
 * @param {boolean} isDetached - Whether the popup is in a detached window.
 * @returns {Promise<string|null>} The deployment script text, or null if not found.
 */
export async function extractCodeToDeploy(profile, isDetached) {
    if (profile.deployFromClipboard || isDetached) {
        return await navigator.clipboard.readText();
    }
    
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) {
        console.error("JustCode: Could not find active tab to extract code from.");
        return null;
    }

    const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
            // Strategy 1: Find `pre > code`. This is the most reliable selector for code blocks
            // and avoids grabbing inline `<code>` tags. It works well for Perplexity, ChatGPT, etc.
            const codeBlocks = Array.from(document.querySelectorAll('pre code'));
            if (codeBlocks.length > 0) {
                return codeBlocks[codeBlocks.length - 1].innerText;
            }
            
            // Fallback 1: If no `pre > code` is found, look for just the last `<pre>` tag.
            const pres = Array.from(document.querySelectorAll('pre'));
            if (pres.length > 0) {
                return pres[pres.length - 1].innerText;
            }

            // Fallback 2: Find the last `<code>` element anywhere. This works for sites like Gemini
            // which may not wrap code blocks in `<pre>`.
            const allCode = Array.from(document.querySelectorAll('code'));
            if (allCode.length > 0) {
                return allCode[allCode.length - 1].innerText;
            }

            return null;
        }
    });

    return results[0]?.result || null;
}