/**
 * Extracts the deployment script from either the clipboard or the active LLM page.
 * This function acts as a dispatcher, choosing the correct extraction strategy
 * based on the active tab's URL.
 * @param {object} profile - The active user profile.
 * @param {boolean} isDetached - Whether the popup is in a detached window.
 * @returns {Promise<string|null>} The deployment script text, or null if not found.
 */
export async function extractCodeToDeploy(profile, isDetached) {
    if (profile.deployCodeSource === 'clipboard' || isDetached) {
        return await navigator.clipboard.readText();
    }
    
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) {
        console.error("JustCode: Could not find active tab to extract code from.");
        return null;
    }

    const url = new URL(tab.url);
    const hostname = url.hostname;
    let extractFunc;

    if (hostname.includes('aistudio.google.com') || hostname.includes('gemini.google.com')) {
        const { extractGeminiAnswer } = await import('./answer_extractors/gemini.js');
        extractFunc = extractGeminiAnswer;
    } else if (hostname.includes('chatgpt.com')) {
        const { extractChatGPTAnswer } = await import('./answer_extractors/chatgpt.js');
        extractFunc = extractChatGPTAnswer;
    } else {
        const { extractFallbackAnswer } = await import('./answer_extractors/fallback.js');
        extractFunc = extractFallbackAnswer;
    }

    const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: extractFunc,
        args: [profile.deployFromFullAnswer]
    });

    return results[0]?.result || null;
}