import { pasteAsFile } from './paste_handlers/file_uploader.js';
import { pasteChatGPT, pasteAsFileChatGPT } from './paste_handlers/chatgpt.js';
import { pasteGemini } from './paste_handlers/gemini.js';
import { pastePerplexity } from './paste_handlers/perplexity.js';
import { pasteFallback } from './paste_handlers/fallback.js';

/**
 * Pastes text into the most likely input field in the active tab.
 * This function contains specific logic for different LLM provider websites
 * to ensure robust pasting behavior.
 * @param {string} text The text to paste.
 * @param {object} [options={}] - Optional parameters for the paste handler.
 */
export async function pasteIntoLLM(text, options = {}) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) {
        console.error('JustCode Error: No active tab found.');
        return;
    }
    
    const url = new URL(tab.url);
    const hostname = url.hostname;
    let pasteFunc;
    
    if (hostname.includes('chatgpt.com')) {
        pasteFunc = pasteChatGPT;
    } else if (hostname.includes('gemini.google.com')) {
        pasteFunc = pasteGemini;
    } else if (hostname.includes('perplexity.ai')) {
        pasteFunc = pastePerplexity;
    } else {
        pasteFunc = pasteFallback;
    }
    
    await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: pasteFunc,
        args: [text, options]
    });
}


/**
 * Creates a file from the given text and "uploads" it to the active LLM tab.
 * This function dispatches to site-specific handlers where available.
 * @param {string} text The content for the file.
 */
export async function uploadContextAsFile(text) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) {
        console.error('JustCode Error: No active tab found.');
        return;
    }

    const url = new URL(tab.url);
    const hostname = url.hostname;
    let uploadFunc;

    if (hostname.includes('chatgpt.com')) {
        uploadFunc = pasteAsFileChatGPT;
    } else {
        // Fallback to the generic uploader for other sites.
        uploadFunc = pasteAsFile;
    }

    await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: uploadFunc,
        args: ['context.txt', text]
    });
}