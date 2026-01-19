import { readFromClipboard } from './utils/clipboard.js';
import { applyReplacements } from './utils/two_way_sync.js';
import { pasteIntoLLM } from './context_builder/llm_interface.js';
import { maskIPs } from './utils/ip_masking.js';
import { maskEmails } from './utils/email_masking.js';
import { maskFQDNs } from './utils/fqdn_masking.js';

/**
 * Reads clipboard, applies two-way sync replacements and auto-masking, and pastes into the LLM UI.
 * @param {object} profile The active user profile.
 * @param {boolean} [fromShortcut=false] - True if called from a keyboard shortcut.
 * @param {string|null} [hostname=null] - The hostname of the active tab.
 * @returns {Promise<{text: string, type: 'success'|'error'|'info'}>} A result object.
 */
export async function applyReplacementsAndPaste(profile, fromShortcut = false, hostname = null) {
    const hasSync = profile.isTwoWaySyncEnabled && profile.twoWaySyncRules;
    const hasAutoMask = profile.autoMaskIPs || profile.autoMaskEmails || profile.autoMaskFQDNs;

    if (!hasSync && !hasAutoMask) {
        return { text: "Error: No replacements or masking enabled.", type: 'error' };
    }
    
    try {
        const clipboardText = await readFromClipboard();
        if (!clipboardText) {
            return { text: "Clipboard is empty.", type: 'info' };
        }

        let processedText = clipboardText;

        if (hasSync) {
            processedText = applyReplacements(processedText, profile.twoWaySyncRules, 'outgoing');
        }

        if (profile.autoMaskIPs) {
            processedText = await maskIPs(processedText);
        }
        if (profile.autoMaskEmails) {
            processedText = await maskEmails(processedText);
        }
        if (profile.autoMaskFQDNs) {
            processedText = await maskFQDNs(processedText);
        }
        
        // Pass insertAtCursor: true to prevent overwriting existing text
        await pasteIntoLLM(processedText, { insertAtCursor: true }, hostname);

        return { text: "Applied replacements/masking and pasted to UI.", type: 'success' };

    } catch (error) {
        console.error('JustCode Apply Replacements Error:', error);
        return { text: `Error: ${error.message}`, type: 'error' };
    }
}