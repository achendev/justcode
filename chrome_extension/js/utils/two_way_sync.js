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
 * Applies replacements to a given text based on the provided rules and direction.
 * @param {string} text The text to process.
 * @param {string} rulesString The raw string of rules.
 * @param {'outgoing' | 'incoming'} direction 'outgoing' for local->placeholder, 'incoming' for placeholder->local.
 * @returns {string} The processed text.
 */
export function applyReplacements(text, rulesString, direction) {
    const rules = parseRules(rulesString);
    if (rules.length === 0) return text;

    let processedText = text;
    for (const rule of rules) {
        const from = direction === 'outgoing' ? rule.local : rule.placeholder;
        const to = direction === 'outgoing' ? rule.placeholder : rule.local;
        
        // Use a function in replaceAll to avoid issues with special regex characters in 'from' string.
        processedText = processedText.replaceAll(from, to);
    }
    return processedText;
}