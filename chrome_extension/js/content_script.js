// Part of the JustCode notification system.
// This is the main entry point for the content scripts.
// Its only jobs are to initialize global state and set up
// the listeners for chrome.runtime and chrome.storage.

(function() {
    'use strict';

    let settings = {
        timeout: 4,
        showProgressBar: true,
        position: 'bottom-left'
    };

    // Load initial settings from storage
    chrome.storage.local.get({
        notificationTimeout: 4,
        showNotificationProgressBar: true,
        notificationPosition: 'bottom-left'
    }, (data) => {
        settings.timeout = data.notificationTimeout;
        settings.showProgressBar = data.showNotificationProgressBar;
        settings.position = data.notificationPosition;
        
        // This check is in case the DOM script is already running
        if (window.justCodeDOM) {
            window.justCodeDOM.applyNotificationPosition(settings.position);
        }
    });

    // Listener for messages from the background script
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (sender.tab) return; // Ignore messages from other content scripts

        if (request.type === 'showNotificationOnPage') {
            // Ensure the manager is available before calling it
            if (window.justCodeManager) {
                window.justCodeManager.showNotification(
                    request.notificationId,
                    request.text,
                    request.messageType,
                    request.showSpinner,
                    settings // Pass the current settings
                );
            }
            sendResponse({ status: "Notification command processed" });
        }
        
        return true; // Keep message channel open for async response
    });

    // Listener for changes in settings
    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace !== 'local') return;

        let positionChanged = false;
        if (changes.notificationPosition) {
            settings.position = changes.notificationPosition.newValue;
            positionChanged = true;
        }
        if (changes.notificationTimeout) {
            settings.timeout = changes.notificationTimeout.newValue;
        }
        if (changes.showNotificationProgressBar) {
            settings.showProgressBar = changes.showNotificationProgressBar.newValue;
        }
        
        if (positionChanged && window.justCodeDOM) {
             window.justCodeDOM.applyNotificationPosition(settings.position);
        }
    });

})();