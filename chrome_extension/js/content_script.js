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
                    { timeout: settings.notificationTimeout, showProgressBar: settings.showNotificationProgressBar },
                    request.actionsHTML // Pass optional actions HTML
                );
            }
            sendResponse({ status: "Notification processed" });
        }
        return true;
    });

    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace !== 'local' || !settings) return;
        let positionChanged = false;
        for (let [key, { newValue }] of Object.entries(changes)) {
            if (settings.hasOwnProperty(key)) {
                settings[key] = newValue;
                if (key === 'notificationPosition') positionChanged = true;
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
            if (settings) return;
            attempts++;
            chrome.runtime.sendMessage({ type: 'justcode-content-script-ready' }, (response) => {
                if (chrome.runtime.lastError) {
                    if (attempts < maxAttempts) {
                        setTimeout(requestSettings, initialDelay * Math.pow(2, attempts - 1));
                    }
                    return;
                }
                if (response && response.status === 'success') {
                    applySettings(response.settings);
                } else {
                    if (attempts < maxAttempts) {
                        setTimeout(requestSettings, initialDelay * Math.pow(2, attempts - 1));
                    }
                }
            });
        };
        requestSettings();
    }

    initialize();
})();