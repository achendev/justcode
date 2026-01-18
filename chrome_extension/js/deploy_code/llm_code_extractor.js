import { extractAIStudioAnswer } from './answer_extractors/aistudio.js';
import { extractChatGPTAnswer } from './answer_extractors/chatgpt.js';
import { extractFallbackAnswer } from './answer_extractors/fallback.js';
import { extractGeminiAnswer } from './answer_extractors/gemini.js';
import { extractGrokAnswer } from './answer_extractors/grok.js';
import { extractGrokAnswerX } from './answer_extractors/x_grok.js';
import { readFromClipboard } from '../utils/clipboard.js';
import { loadData } from '../storage.js'; // To access profile state if needed inside function without passing it

/**
 * Extracts the deployment script from either the clipboard or the active LLM page.
 * @param {object} profile - The active user profile.
 * @param {boolean} fromShortcut - Whether the call originated from a background shortcut.
 * @param {string|null} [hostname=null] - The hostname of the active tab.
 * @param {number|null} [tabId=null] - The explicit tab ID to extract from (optional).
 * @returns {Promise<string|null>} The deployment script text, or null if not found.
 */
export async function extractCodeToDeploy(profile, fromShortcut = false, hostname = null, tabId = null) {
    const isDocumentContext = typeof window !== 'undefined' && window.document;
    const isDetached = isDocumentContext && new URLSearchParams(window.location.search).get('view') === 'window';

    if (profile.deployCodeSource === 'clipboard' || isDetached) {
        return await readFromClipboard();
    }
    
    let tab;
    if (tabId) {
        try {
            tab = await chrome.tabs.get(tabId);
        } catch (e) {
            console.error("JustCode: Invalid tabId provided to extractor.", e);
            return null;
        }
    } else {
        const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        tab = tabs[0];
    }

    if (!tab) {
        console.error("JustCode: Could not find tab to extract code from.");
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
    
    // If agent mode is enabled, we almost always want full extraction to find <tool> tags which might be outside code blocks.
    // However, the answer_extractors generally return code blocks by default.
    // We force `shouldExtractFullAnswer` to true if Agent Mode is on to ensure we catch XML tags.
    const shouldExtractFullAnswer = profile.deployFromFullAnswer || profile.isAgentModeEnabled;
    let args = [shouldExtractFullAnswer];

    if (hostname.includes('aistudio.google.com')) {
        extractFunc = extractAIStudioAnswer;
    } else if (hostname.includes('gemini.google.com')) {
        extractFunc = extractGeminiAnswer;
        if (shouldExtractFullAnswer) {
            args.push(profile.codeBlockDelimiter || '```');
        }
    } else if (hostname.includes('chatgpt.com')) {
        extractFunc = extractChatGPTAnswer;
    } else if (hostname.includes('grok.com')) {
        extractFunc = extractGrokAnswer;
        if (shouldExtractFullAnswer) {
            args.push(profile.codeBlockDelimiter || '```');
        }
    } else if (hostname.includes('x.com') && shouldExtractFullAnswer) {
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