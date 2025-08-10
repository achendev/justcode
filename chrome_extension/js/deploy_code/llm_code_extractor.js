import { extractAIStudioAnswer } from './answer_extractors/aistudio.js';
import { extractChatGPTAnswer } from './answer_extractors/chatgpt.js';
import { extractFallbackAnswer } from './answer_extractors/fallback.js';
import { extractGeminiAnswer } from './answer_extractors/gemini.js';
import { extractGrokAnswer } from './answer_extractors/grok.js';
import { extractGrokAnswerX } from './answer_extractors/x_grok.js';

/**
 * Reads the clipboard content by injecting a script into the active tab.
 * This is required for service worker contexts (like background.js)
 * that do not have direct access to the clipboard API.
 * @returns {Promise<string|null>} The text from the clipboard.
 */
async function readClipboardFromBackground() {
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
 * Extracts the deployment script from either the clipboard or the active LLM page.
 * This function acts as a dispatcher, choosing the correct extraction strategy
 * based on the active tab's URL and the execution context (popup vs. background).
 * @param {object} profile - The active user profile.
 * @param {boolean} fromShortcut - Whether the call originated from a background shortcut.
 * @returns {Promise<string|null>} The deployment script text, or null if not found.
 */
export async function extractCodeToDeploy(profile, fromShortcut = false) {
    const isDocumentContext = typeof window !== 'undefined' && window.document;
    const isDetached = isDocumentContext && new URLSearchParams(window.location.search).get('view') === 'window';

    if (profile.deployCodeSource === 'clipboard' || isDetached) {
        if (isDocumentContext) {
            // We are in the popup or a detached window, so we can access the clipboard directly.
            return await navigator.clipboard.readText();
        } else {
            // We are in the service worker (background script), so we must inject a script.
            return await readClipboardFromBackground();
        }
    }
    
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
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