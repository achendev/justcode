import { extractAIStudioAnswer } from './answer_extractors/aistudio.js';
import { extractGeminiAnswer } from './answer_extractors/gemini.js';
import { extractChatGPTAnswer } from './answer_extractors/chatgpt.js';
import { extractGrokAnswer } from './answer_extractors/grok.js';
import { extractGrokAnswerX } from './answer_extractors/x_grok.js';
import { extractFallbackAnswer } from './answer_extractors/fallback.js';

/**
 * Extracts the deployment script from either the clipboard or the active LLM page.
 * This function acts as a dispatcher, choosing the correct extraction strategy
 * based on the active tab's URL.
 * @param {object} profile - The active user profile.
 * @param {boolean} isDetached - Whether the popup is in a detached window.
 * @returns {Promise<string|null>} The deployment script text, or null if not found.
 */
export async function extractCodeToDeploy(profile, isDetached) {
    const fromShortcut = typeof document === 'undefined';
    
    if (profile.deployCodeSource === 'clipboard' || (isDetached && !fromShortcut)) {
        if (fromShortcut) {
            // We are in the background script and need to read the clipboard from the active tab.
            const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
            if (!tab) {
                console.error("JustCode: No active tab found to read clipboard from.");
                return null;
            }
            const results = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: () => navigator.clipboard.readText(),
            });
            return results[0]?.result || null;
        } else {
            // We are in the popup, which has direct clipboard access.
            return await navigator.clipboard.readText();
        }
    }
    
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) {
        console.error("JustCode: Could not find active tab to extract code from.");
        return null;
    }

    const url = new URL(tab.url);
    const hostname = url.hostname;
    let extractFunc;
    let args = [profile.deployFromFullAnswer]; // Default arguments

    if (hostname.includes('aistudio.google.com')) {
        extractFunc = extractAIStudioAnswer;
    } else if (hostname.includes('gemini.google.com')) {
        extractFunc = extractGeminiAnswer;
        if (profile.deployFromFullAnswer) {
            args.push(profile.codeBlockDelimiter || '```');
        }
    } else if (hostname.includes('chatgpt.com')) {
        extractFunc = extractChatGPTAnswer;
    } else if (hostname.includes('grok.com')) {
        extractFunc = extractGrokAnswer;
        if (profile.deployFromFullAnswer) {
            args.push(profile.codeBlockDelimiter || '```');
        }
    } else if (hostname.includes('x.com') && profile.deployFromFullAnswer) {
        extractFunc = extractGrokAnswerX;
        args.push(profile.codeBlockDelimiter || '```');
    } else {
        extractFunc = extractFallbackAnswer;
    }

    const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: extractFunc,
        args: args
    });

    return results[0]?.result || null;
}