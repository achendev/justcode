import { pasteAsFile } from './paste_handlers/file_uploader.js';
import { pasteChatGPT, pasteAsFileChatGPT } from './paste_handlers/chatgpt.js';
import { pasteGemini } from './paste_handlers/gemini.js';
import { pastePerplexity } from './paste_handlers/perplexity.js';
import { pasteFallback } from './paste_handlers/fallback.js';

// Internal helper to avoid duplication
async function uploadFile(text, filename, hostname) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) {
        console.error('JustCode Error: No active tab found.');
        return;
    }

    if (!hostname) {
        try {
            hostname = new URL(tab.url).hostname;
        } catch (e) {
            console.error("JustCode Error: Could not determine hostname from invalid URL:", tab.url);
            hostname = '';
        }
    }
    
    let uploadFunc;
    if (hostname.includes('chatgpt.com')) {
        uploadFunc = pasteAsFileChatGPT;
    } else {
        uploadFunc = pasteAsFile;
    }

    await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: uploadFunc,
        args: [filename, text]
    });
}

/**
 * Pastes text into the most likely input field in the active tab.
 * @param {string} text The text to paste.
 * @param {object} [options={}] - Optional parameters for the paste handler.
 * @param {string|null} [hostname=null] - The hostname of the target tab.
 */
export async function pasteIntoLLM(text, options = {}, hostname = null) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) {
        console.error('JustCode Error: No active tab found.');
        return;
    }
    
    if (!hostname) {
        try {
            hostname = new URL(tab.url).hostname;
        } catch (e) {
            console.error("JustCode Error: Could not determine hostname from invalid URL:", tab.url);
            hostname = ''; 
        }
    }
    
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
 * @param {string} text The content for the file.
 * @param {string|null} [hostname=null] - The hostname of the target tab.
 */
export async function uploadContextAsFile(text, hostname = null) {
    await uploadFile(text, 'context.txt', hostname);
}

/**
 * Creates a file for the instructions and "uploads" it to the active LLM tab.
 * @param {string} text The content for the instructions file.
 * @param {string|null} [hostname=null] - The hostname of the target tab.
 */
export async function uploadInstructionsAsFile(text, hostname = null) {
    await uploadFile(text, 'critical_instructions.txt', hostname);
}