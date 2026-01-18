/**
 * Utility for masking and unmasking Fully Qualified Domain Names (FQDN).
 * Uses a hierarchical, deterministic, and incremental strategy to reduce token usage
 * and maintain structural consistency (e.g., sub.example.com -> a.dom-b.com).
 */

const STORAGE_KEY = 'fqdn_masking_map';

// Regex to find potential FQDNs in text.
// Capture standard dot-separated sequences.
// Logic: Word boundary -> alphanum part -> dot -> ... -> 2+ letter TLD -> Word boundary
const FQDN_REGEX = /\b((?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,63})\b/gi;

// Extensions to strictly ignore if they appear as the "TLD"
const IGNORED_EXTENSIONS = new Set([
    'js', 'ts', 'jsx', 'tsx', 'vue', 'py', 'rb', 'php', 'java', 'c', 'cpp', 'h', 'hpp', 'cs', 'go', 'rs', 'lua', 'pl', 'swift', 'kt', 'dart',
    'html', 'htm', 'css', 'scss', 'sass', 'less', 'json', 'xml', 'yaml', 'yml', 'toml', 'ini', 'cfg', 'conf', 'env',
    'md', 'txt', 'rtf', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'csv',
    'png', 'jpg', 'jpeg', 'gif', 'svg', 'ico', 'webp', 'bmp', 'tiff',
    'zip', 'tar', 'gz', 'rar', '7z', 'iso', 'bin', 'exe', 'dll', 'so', 'dylib',
    'log', 'lock', 'map', 'bak', 'tmp', 'swp'
]);

// Common TLDs to explicitly allow even if they look like extensions (though overlap is minimal with above list)
const COMMON_TLDS = new Set([
    'com', 'net', 'org', 'edu', 'gov', 'mil', 'io', 'co', 'info', 'biz', 'ai', 'app', 'dev', 'uk', 'ca', 'de', 'jp', 'fr', 'au', 'us', 'ru', 'ch', 'it', 'nl', 'se', 'no', 'es', 'br'
]);

/**
 * Converts a number to a letter sequence: 0->a, 25->z, 26->aa, 27->ab...
 */
function numberToLetters(num) {
    let s = '';
    while (num >= 0) {
        s = String.fromCharCode((num % 26) + 97) + s;
        num = Math.floor(num / 26) - 1;
    }
    return s;
}

async function loadData() {
    const defaultData = {
        globalRootCounter: 0,
        rootMap: {},      // "example.com" -> "dom-a.com"
        scopeData: {},    // "example.com" -> { counter: 0, subMap: { "sub": "a" } }
        fullMap: {},      // "sub.example.com" -> "a.dom-a.com" (For fast lookup)
        reverseMap: {}    // "a.dom-a.com" -> "sub.example.com" (For unmasking)
    };
    const data = await chrome.storage.local.get({ [STORAGE_KEY]: defaultData });
    return data[STORAGE_KEY];
}

async function saveData(data) {
    await chrome.storage.local.set({ [STORAGE_KEY]: data });
}

function getOrGenerateMask(domain, state) {
    const lowerDomain = domain.toLowerCase();

    // 1. Check if we already have a full mapping for this exact string
    if (state.fullMap[lowerDomain]) {
        return state.fullMap[lowerDomain];
    }

    const parts = lowerDomain.split('.');
    if (parts.length < 2) return domain; // Should be caught by regex, but safety check

    // 2. Identify Root Domain (heuristic: last 2 parts, e.g. example.com)
    // This keeps google.co.uk as 'dom-x.uk', which is acceptable consistency.
    const tld = parts[parts.length - 1];
    const sld = parts[parts.length - 2];
    const rootDomain = `${sld}.${tld}`;
    const subParts = parts.slice(0, -2); // Everything before the root

    let maskedRoot = '';

    // 3. Process Root
    if (state.rootMap[rootDomain]) {
        maskedRoot = state.rootMap[rootDomain];
    } else {
        const rootLabel = `dom-${numberToLetters(state.globalRootCounter)}`;
        maskedRoot = `${rootLabel}.${tld}`;

        state.rootMap[rootDomain] = maskedRoot;
        state.fullMap[rootDomain] = maskedRoot; // Important for direct root matches
        state.reverseMap[maskedRoot] = rootDomain;

        state.globalRootCounter++;
    }

    // If there are no subdomains, we are done
    if (subParts.length === 0) {
        return maskedRoot;
    }

    // 4. Process Subdomains hierarchically (Right to Left)
    // sub2.sub1.example.com -> we process 'sub1' (child of root), then 'sub2' (child of sub1)

    let currentOriginalParent = rootDomain;
    let currentMaskedParent = maskedRoot;

    // Iterate from right to left (closest to root first)
    for (let i = subParts.length - 1; i >= 0; i--) {
        const subLabel = subParts[i];

        // Initialize scope for the current parent if missing
        if (!state.scopeData[currentOriginalParent]) {
            state.scopeData[currentOriginalParent] = { counter: 0, subMap: {} };
        }

        const scope = state.scopeData[currentOriginalParent];
        let mappedLabel = '';

        if (scope.subMap[subLabel]) {
            mappedLabel = scope.subMap[subLabel];
        } else {
            mappedLabel = numberToLetters(scope.counter);
            scope.subMap[subLabel] = mappedLabel;
            scope.counter++;
        }

        // Build the new masked string
        const newMasked = `${mappedLabel}.${currentMaskedParent}`;
        const newOriginal = `${subLabel}.${currentOriginalParent}`;

        // Save mapping for this level
        state.fullMap[newOriginal] = newMasked;
        state.reverseMap[newMasked] = newOriginal;

        // Move up the chain
        currentOriginalParent = newOriginal;
        currentMaskedParent = newMasked;
    }

    return currentMaskedParent;
}

export async function maskFQDNs(text) {
    if (!text) return text;

    const state = await loadData();
    let hasChanges = false;

    const newText = text.replace(FQDN_REGEX, (match) => {
        const parts = match.split('.');
        const lastPart = parts[parts.length - 1].toLowerCase();

        // Filter out code files
        if (IGNORED_EXTENSIONS.has(lastPart) && !COMMON_TLDS.has(lastPart)) {
            return match;
        }

        const masked = getOrGenerateMask(match, state);
        if (masked !== match) {
            hasChanges = true;
        }
        return masked;
    });

    if (hasChanges) {
        await saveData(state);
    }

    return newText;
}

export async function unmaskFQDNs(text) {
    if (!text) return text;

    const state = await loadData();
    const reverseMap = state.reverseMap;

    // Use the same regex to identify potential domains in the text
    return text.replace(FQDN_REGEX, (match) => {
        // Since our masked domains also look like FQDNs (a.dom-b.com), the regex catches them.
        // We just check the map.
        const key = match.toLowerCase();
        if (reverseMap[key]) {
            return reverseMap[key];
        }
        return match;
    });
}