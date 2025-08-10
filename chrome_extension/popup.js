import { initializeUI } from './js/popup/ui.js';
import { initializeTheme } from './js/popup/theme.js';
import { initializeViews } from './js/popup/view.js';
import { initializeAppSettings } from './js/popup/settings.js';
import { initializeListeners } from './js/popup/listeners.js';
import { initializeMessaging } from './js/popup/messaging.js';

document.addEventListener('DOMContentLoaded', () => {
    // Each function initializes a specific part of the application's functionality.
    // This keeps the main entry point clean and follows the Single Responsibility Principle.
    const reRender = initializeUI();
    initializeTheme();
    initializeViews();
    initializeAppSettings(reRender);
    initializeListeners(reRender);
    initializeMessaging(reRender);
});