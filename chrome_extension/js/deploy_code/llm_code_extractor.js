/**
 * Extracts the deployment script from either the clipboard or the active LLM page.
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

    const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (shouldExtractFullAnswer) => {
            // This function is always available as a fallback to get just the code.
            const getCodeBlock = () => {
                const codeBlocks = Array.from(document.querySelectorAll('pre code'));
                if (codeBlocks.length > 0) return codeBlocks[codeBlocks.length - 1].innerText;
                
                const pres = Array.from(document.querySelectorAll('pre'));
                if (pres.length > 0) return pres[pres.length - 1].innerText;

                const allCode = Array.from(document.querySelectorAll('code'));
                if (allCode.length > 0) return allCode[allCode.length - 1].innerText;

                return null;
            };

            // If we only want the code block, we're done.
            if (!shouldExtractFullAnswer) {
                return getCodeBlock();
            }

            // --- Logic to get the full answer text from the page ---
            const hostname = window.location.hostname;

            // Specific and robust selector for Google AI Studio / Gemini
            if (hostname.includes('aistudio.google.com') || hostname.includes('gemini.google.com')) {
                // This selector targets the content div inside a turn that is identified as coming from the 'model'.
                // This is based on the user-provided HTML and should be much more reliable.
                const modelContentBlocks = document.querySelectorAll('.chat-turn-container.model .turn-content');
                if (modelContentBlocks.length > 0) {
                    return modelContentBlocks[modelContentBlocks.length - 1].innerText;
                }
            }
            
            // Selector for ChatGPT
            if (hostname.includes('chatgpt.com')) {
                const turns = document.querySelectorAll('[data-message-author-role="assistant"]');
                if (turns.length > 0) {
                    const lastTurn = turns[turns.length - 1];
                    // ChatGPT nests the content, so we target a specific child for cleaner text.
                    const content = lastTurn.querySelector('.markdown');
                    return content ? content.innerText : lastTurn.innerText;
                }
            }

            // If "Answer" is checked but we don't have a specific selector for the site,
            // we fall back to just getting the last code block. This is a safe default.
            return getCodeBlock();
        },
        args: [profile.deployFromFullAnswer]
    });

    return results[0]?.result || null;
}