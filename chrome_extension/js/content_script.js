(function() {
    'use strict';
    
    if (window.justCodeContentLoaded) {
        return;
    }
    window.justCodeContentLoaded = true;

    let settings = null;

    function applySettings(newSettings) {
        if (!newSettings) return;
        
        settings = newSettings;

        if (window.justCodeDOM) {
            window.justCodeDOM.applyNotificationPosition(settings.notificationPosition);
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