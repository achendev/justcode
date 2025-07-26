import { attachProfileEventListeners, attachArchiveEventListeners } from './event_listeners/profile_listeners.js';
import { attachInputEventListeners } from './event_listeners/input_listeners.js';
import { attachActionEventListeners } from './event_listeners/action_listeners.js';
import { attachSettingsEventListeners } from './event_listeners/settings_listeners.js';
import { attachMessageEventListeners } from './event_listeners/message_listeners.js';

export function attachAllEventListeners(reRenderCallback) {
    // Listeners that require a re-render
    attachProfileEventListeners(reRenderCallback);
    attachArchiveEventListeners(reRenderCallback);
    attachSettingsEventListeners(reRenderCallback); // Contains the backend-toggle which needs re-render

    // Listeners that don't require a re-render
    attachInputEventListeners();
    attachActionEventListeners();
    attachMessageEventListeners();
}