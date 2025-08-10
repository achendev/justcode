let notificationContainer = null;

function ensureInfrastructure() {
    // Check if elements already exist to prevent duplication on re-injection
    if (document.getElementById('justcode-notification-container')) {
        notificationContainer = document.getElementById('justcode-notification-container');
        return;
    }

    // Add the CSS file to the page's head
    const styleLink = document.createElement('link');
    styleLink.id = 'justcode-notification-styles';
    styleLink.rel = 'stylesheet';
    styleLink.type = 'text/css';
    styleLink.href = chrome.runtime.getURL('css/notification.css');
    document.head.appendChild(styleLink);
    
    // Add the container div to the page's body
    notificationContainer = document.createElement('div');
    notificationContainer.id = 'justcode-notification-container';
    notificationContainer.className = 'justcode-notification-container';
    document.body.appendChild(notificationContainer);
}

function showNotification(text, type) {
    // Make sure the container and CSS are on the page
    ensureInfrastructure();

    const notification = document.createElement('div');
    notification.className = `justcode-notification-message ${type}`;
    notification.textContent = text;
    
    notificationContainer.appendChild(notification);

    // Fade in
    setTimeout(() => {
        notification.classList.add('show');
    }, 10); // A small delay ensures the transition is applied

    // Start fade out after 3 seconds
    setTimeout(() => {
        notification.classList.add('hide');
    }, 3000);

    // Remove the element from the DOM after the fade-out animation completes
    notification.addEventListener('animationend', (e) => {
        if (e.animationName === 'justcode-fade-out') {
            notification.remove();
        }
    });
}

// Listen for messages from the background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // We only want to listen to messages from our extension's service worker, not other content scripts
    if (sender.tab) {
        return;
    }

    if (request.type === 'showNotificationOnPage') {
        showNotification(request.text, request.messageType);
        sendResponse({ status: "Notification shown" });
    }
    
    // Return true to indicate you wish to send a response asynchronously
    return true; 
});