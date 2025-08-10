// Part of the JustCode notification system.
// This file is responsible for all direct DOM manipulation.
// It creates, finds, updates, and positions notification elements.

(function() {
    'use strict';

    // Namespace to avoid global scope pollution
    window.justCodeDOM = {
        notificationContainer: null,
        ALL_POSITION_CLASSES: [
            'justcode-noti-top-left', 'justcode-noti-top-center', 'justcode-noti-top-right',
            'justcode-noti-bottom-left', 'justcode-noti-bottom-center', 'justcode-noti-bottom-right',
            'justcode-noti-left-center', 'justcode-noti-right-center'
        ],

        /**
         * Ensures the main container and stylesheet are present in the DOM.
         */
        ensureInfrastructure: function() {
            if (document.getElementById('justcode-notification-container')) {
                this.notificationContainer = document.getElementById('justcode-notification-container');
                return;
            }

            const styleLink = document.createElement('link');
            styleLink.id = 'justcode-notification-styles';
            styleLink.rel = 'stylesheet';
            styleLink.type = 'text/css';
            styleLink.href = chrome.runtime.getURL('css/notification.css');
            document.head.appendChild(styleLink);
            
            this.notificationContainer = document.createElement('div');
            this.notificationContainer.id = 'justcode-notification-container';
            this.notificationContainer.className = 'justcode-notification-container';
            
            // Get and apply position from storage before appending to body
            chrome.storage.local.get({ notificationPosition: 'bottom-left' }, (data) => {
                this.applyNotificationPosition(data.notificationPosition);
                document.body.appendChild(this.notificationContainer);
            });
        },

        /**
         * Applies the correct CSS class to the container to position it.
         * @param {string} position The desired position (e.g., 'bottom-left').
         */
        applyNotificationPosition: function(position) {
            if (!this.notificationContainer) return;
            
            this.notificationContainer.classList.remove(...this.ALL_POSITION_CLASSES);

            const positionClass = `justcode-noti-${position || 'bottom-left'}`;
            this.notificationContainer.classList.add(
                this.ALL_POSITION_CLASSES.includes(positionClass) ? positionClass : 'justcode-noti-bottom-left'
            );
        },

        /**
         * Creates a new notification element with all its inner parts.
         * @param {string} id The unique ID for the notification message.
         * @returns {HTMLElement} The fully constructed notification element.
         */
        createNotificationElement: function(id) {
            const notification = document.createElement('div');
            notification.id = `justcode-notification-${id}`;
            notification.className = 'justcode-notification-message';

            notification.innerHTML = `
                <div class="justcode-notification-spinner"></div>
                <span class="justcode-notification-text"></span>
                <button class="justcode-notification-close-btn" title="Close">&times;</button>
                <div class="justcode-notification-progress-bar"></div>
            `;
            
            return notification;
        }
    };
})();