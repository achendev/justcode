import * as messageHandlers from '../ui_handlers/message.js';

let isGlobalListenerAttached = false;

export function attachMessageEventListeners() {
    document.querySelectorAll('.close-message').forEach(button => {
        button.addEventListener('click', messageHandlers.handleCloseMessage);
    });

    // Ensure we only attach the global delegate listener once per popup session
    if (!isGlobalListenerAttached) {
        // Handle clicks on chrome:// links in messages (which are blocked by default in popups)
        document.body.addEventListener('click', (e) => {
            if (e.target.tagName === 'A' && e.target.href && e.target.href.startsWith('chrome://')) {
                e.preventDefault();
                chrome.tabs.create({ url: e.target.href });
            }
        });
        isGlobalListenerAttached = true;
    }
}