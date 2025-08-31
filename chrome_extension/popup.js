import { initializeUI } from './js/popup/ui.js';
import { initializeTheme } from './js/popup/theme.js';
import { initializeViews } from './js/popup/view.js';
import { initializeAppSettings } from './js/popup/settings.js';
import { initializeListeners } from './js/popup/listeners.js';
import { initializeMessaging } from './js/popup/messaging.js';

document.addEventListener('DOMContentLoaded', async () => {
    const reRender = initializeUI();
    initializeTheme();
    try {
        const settings = await chrome.storage.local.get({ rememberTabProfile: true });
        if (settings.rememberTabProfile) {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tab && tab.id) {
                const data = await chrome.storage.local.get(['tabProfileMap', 'profiles', 'activeProfileId']);
                const tabProfileMap = data.tabProfileMap || {};
                const profiles = data.profiles || [];
                const profileIdForTab = tabProfileMap[tab.id];

                if (profileIdForTab && profiles.some(p => p.id === profileIdForTab)) {
                    if (data.activeProfileId !== profileIdForTab) {
                        await chrome.storage.local.set({ activeProfileId: profileIdForTab });
                    }
                }
            }
        }
    } catch (e) {
        console.error("JustCode: Error setting active profile from tab memory.", e);
    }

    // Each function initializes a specific part of the application's functionality.
    // This keeps the main entry point clean and follows the Single Responsibility Principle.
    initializeViews();
    initializeAppSettings(reRender);
    initializeListeners(reRender);
    initializeMessaging(reRender);
});