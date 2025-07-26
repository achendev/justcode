import { updateTemporaryMessage } from './ui_handlers/message.js';
import { getContextFromJS, getExclusionSuggestionFromJS } from './get_context/js_strategy.js';
import { getContextFromServer, getExclusionSuggestionFromServer } from './get_context/server_strategy.js';


/**
 * Main entry point to get context.
 * It acts as a facade, dispatching the call to the appropriate strategy (JS or Server)
 * based on the user's active profile settings.
 * @param {object} profile The active user profile.
 * @param {boolean} [fromShortcut=false] - True if called from a keyboard shortcut.
 */
export async function getContext(profile, fromShortcut = false) {
    updateTemporaryMessage(profile.id, 'Getting context...');
    if (profile.useServerBackend) {
        await getContextFromServer(profile, fromShortcut);
    } else {
        await getContextFromJS(profile, fromShortcut);
    }
}

/**
 * Main entry point to get an exclusion suggestion.
 * It acts as a facade, dispatching the call to the appropriate strategy (JS or Server).
 * @param {object} profile The active user profile.
 */
export async function getExclusionSuggestion(profile) {
    updateTemporaryMessage(profile.id, 'Getting exclusion suggestion...');
    if (profile.useServerBackend) {
        await getExclusionSuggestionFromServer(profile);
    } else {
        await getExclusionSuggestionFromJS(profile);
    }
}