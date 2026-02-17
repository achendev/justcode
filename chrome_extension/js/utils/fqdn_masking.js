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

/**
 * A comprehensive whitelist of common TLDs to differentiate actual domains from code properties.
 * Excludes TLDs that conflict with common file extensions (e.g., .py, .rs, .sh, .md, .pl) to prevent false positives,
 * unless explicitly requested.
 */
const KNOWN_TLDS = new Set([
    // --- Originals & Most Common ---
    'com', 'net', 'org', 'edu', 'gov', 'mil', 'io', 'co', 'info', 'biz', 'ai', 'app', 'dev', 'xyz',
    'club', 'space', 'casino', 'ru', 'de', 'uk', 'ca', 'jp', 'fr', 'au', 'us', 'ch', 'it', 'nl',
    'se', 'no', 'es', 'br', 'cn', 'in', 'me', 'tv', 'cc', 'asia', 'cloud', 'website', 'link',
    'top', 'work', 'rocks', 'vip', 'pro', 'shop', 'store', 'online', 'tech', 'site', 'win',
    'life', 'live', 'world', 'news', 'today', 'guru', 'solutions', 'services', 'agency', 'center',
    'digital', 'studio', 'systems', 'design', 'blog', 'social', 'bio', 'ltd', 'inc', 'llc',

    // --- Extended List ---
    'alsace', 'army', 'bar', 'bayern', 'bond', 'bot', 'bzh', 'cab', 'cafe', 'cam', 'care', 'case',
    'cat', 'chat', 'claims', 'click', 'clinic', 'codes', 'cymru', 'cyou', 'dealer', 'dental',
    'desi', 'email', 'energy', 'eus', 'farm', 'forum', 'frl', 'gal', 'game', 'games', 'giving',
    'gop', 'hair', 'help', 'host', 'icu', 'insure', 'irish', 'juegos', 'kiwi', 'krd', 'lat',
    'law', 'legal', 'limo', 'locker', 'lotto', 'meme', 'mobi', 'navy', 'nexus', 'nowruz', 'nrw',
    'onl', 'ovh', 'page', 'post', 'quebec', 'quest', 'realty', 'repair', 'rest', 'rio', 'ruhr',
    'ryukyu', 'salon', 'sbs', 'scot', 'select', 'solar', 'stream', 'supply', 'swiss', 'tatar',
    'tattoo', 'tax', 'taxi', 'tel', 'tirol', 'tours', 'trade', 'trust', 'tube', 'vote', 'voting',
    'voto', 'wales', 'webcam',

    // --- Other Common Country Codes ---
    'eu', 'be', 'at', 'dk', 'fi', 'cz', 'gr', 'ro', 'hu', 'tr', 'th', 'vn', 'id', 'my', 'ph',
    'sg', 'hk', 'tw', 'kr', 'za', 'ar', 'cl', 'pe', 've', 'mx', 'nz', 'ie', 'pt', 'ua', 'il',

    // --- Infrastructure / Special ---
    'arpa', 'local', 'test', 'example', 'localhost'
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
    if (parts.length < 2) return domain;

    // 2. Identify Root Domain (heuristic: last 2 parts, e.g. example.com)
    // This keeps google.co.uk as 'dom-x.uk' (uk is TLD, co is SLD), which is acceptable consistency.
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

        // Strict TLD check to avoid masking code properties (e.g., object.property or file.ext)
        // If the suffix isn't a known TLD, we treat it as code/text and skip masking.
        if (!KNOWN_TLDS.has(lastPart)) {
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