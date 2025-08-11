import { extractAIStudioAnswer } from './answer_extractors/aistudio.js';
import { extractChatGPTAnswer } from './answer_extractors/chatgpt.js';
import { extractFallbackAnswer } from './answer_extractors/fallback.js';
import { extractGeminiAnswer } from './answer_extractors/gemini.js';
import { extractGrokAnswer } from './answer_extractors/grok.js';
import { extractGrokAnswerX } from './answer_extractors/x_grok.js';

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
 * @param {object} profile - The active user profile.
 * @param {boolean} fromShortcut - Whether the call originated from a background shortcut.
 * @param {string|null} [hostname=null] - The hostname of the active tab.
 * @returns {Promise<string|null>} The deployment script text, or null if not found.
 */
export async function extractCodeToDeploy(profile, fromShortcut = false, hostname = null) {
    const isDocumentContext = typeof window !== 'undefined' && window.document;
    const isDetached = isDocumentContext && new URLSearchParams(window.location.search).get('view') === 'window';

    if (profile.deployCodeSource === 'clipboard' || isDetached) {
        if (isDocumentContext) {
            return await navigator.clipboard.readText();
        } else {
            return await readClipboardFromBackground();
        }
    }
    
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tab) {
        console.error("JustCode: Could not find active tab to extract code from.");
        return null;
    }

    if (!hostname) {
        try {
            hostname = new URL(tab.url).hostname;
        } catch (e) {
            console.error("JustCode Error: Could not determine hostname from invalid URL:", tab.url);
            hostname = '';
        }
    }

    let extractFunc;
    let args = [profile.deployFromFullAnswer];

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