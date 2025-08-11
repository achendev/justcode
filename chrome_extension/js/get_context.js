import { getContextFromJS, getExclusionSuggestionFromJS } from './get_context/js_strategy.js';
import { getContextFromServer, getExclusionSuggestionFromServer } from './get_context/server_strategy.js';

/**
 * Main entry point to get context.
 * @param {object} profile The active user profile.
 * @param {boolean} [fromShortcut=false] - True if called from a keyboard shortcut.
 * @param {string|null} [hostname=null] - The hostname of the active tab.
 * @returns {Promise<{text: string, type: 'success'|'error'|'info'}>} A result object.
 */
export async function getContext(profile, fromShortcut = false, hostname = null) {
    if (profile.useServerBackend) {
        return await getContextFromServer(profile, fromShortcut, hostname);
    } else {
        return await getContextFromJS(profile, fromShortcut, hostname);
    }
}

/**
 * Main entry point to get an exclusion suggestion.
 * @param {object} profile The active user profile.
 * @param {boolean} [fromShortcut=false] - True if called from a keyboard shortcut.
 * @param {string|null} [hostname=null] - The hostname of the active tab.
 * @returns {Promise<{text: string, type: 'success'|'error'|'info'}>} A result object.
 */
export async function getExclusionSuggestion(profile, fromShortcut = false, hostname = null) {
    if (profile.useServerBackend) {
        return await getExclusionSuggestionFromServer(profile, fromShortcut, hostname);
    } else {
        return await getExclusionSuggestionFromJS(profile, fromShortcut, hostname);
    }
}