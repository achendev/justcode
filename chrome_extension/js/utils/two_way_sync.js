/**
 * Escapes special characters for regex.
 */
function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Parses the rules string from the textarea into a structured array.
 * @param {string} rulesString The raw string from the textarea.
 * @returns {Array<{local: string, placeholder: string}>} An array of rule objects.
 */
function parseRules(rulesString) {
    if (!rulesString) return [];
    return rulesString
        .split('\n')
        .map(line => line.trim())
        .filter(line => line && line.includes('|'))
        .map(line => {
            const parts = line.split('|');
            return {
                local: parts[0].trim(),
                placeholder: parts.slice(1).join('|').trim() // Handle '|' in placeholder
            };
        })
        .filter(rule => rule.local && rule.placeholder);
}

/**
 * Transfers casing from the matched string to the target string.
 * Supports ALL CAPS, TitleCase, and specific index-based casing.
 * @param {string} match The string found in the text (e.g., "MyProject" or "MYPROJECT").
 * @param {string} target The replacement string definition (e.g., "someproject").
 * @returns {string} The target string with the casing applied (e.g., "SoMeproject" or "SOMEPROJECT").
 */
function transferCasing(match, target) {
    // 1. ALL CAPS check
    if (match === match.toUpperCase() && match !== match.toLowerCase()) {
        return target.toUpperCase();
    }

    // 2. Character-by-character casing transfer
    let result = '';
    for (let i = 0; i < target.length; i++) {
        const char = target[i];
        
        if (i < match.length) {
            const matchChar = match[i];
            // Check if the match character is Upper Case
            if (matchChar === matchChar.toUpperCase() && matchChar !== matchChar.toLowerCase()) {
                result += char.toUpperCase();
            } else {
                result += char.toLowerCase();
            }
        } else {
            result += char;
        }
    }
    return result;
}

/**
 * Applies replacements to a given text based on the provided rules and direction.
 * 
 * Logic:
 * 1. If a rule (either local OR placeholder) contains any uppercase letters, it is treated as STRICT.
 *    - Case-Sensitive Matching.
 *    - Exact Replacement (No smart casing).
 * 2. If a rule is entirely lowercase on both sides, it is treated as SMART.
 *    - Case-Insensitive Matching.
 *    - Smart Casing Transfer (e.g., myproject -> someproject, MyProject -> SomeProject).
 * 
 * @param {string} text The text to process.
 * @param {string} rulesString The raw string of rules.
 * @param {'outgoing' | 'incoming'} direction 'outgoing' for local->placeholder, 'incoming' for placeholder->local.
 * @returns {string} The processed text.
 */
export function applyReplacements(text, rulesString, direction) {
    const rules = parseRules(rulesString);
    if (rules.length === 0) return text;

    let processedText = text;
    
    // Sort rules by length (descending) to avoid partial replacements
    const sortedRules = [...rules].sort((a, b) => {
        const fromA = direction === 'outgoing' ? a.local : a.placeholder;
        const fromB = direction === 'outgoing' ? b.local : b.placeholder;
        return fromB.length - fromA.length;
    });

    for (const rule of sortedRules) {
        const from = direction === 'outgoing' ? rule.local : rule.placeholder;
        const to = direction === 'outgoing' ? rule.placeholder : rule.local;
        
        // CHECK BOTH SIDES: If either side has uppercase, use strict mode.
        // This ensures PassWord|password works strictly in both directions.
        const isStrictRule = (rule.local !== rule.local.toLowerCase()) || 
                             (rule.placeholder !== rule.placeholder.toLowerCase());

        if (isStrictRule) {
            // Strict replacement: Case-Sensitive, Exact Replace
            const regex = new RegExp(escapeRegExp(from), 'g');
            processedText = processedText.replace(regex, to);
        } else {
            // Smart replacement: Case-Insensitive, Smart Casing
            const regex = new RegExp(escapeRegExp(from), 'gi');
            processedText = processedText.replace(regex, (match) => {
                return transferCasing(match, to);
            });
        }
    }
    return processedText;
}