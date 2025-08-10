let notificationContainer = null;
const activeNotificationTimers = new Map();
let notificationTimeout = 4; // Set a default

// Load initial timeout value from storage
chrome.storage.local.get({ notificationTimeout: 4 }, (data) => {
    notificationTimeout = data.notificationTimeout;
});

const ALL_POSITION_CLASSES = [
    'justcode-noti-top-left', 'justcode-noti-top-center', 'justcode-noti-top-right',
    'justcode-noti-bottom-left', 'justcode-noti-bottom-center', 'justcode-noti-bottom-right',
    'justcode-noti-left-center', 'justcode-noti-right-center'
];

function applyNotificationPosition(position) {
    if (!notificationContainer) return;
    
    // Remove all old position classes
    notificationContainer.classList.remove(...ALL_POSITION_CLASSES);

    // Add the new one. Default to bottom-left if position is invalid.
    const positionClass = `justcode-noti-${position || 'bottom-left'}`;
    if (ALL_POSITION_CLASSES.includes(positionClass)) {
        notificationContainer.classList.add(positionClass);
    } else {
        notificationContainer.classList.add('justcode-noti-bottom-left');
    }
}

function ensureInfrastructure() {
    if (document.getElementById('justcode-notification-container')) {
        notificationContainer = document.getElementById('justcode-notification-container');
        // It already exists, just make sure the position is up-to-date
        chrome.storage.local.get({ notificationPosition: 'bottom-left' }, (data) => {
            applyNotificationPosition(data.notificationPosition);
        });
        return;
    }

    const styleLink = document.createElement('link');
    styleLink.id = 'justcode-notification-styles';
    styleLink.rel = 'stylesheet';
    styleLink.type = 'text/css';
    styleLink.href = chrome.runtime.getURL('css/notification.css');
    document.head.appendChild(styleLink);
    
    notificationContainer = document.createElement('div');
    notificationContainer.id = 'justcode-notification-container';
    notificationContainer.className = 'justcode-notification-container';
    
    // Get and apply position from storage before appending to body
    chrome.storage.local.get({ notificationPosition: 'bottom-left' }, (data) => {
        applyNotificationPosition(data.notificationPosition);
        document.body.appendChild(notificationContainer);
    });
}


function showNotification(id, text, type, showSpinner) {
    ensureInfrastructure();

    const notificationId = `justcode-notification-${id}`;
    let notification = document.getElementById(notificationId);
    let isNew = false;

    if (!notification) {
        isNew = true;
        notification = document.createElement('div');
        notification.id = notificationId;
        notification.className = 'justcode-notification-message';

        const spinner = document.createElement('div');
        spinner.className = 'justcode-notification-spinner';

        const textSpan = document.createElement('span');
        textSpan.className = 'justcode-notification-text';

        notification.appendChild(spinner);
        notification.appendChild(textSpan);
        notificationContainer.appendChild(notification);

        notification.addEventListener('animationend', (e) => {
            if (e.animationName === 'justcode-fade-out' && notification.parentNode) {
                notification.remove();
            }
        });
    }

    // --- Start of Fix ---
    // Ensure the notification isn't in a hiding state from a previous timer
    notification.classList.remove('hide');

    // Manage state classes without affecting behavioral classes like .show
    notification.classList.remove('info', 'success', 'error');
    notification.classList.add(type);
    notification.classList.toggle('with-spinner', showSpinner);

    // Update the text content
    const textSpan = notification.querySelector('.justcode-notification-text');
    if (textSpan) {
        textSpan.textContent = text;
    }
    
    // Ensure the notification is visible
    if (isNew) {
        // Fade in a brand new notification
        setTimeout(() => {
            notification.classList.add('show');
        }, 10);
    } else {
        // An existing notification should already have 'show', but we ensure it's there.
        notification.classList.add('show');
    }
    // --- End of Fix ---

    // Clear any previous fade-out timer for this notification
    if (activeNotificationTimers.has(id)) {
        clearTimeout(activeNotificationTimers.get(id));
        activeNotificationTimers.delete(id);
    }
    
    // If it's a final message (no spinner), set a new timer to make it fade out
    if (!showSpinner) {
        const timer = setTimeout(() => {
            const el = document.getElementById(notificationId);
            if (el) {
                el.classList.add('hide');
            }
            activeNotificationTimers.delete(id);
        }, notificationTimeout * 1000); // Use the stored value
        activeNotificationTimers.set(id, timer);
    }
}


chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (sender.tab) {
        return;
    }

    if (request.type === 'showNotificationOnPage') {
        showNotification(
            request.notificationId, 
            request.text, 
            request.messageType, 
            request.showSpinner
        );
        sendResponse({ status: "Notification command processed" });
    }
    
    return true; 
});

chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace !== 'local') return;

    if (changes.notificationPosition) {
        applyNotificationPosition(changes.notificationPosition.newValue);
    }
    if (changes.notificationTimeout) {
        notificationTimeout = changes.notificationTimeout.newValue;
    }
});