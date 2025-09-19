import { readFromClipboard } from './utils/clipboard.js';
import { applyReplacements } from './utils/two_way_sync.js';
import { pasteIntoLLM } from './context_builder/llm_interface.js';

/**
 * Reads clipboard, applies two-way sync replacements, and pastes into the LLM UI.
 * @param {object} profile The active user profile.
 * @param {boolean} [fromShortcut=false] - True if called from a keyboard shortcut.
 * @param {string|null} [hostname=null] - The hostname of the active tab.
 * @returns {Promise<{text: string, type: 'success'|'error'|'info'}>} A result object.
 */
export async function applyReplacementsAndPaste(profile, fromShortcut = false, hostname = null) {
    if (!profile.isTwoWaySyncEnabled || !profile.twoWaySyncRules) {
        return { text: "Error: Two-Way Sync is not enabled or configured.", type: 'error' };
    }
    
    try {
        const clipboardText = await readFromClipboard();
        if (!clipboardText) {
            return { text: "Clipboard is empty.", type: 'info' };
        }

        const processedText = applyReplacements(clipboardText, profile.twoWaySyncRules, 'outgoing');
        
        await pasteIntoLLM(processedText, {}, hostname);

        return { text: "Applied replacements and pasted to UI.", type: 'success' };

    } catch (error) {
        console.error('JustCode Apply Replacements Error:', error);
        return { text: `Error: ${error.message}`, type: 'error' };
    }
}