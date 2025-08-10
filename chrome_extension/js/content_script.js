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

function showNotification(id, text, type, showSpinner, fromShortcut) {
    ensureInfrastructure();

    const notificationId = `justcode-notification-${id}`;
    let notification = document.getElementById(notificationId);
    let progressBar;
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
        
        const closeBtn = document.createElement('button');
        closeBtn.className = 'justcode-notification-close-btn';
        closeBtn.innerHTML = '&times;';
        closeBtn.title = 'Close';
        
        progressBar = document.createElement('div');
        progressBar.className = 'justcode-notification-progress-bar';

        notification.appendChild(spinner);
        notification.appendChild(textSpan);
        notification.appendChild(closeBtn);
        notification.appendChild(progressBar); // Add progress bar
        notificationContainer.appendChild(notification);

        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const timerData = activeNotificationTimers.get(id);
            if (timerData) {
                clearTimeout(timerData.timerId);
                activeNotificationTimers.delete(id);
            }
            notification.classList.add('hide');
        });
        
        notification.addEventListener('animationend', (e) => {
            if (e.animationName === 'justcode-fade-out' && notification.parentNode) {
                notification.remove();
            }
        });
        
        notification.addEventListener('click', () => {
            if (notification.classList.contains('persistent')) return;
            notification.classList.add('persistent');

            const timerData = activeNotificationTimers.get(id);
            if (timerData) {
                clearTimeout(timerData.timerId);
                progressBar = notification.querySelector('.justcode-notification-progress-bar');
                if(progressBar) progressBar.style.animationPlayState = 'paused';
                activeNotificationTimers.delete(id);
            }
        });

        notification.addEventListener('mouseenter', () => {
            const timerData = activeNotificationTimers.get(id);
            if (timerData && !notification.classList.contains('persistent')) {
                progressBar = notification.querySelector('.justcode-notification-progress-bar');
                if(progressBar) progressBar.style.animationPlayState = 'paused';

                clearTimeout(timerData.timerId);
                const elapsedTime = Date.now() - timerData.startTime;
                timerData.remainingTime -= elapsedTime;
                timerData.timerId = null; // Mark as paused
            }
        });

        notification.addEventListener('mouseleave', () => {
            const timerData = activeNotificationTimers.get(id);
            if (timerData && timerData.timerId === null && !notification.classList.contains('persistent')) {
                progressBar = notification.querySelector('.justcode-notification-progress-bar');
                if(progressBar) progressBar.style.animationPlayState = 'running';

                if (timerData.remainingTime > 0) {
                    timerData.startTime = Date.now();
                    timerData.timerId = setTimeout(() => {
                        const el = document.getElementById(notificationId);
                        if (el) el.classList.add('hide');
                        activeNotificationTimers.delete(id);
                    }, timerData.remainingTime);
                } else {
                    const el = document.getElementById(notificationId);
                    if (el) el.classList.add('hide');
                    activeNotificationTimers.delete(id);
                }
            }
        });
    }

    progressBar = notification.querySelector('.justcode-notification-progress-bar');
    notification.classList.remove('hide');
    notification.classList.remove('info', 'success', 'error');
    notification.classList.add(type);
    notification.classList.toggle('with-spinner', showSpinner);
    
    const textSpan = notification.querySelector('.justcode-notification-text');
    if (textSpan) {
        textSpan.textContent = text;
    }
    
    if (isNew) {
        setTimeout(() => notification.classList.add('show'), 10);
    } else {
        notification.classList.add('show');
    }

    const existingTimer = activeNotificationTimers.get(id);
    if (existingTimer) {
        clearTimeout(existingTimer.timerId);
        activeNotificationTimers.delete(id);
    }
    
    if (progressBar) {
        progressBar.style.animation = 'none'; // Reset animation
        progressBar.style.display = 'none'; // Hide by default
    }

    if (!showSpinner && !notification.classList.contains('persistent')) {
        const timeoutDuration = notificationTimeout * 1000;
        
        if (progressBar) {
            progressBar.style.display = 'block';
            // We trigger a reflow to ensure the animation restarts correctly
            void progressBar.offsetWidth; 
            progressBar.style.animation = `justcode-progress-anim ${timeoutDuration}ms linear forwards`;
            progressBar.style.animationPlayState = 'running';
        }

        const timerId = setTimeout(() => {
            const el = document.getElementById(notificationId);
            if (el) el.classList.add('hide');
            activeNotificationTimers.delete(id);
        }, timeoutDuration);

        activeNotificationTimers.set(id, {
            timerId: timerId,
            startTime: Date.now(),
            remainingTime: timeoutDuration
        });
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
            request.showSpinner,
            request.fromShortcut || false
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