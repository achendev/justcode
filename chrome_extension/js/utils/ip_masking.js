/**
 * Utility for masking and unmasking IP addresses (IPv4 & IPv6).
 * Maintains a persistent mapping in chrome.storage.local to ensure consistency.
 * Generates random, valid IP addresses to maintain natural context for LLMs.
 */

const STORAGE_KEY = 'ip_masking_map';

// --- REGEX DEFINITIONS ---

// IPv4: Matches 0.0.0.0 to 255.255.255.255
const IPV4_PATTERN = '(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[0-9]{1,2})(?:\\.(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[0-9]{1,2})){3}';

// IPv6: Comprehensive matching for standard, compressed, mixed, and link-local
const IPV6_PATTERN = '(?:' +
    '(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|' +
    '(?:[0-9a-fA-F]{1,4}:){1,7}:|' +
    '(?:[0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|' +
    '(?:[0-9a-fA-F]{1,4}:){1,5}(?::[0-9a-fA-F]{1,4}){1,2}|' +
    '(?:[0-9a-fA-F]{1,4}:){1,4}(?::[0-9a-fA-F]{1,4}){1,3}|' +
    '(?:[0-9a-fA-F]{1,4}:){1,3}(?::[0-9a-fA-F]{1,4}){1,4}|' +
    '(?:[0-9a-fA-F]{1,4}:){1,2}(?::[0-9a-fA-F]{1,4}){1,5}|' +
    '[0-9a-fA-F]{1,4}:(?:(?::[0-9a-fA-F]{1,4}){1,6})|' +
    ':(?:(?::[0-9a-fA-F]{1,4}){1,7}|:)|' +
    'fe80:(?::[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|' +
    '::(?:ffff(?::0{1,4}){0,1}:){0,1}(?:(?:25[0-5]|(?:2[0-4]|1{0,1}[0-9]){0,1}[0-9])\\.){3,3}(?:25[0-5]|(?:2[0-4]|1{0,1}[0-9]){0,1}[0-9])|' +
    '(?:[0-9a-fA-F]{1,4}:){1,4}:(?:(?:25[0-5]|(?:2[0-4]|1{0,1}[0-9]){0,1}[0-9])\\.){3,3}(?:25[0-5]|(?:2[0-4]|1{0,1}[0-9]){0,1}[0-9])' +
')';

// Regex to capture IP (Group 1 or 3) and optional CIDR (Group 2 or 4)
const MASTER_IP_REGEX = new RegExp(
    `(${IPV6_PATTERN})(\\/(?:[0-9]|[1-9][0-9]|1[0-1][0-9]|12[0-8]))?|(${IPV4_PATTERN})(\\/(?:[0-9]|[1-2][0-9]|3[0-2]))?`, 
    'gi'
);

// --- HELPERS ---

function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateRandomIPv4() {
    // Generate random valid public IP structure (avoiding strict private ranges isn't strictly necessary for LLM context context, just valid structure)
    return `${getRandomInt(1, 223)}.${getRandomInt(0, 255)}.${getRandomInt(0, 255)}.${getRandomInt(1, 254)}`;
}

function generateRandomIPv6() {
    const parts = [];
    for (let i = 0; i < 8; i++) {
        parts.push(getRandomInt(0, 65535).toString(16));
    }
    return parts.join(':');
}

async function loadData() {
    const data = await chrome.storage.local.get({ [STORAGE_KEY]: { originalToFake: {}, fakeToOriginal: {} } });
    return data[STORAGE_KEY];
}

async function saveData(data) {
    await chrome.storage.local.set({ [STORAGE_KEY]: data });
}

// --- PUBLIC API ---

export async function maskIPs(text) {
    if (!text) return text;

    const data = await loadData();
    const map = data.originalToFake;
    const reverseMap = data.fakeToOriginal;
    let hasChanges = false;

    const newText = text.replace(MASTER_IP_REGEX, (match, ipv6, ipv6Cidr, ipv4, ipv4Cidr) => {
        const ip = ipv6 || ipv4;
        const cidr = ipv6Cidr || ipv4Cidr || '';
        const isV6 = !!ipv6;
        
        if (!ip) return match; 

        const key = ip.trim().toLowerCase();

        let fakeIP;
        if (map[key]) {
            fakeIP = map[key];
        } else {
            // Generate unique fake IP
            let attempts = 0;
            do {
                fakeIP = isV6 ? generateRandomIPv6() : generateRandomIPv4();
                attempts++;
            } while (reverseMap[fakeIP] && attempts < 10);
            
            map[key] = fakeIP;
            reverseMap[fakeIP] = key;
            hasChanges = true;
        }

        return fakeIP + cidr;
    });

    if (hasChanges) {
        await saveData({ originalToFake: map, fakeToOriginal: reverseMap });
    }

    return newText;
}

export async function unmaskIPs(text) {
    if (!text) return text;

    const data = await loadData();
    const reverseMap = data.fakeToOriginal;

    // Scan for anything that looks like an IP in the returned text
    return text.replace(MASTER_IP_REGEX, (match, ipv6, ipv6Cidr, ipv4, ipv4Cidr) => {
        const ip = ipv6 || ipv4;
        const cidr = ipv6Cidr || ipv4Cidr || '';
        
        if (!ip) return match;

        const key = ip.trim().toLowerCase();
        
        if (reverseMap[key]) {
            return reverseMap[key] + cidr; 
        }

        return match;
    });
}