import { initializeUI } from './js/popup/ui.js';
import { initializeTheme } from './js/popup/theme.js';
import { initializeViews } from './js/popup/view.js';
import { initializeAppSettings } from './js/popup/settings.js';
import { initializeListeners } from './js/popup/listeners.js';
import { initializeMessaging } from './js/popup/messaging.js';

document.addEventListener('DOMContentLoaded', async () => {
    // Initialize theme first to prevent any flash of unstyled/wrongly-themed content.
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
                    // If the active profile is not the one remembered for this tab, update it.
                    // This change will be picked up when initializeUI() calls loadData().
                    if (data.activeProfileId !== profileIdForTab) {
                        await chrome.storage.local.set({ activeProfileId: profileIdForTab });
                    }
                }
            }
        }
    } catch (e) {
        console.error("JustCode: Error setting active profile from tab memory.", e);
    }

    // The rest of the initialization can proceed now that the theme and active profile are set.
    const reRender = initializeUI();
    initializeViews();
    initializeAppSettings(reRender);
    initializeListeners(reRender);
    initializeMessaging(reRender);
});