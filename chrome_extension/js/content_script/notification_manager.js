// Part of the JustCode notification system.
// This file is the main orchestrator, connecting DOM, timer, and event logic.
// It exposes the main `showNotification` function.

(function() {
    'use strict';

    // Attach event listeners to a newly created notification element.
    function attachEventListeners(notification, id) {
        const progressBar = notification.querySelector('.justcode-notification-progress-bar');

        // Close button click
        notification.querySelector('.justcode-notification-close-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            window.justCodeTimer.clear(id);
            notification.classList.add('hide');
        });
        
        // Hide animation end
        notification.addEventListener('animationend', (e) => {
            if (e.animationName === 'justcode-fade-out' && notification.parentNode) {
                notification.remove();
            }
        });
        
        // Click to make persistent
        notification.addEventListener('click', () => {
            if (notification.classList.contains('persistent')) return;
            notification.classList.add('persistent');
            window.justCodeTimer.clear(id);
            if (progressBar) progressBar.style.animationPlayState = 'paused';
        });

        // Pause on hover
        notification.addEventListener('mouseenter', () => {
            if (notification.classList.contains('persistent')) return;
            window.justCodeTimer.pause(id);
            if (progressBar) progressBar.style.animationPlayState = 'paused';
        });

        // Resume on leave
        notification.addEventListener('mouseleave', () => {
            if (notification.classList.contains('persistent')) return;
            window.justCodeTimer.resume(id);
            if (progressBar) progressBar.style.animationPlayState = 'running';
        });
    }

    // Namespace to avoid global scope pollution
    window.justCodeManager = {
        /**
         * The main public function to display or update a notification.
         * @param {string} id - The unique ID for this notification action.
         * @param {string} text - The message to display.
         * @param {string} type - 'info', 'success', or 'error'.
         * @param {boolean} showSpinner - Whether to show a loading spinner.
         * @param {object} settings - An object with { timeout, showProgressBar }.
         */
        showNotification: function(id, text, type, showSpinner, settings) {
            window.justCodeDOM.ensureInfrastructure();

            const notificationId = `justcode-notification-${id}`;
            let notification = document.getElementById(notificationId);
            let isNew = false;

            if (!notification) {
                isNew = true;
                notification = window.justCodeDOM.createNotificationElement(id);
                window.justCodeDOM.notificationContainer.appendChild(notification);
                attachEventListeners(notification, id);
            }

            const progressBar = notification.querySelector('.justcode-notification-progress-bar');
            notification.classList.remove('hide', 'info', 'success', 'error');
            notification.classList.add(type);
            notification.classList.toggle('with-spinner', showSpinner);
            
            const textSpan = notification.querySelector('.justcode-notification-text');
            if (textSpan) textSpan.textContent = text;
            
            // Trigger fade-in animation
            if (isNew) {
                setTimeout(() => notification.classList.add('show'), 10);
            } else {
                notification.classList.add('show');
            }

            // Clear any previous timer for this ID
            window.justCodeTimer.clear(id);
            
            // Reset and hide progress bar by default
            if (progressBar) {
                progressBar.style.animation = 'none';
                progressBar.style.display = 'none';
            }

            // Start a new timer if the notification is not a persistent spinner
            if (!showSpinner && !notification.classList.contains('persistent')) {
                const timeoutDuration = settings.timeout * 1000;
                
                if (settings.showProgressBar && progressBar) {
                    progressBar.style.display = 'block';
                    // Trigger a reflow to ensure the animation restarts correctly
                    void progressBar.offsetWidth; 
                    progressBar.style.animation = `justcode-progress-anim ${timeoutDuration}ms linear forwards`;
                    progressBar.style.animationPlayState = 'running';
                }

                window.justCodeTimer.start(id, timeoutDuration);
            }
        }
    };

})();