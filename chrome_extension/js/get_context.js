import { getContextFromJS, getExclusionSuggestionFromJS } from './get_context/js_strategy.js';
import { getContextFromServer, getExclusionSuggestionFromServer } from './get_context/server_strategy.js';


/**
 * Main entry point to get context.
 * It acts as a facade, dispatching the call to the appropriate strategy (JS or Server)
 * based on the user's active profile settings. It now returns a result object.
 * @param {object} profile The active user profile.
 * @param {boolean} [fromShortcut=false] - True if called from a keyboard shortcut.
 * @returns {Promise<{text: string, type: 'success'|'error'|'info'}>} A result object.
 */
export async function getContext(profile, fromShortcut = false) {
    if (profile.useServerBackend) {
        return await getContextFromServer(profile, fromShortcut);
    } else {
        return await getContextFromJS(profile, fromShortcut);
    }
}

/**
 * Main entry point to get an exclusion suggestion.
 * It acts as a facade, dispatching the call to the appropriate strategy (JS or Server).
 * @param {object} profile The active user profile.
 * @returns {Promise<{text: string, type: 'success'|'error'|'info'}>} A result object.
 */
export async function getExclusionSuggestion(profile) {
    if (profile.useServerBackend) {
        return await getExclusionSuggestionFromServer(profile);
    } else {
        return await getExclusionSuggestionFromJS(profile);
    }
}