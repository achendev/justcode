(function() {
    'use strict';
    
    if (window.justCodeContentLoaded) {
        return;
    }
    window.justCodeContentLoaded = true;

    let settings = null;

    function attachShortcutListener() {
        if (document.body.dataset.justcodeListenerAttached === 'true') {
            return;
        }
        document.body.dataset.justcodeListenerAttached = 'true';

        document.addEventListener('keydown', (event) => {
            // We only care about the Alt key being pressed, without Ctrl or Meta. Shift is handled by the key/code logic.
            if (!settings || !event.altKey || event.ctrlKey || event.metaKey) {
                return;
            }

            const allowedDomains = (settings.shortcutDomains || '').split(',').map(d => d.trim().toLowerCase()).filter(Boolean);
            if (!allowedDomains.includes(window.location.hostname)) {
                return;
            }

            let command = null;
            // Use event.key for non-conflicting keys and event.code for keys that might involve Shift.
            switch (event.key) {
                case 'ArrowLeft': 
                    if (settings.isGetContextShortcutEnabled) command = 'get-context-shortcut'; 
                    break;
                case 'ArrowRight': 
                    if (settings.isDeployCodeShortcutEnabled) command = 'deploy-code-shortcut'; 
                    break;
            }
            
            // This robustly handles '<' and '>' by checking the physical key pressed ('Comma' or 'Period')
            // which works whether Shift is held down or not.
            switch (event.code) {
                case 'Comma':
                    if (settings.isUndoShortcutEnabled) command = 'undo-code-shortcut';
                    break;
                case 'Period':
                     if (settings.isRedoShortcutEnabled) command = 'redo-code-shortcut';
                     break;
            }

            if (command) {
                event.preventDefault();
                event.stopPropagation();
                chrome.runtime.sendMessage({ type: 'execute-command', command: command, hostname: window.location.hostname }); // Send hostname
            }
        }, true);
    }

    function applySettings(newSettings) {
        if (!newSettings) return;
        
        const isFirstLoad = settings === null;
        settings = newSettings;

        if (window.justCodeDOM) {
            window.justCodeDOM.applyNotificationPosition(settings.notificationPosition);
        }
        if (isFirstLoad) {
            attachShortcutListener();
        }
    }

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (sender.tab) return true;

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
        return true;
    });

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

    // --- NEW INITIALIZATION LOGIC WITH RETRIES ---
    function initialize() {
        let attempts = 0;
        const maxAttempts = 5;
        const initialDelay = 100;

        const requestSettings = () => {
            if (settings) return; // Stop if another process (like storage.onChanged) provided settings.

            attempts++;

            chrome.runtime.sendMessage({ type: 'justcode-content-script-ready' }, (response) => {
                if (chrome.runtime.lastError) {
                    // This error means the service worker is not listening yet.
                    if (attempts < maxAttempts) {
                        const delay = initialDelay * Math.pow(2, attempts - 1);
                        setTimeout(requestSettings, delay);
                    }
                    return;
                }

                if (response && response.status === 'success') {
                    applySettings(response.settings);
                } else {
                    if (attempts < maxAttempts) {
                        const delay = initialDelay * Math.pow(2, attempts - 1);
                        setTimeout(requestSettings, delay);
                    }
                }
            });
        };
        
        requestSettings();
    }

    initialize();
})();