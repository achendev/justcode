// Part of the JustCode notification system.
// This is the main entry point for the content scripts.
// Its only jobs are to initialize global state and set up
// the listeners for chrome.runtime and chrome.storage.

(function() {
    'use strict';

    // This will hold the settings received from the background script.
    let settings = null;

    // --- NEW: Function to attach the shortcut listener ---
    function attachShortcutListener() {
        // Prevent attaching the listener multiple times
        if (document.body.dataset.justcodeListenerAttached === 'true') {
            return;
        }
        document.body.dataset.justcodeListenerAttached = 'true';

        document.addEventListener('keydown', (event) => {
            // Don't run if settings haven't been loaded yet, or if modifiers are wrong.
            if (!settings || !event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
                return;
            }

            const allowedDomains = (settings.shortcutDomains || '').split(',').map(d => d.trim().toLowerCase()).filter(Boolean);
            if (!allowedDomains.includes(window.location.hostname)) {
                return;
            }

            let command = null;
            switch (event.key) {
                case 'ArrowLeft':
                    if (settings.isGetContextShortcutEnabled) command = 'get-context-shortcut';
                    break;
                case 'ArrowRight':
                    if (settings.isDeployCodeShortcutEnabled) command = 'deploy-code-shortcut';
                    break;
                case ',': // Alt + <
                    if (settings.isUndoShortcutEnabled) command = 'undo-code-shortcut';
                    break;
                case '.': // Alt + >
                    if (settings.isRedoShortcutEnabled) command = 'redo-code-shortcut';
                    break;
            }

            if (command) {
                event.preventDefault();
                event.stopPropagation();
                chrome.runtime.sendMessage({ type: 'execute-command', command: command });
            }
        }, true); // Use capture phase to catch event early
    }

    // Listener for messages from the background/popup script
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (sender.tab) return; // Ignore messages from other content scripts

        if (request.type === 'showNotificationOnPage') {
            if (window.justCodeManager && settings) {
                window.justCodeManager.showNotification(
                    request.notificationId,
                    request.text,
                    request.messageType,
                    request.showSpinner,
                    { timeout: settings.notificationTimeout, showProgressBar: settings.showNotificationProgressBar }
                );
            }
            sendResponse({ status: "Notification command processed" });
        }
        
        return true; // Keep message channel open for async response
    });

    // Listener for changes in settings from storage
    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace !== 'local' || !settings) return;

        let positionChanged = false;
        for (let [key, { newValue }] of Object.entries(changes)) {
            if (settings.hasOwnProperty(key)) {
                settings[key] = newValue;
                if (key === 'notificationPosition') {
                    positionChanged = true;
                }
            }
        }
        
        if (positionChanged && window.justCodeDOM) {
             window.justCodeDOM.applyNotificationPosition(settings.notificationPosition);
        }
    });
    
    // --- Main Initialization Logic ---
    function initialize() {
        // Request settings from the background script.
        chrome.runtime.sendMessage({ type: 'get-settings' }, (response) => {
            if (chrome.runtime.lastError) {
                console.error("JustCode: Could not get settings from background script.", chrome.runtime.lastError.message);
                // Retry after a short delay in case the background script wasn't ready.
                setTimeout(initialize, 500);
                return;
            }

            if (response && response.status === 'success') {
                settings = response.settings;
                // Once settings are loaded, apply the position and attach the keyboard listener.
                if (window.justCodeDOM) {
                    window.justCodeDOM.applyNotificationPosition(settings.notificationPosition);
                }
                attachShortcutListener();
            } else {
                 console.error("JustCode: Received invalid response from background script when fetching settings.");
            }
        });
    }

    initialize();
})();