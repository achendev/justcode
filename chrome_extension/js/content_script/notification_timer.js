// Part of the JustCode notification system.
// This file is responsible for managing all timer-related logic.
// It starts, stops, pauses, and resumes the auto-hide functionality.

(function() {
    'use strict';

    // Namespace to avoid global scope pollution
    window.justCodeTimer = {
        activeNotificationTimers: new Map(),

        /**
         * Starts the auto-hide timer for a given notification.
         * @param {string} id The unique ID of the notification.
         * @param {number} timeoutDuration The duration in milliseconds.
         */
        start: function(id, timeoutDuration) {
            const timerId = setTimeout(() => {
                const el = document.getElementById(`justcode-notification-${id}`);
                if (el) el.classList.add('hide');
                this.activeNotificationTimers.delete(id);
            }, timeoutDuration);

            this.activeNotificationTimers.set(id, {
                timerId: timerId,
                startTime: Date.now(),
                remainingTime: timeoutDuration
            });
        },

        /**
         * Clears any active timer for a notification.
         * @param {string} id The unique ID of the notification.
         */
        clear: function(id) {
            const timerData = this.activeNotificationTimers.get(id);
            if (timerData) {
                clearTimeout(timerData.timerId);
                this.activeNotificationTimers.delete(id);
            }
        },

        /**
         * Pauses the timer, for example on mouse hover.
         * @param {string} id The unique ID of the notification.
         */
        pause: function(id) {
            const timerData = this.activeNotificationTimers.get(id);
            if (timerData) {
                clearTimeout(timerData.timerId);
                const elapsedTime = Date.now() - timerData.startTime;
                timerData.remainingTime -= elapsedTime;
                timerData.timerId = null; // Mark as paused
            }
        },

        /**
         * Resumes a paused timer.
         * @param {string} id The unique ID of the notification.
         */
        resume: function(id) {
            const timerData = this.activeNotificationTimers.get(id);
            // Only resume if it was actually paused (timerId is null)
            if (timerData && timerData.timerId === null) {
                if (timerData.remainingTime > 0) {
                    timerData.startTime = Date.now();
                    timerData.timerId = setTimeout(() => {
                        const el = document.getElementById(`justcode-notification-${id}`);
                        if (el) el.classList.add('hide');
                        this.activeNotificationTimers.delete(id);
                    }, timerData.remainingTime);
                } else {
                    // Time's up, hide it now
                    const el = document.getElementById(`justcode-notification-${id}`);
                    if (el) el.classList.add('hide');
                    this.activeNotificationTimers.delete(id);
                }
            }
        }
    };
})();