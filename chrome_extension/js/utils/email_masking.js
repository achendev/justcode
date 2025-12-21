/**
 * Utility for masking and unmasking Email addresses.
 * Maintains a persistent mapping in chrome.storage.local to ensure consistency.
 * Generates random, valid-looking Email addresses to maintain natural context for LLMs.
 */

const STORAGE_KEY = 'email_masking_map';
// Simple but effective regex for catching most email addresses in code/text
// Matches standard pattern: chars@chars.domain
const EMAIL_REGEX = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi;

function generateRandomString(length) {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

function generateFakeEmail() {
    // Generate unique fake emails to avoid collisions and keep context natural
    const user = 'user-' + generateRandomString(5);
    const domain = 'email-' + generateRandomString(3) + '.com';
    return `${user}@${domain}`;
}

async function loadData() {
    const data = await chrome.storage.local.get({ [STORAGE_KEY]: { originalToFake: {}, fakeToOriginal: {} } });
    return data[STORAGE_KEY];
}

async function saveData(data) {
    await chrome.storage.local.set({ [STORAGE_KEY]: data });
}

export async function maskEmails(text) {
    if (!text) return text;

    const data = await loadData();
    const map = data.originalToFake;
    const reverseMap = data.fakeToOriginal;
    let hasChanges = false;

    const newText = text.replace(EMAIL_REGEX, (match) => {
        const key = match.trim().toLowerCase();

        if (map[key]) {
            return map[key];
        } else {
            let fakeEmail;
            let attempts = 0;
            do {
                fakeEmail = generateFakeEmail();
                attempts++;
            } while (reverseMap[fakeEmail] && attempts < 10);

            map[key] = fakeEmail;
            reverseMap[fakeEmail] = key;
            hasChanges = true;
            return fakeEmail;
        }
    });

    if (hasChanges) {
        await saveData({ originalToFake: map, fakeToOriginal: reverseMap });
    }

    return newText;
}

export async function unmaskEmails(text) {
    if (!text) return text;

    const data = await loadData();
    const reverseMap = data.fakeToOriginal;

    return text.replace(EMAIL_REGEX, (match) => {
        const key = match.trim().toLowerCase();

        if (reverseMap[key]) {
            return reverseMap[key];
        }

        return match;
    });
}