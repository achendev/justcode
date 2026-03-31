import { readFromClipboard, writeToClipboard } from './utils/clipboard.js';
import { applyReplacements, applyOneWayReplacements } from './utils/two_way_sync.js';
import { pasteIntoLLM } from './context_builder/llm_interface.js';
import { maskIPs, unmaskIPs } from './utils/ip_masking.js';
import { maskEmails, unmaskEmails } from './utils/email_masking.js';
import { maskFQDNs, unmaskFQDNs } from './utils/fqdn_masking.js';

/**
 * Reads clipboard, applies two-way sync replacements and auto-masking, and pastes into the LLM UI.
 * @param {object} profile The active user profile.
 * @param {boolean} [fromShortcut=false] - True if called from a keyboard shortcut.
 * @param {boolean} [isReverse=false] - True if reversing replacements/masking.
 * @param {string|null} [hostname=null] - The hostname of the active tab.
 * @returns {Promise<{text: string, type: 'success'|'error'|'info'}>} A result object.
 */
export async function applyReplacementsAndPaste(profile, fromShortcut = false, isReverse = false, hostname = null) {
    const hasTwoWay = profile.isTwoWaySyncEnabled && profile.twoWaySyncRules;
    const hasIncoming = profile.isIncomingSyncEnabled && profile.incomingSyncRules;
    const hasOutgoing = profile.isOutgoingSyncEnabled && profile.outgoingSyncRules;
    const hasAutoMask = profile.autoMaskIPs || profile.autoMaskEmails || profile.autoMaskFQDNs;

    if (!hasTwoWay && !hasIncoming && !hasOutgoing && !hasAutoMask) {
        return { text: "Error: No replacements or masking enabled.", type: 'error' };
    }
    
    try {
        const clipboardText = await readFromClipboard();
        if (!clipboardText) {
            return { text: "Clipboard is empty.", type: 'info' };
        }

        let processedText = clipboardText;

        if (isReverse) {
            // UNMASKING (Reverse order of masking, incoming order)
            // Order: FQDN -> IP -> Email -> Incoming One-way -> Two-Way Sync
            if (profile.autoMaskFQDNs) {
                processedText = await unmaskFQDNs(processedText);
            }
            if (profile.autoMaskIPs) {
                processedText = await unmaskIPs(processedText);
            }
            if (profile.autoMaskEmails) {
                processedText = await unmaskEmails(processedText);
            }
            if (hasIncoming) {
                processedText = applyOneWayReplacements(processedText, profile.incomingSyncRules);
            }
            if (hasTwoWay) {
                processedText = applyReplacements(processedText, profile.twoWaySyncRules, 'incoming');
            }

            await writeToClipboard(processedText);
            return { text: "Reversed replacements and copied to clipboard.", type: 'success' };
            
        } else {
            // MASKING (Outgoing order)
            if (hasOutgoing) {
                processedText = applyOneWayReplacements(processedText, profile.outgoingSyncRules);
            }
            if (hasTwoWay) {
                processedText = applyReplacements(processedText, profile.twoWaySyncRules, 'outgoing');
            }

            // CRITICAL: Masking Order (Specific to General)
            // 1. Emails (User-specific)
            if (profile.autoMaskEmails) {
                processedText = await maskEmails(processedText);
            }
            // 2. IPs
            if (profile.autoMaskIPs) {
                processedText = await maskIPs(processedText);
            }
            // 3. FQDNs (General - might catch fake domains from step 1)
            if (profile.autoMaskFQDNs) {
                processedText = await maskFQDNs(processedText);
            }
            
            await pasteIntoLLM(processedText, { insertAtCursor: true }, hostname);

            return { text: "Applied replacements/masking and pasted to UI.", type: 'success' };
        }

    } catch (error) {
        console.error('JustCode Apply Replacements Error:', error);
        return { text: `Error: ${error.message}`, type: 'error' };
    }
}