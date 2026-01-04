// Part of the JustCode notification system.
// Orchestrator for DOM, timer, and events.

(function() {
    'use strict';

    function attachEventListeners(notification, id) {
        const progressBar = notification.querySelector('.justcode-notification-progress-bar');

        // Close button
        notification.querySelector('.justcode-notification-close-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            // If declined explicitly via close, we might want to signal that, but for now simple close.
            if (notification.querySelector('.jc-btn-decline')) {
                chrome.runtime.sendMessage({ type: 'auto_deploy_response', approved: false });
            }
            window.justCodeTimer.clear(id);
            notification.classList.add('hide');
        });
        
        // Hide animation end
        notification.addEventListener('animationend', (e) => {
            if (e.animationName === 'justcode-fade-out' && notification.parentNode) {
                notification.remove();
            }
        });
        
        // Click main body to make persistent (unless clicking an action)
        notification.addEventListener('click', (e) => {
            if (e.target.closest('.justcode-notification-actions') || e.target.closest('.justcode-notification-close-btn')) return;
            
            if (notification.classList.contains('persistent')) return;
            notification.classList.add('persistent');
            window.justCodeTimer.clear(id);
            if (progressBar) progressBar.style.animationPlayState = 'paused';
        });

        // Hover pause
        notification.addEventListener('mouseenter', () => {
            if (notification.classList.contains('persistent')) return;
            window.justCodeTimer.pause(id);
            if (progressBar) progressBar.style.animationPlayState = 'paused';
        });

        // Hover resume
        notification.addEventListener('mouseleave', () => {
            if (notification.classList.contains('persistent')) return;
            window.justCodeTimer.resume(id);
            if (progressBar) progressBar.style.animationPlayState = 'running';
        });
    }

    // Attach dynamic action listeners (Allow/Decline/Select)
    function attachActionListeners(notification, id) {
        const actionsContainer = notification.querySelector('.justcode-notification-actions');
        
        // Delegated listener for the actions container
        actionsContainer.onclick = (e) => {
            if (e.target.classList.contains('jc-btn-allow')) {
                // User clicked "Allow"
                chrome.runtime.sendMessage({ type: 'auto_deploy_response', approved: true });
                
                // Switch to loading state visually
                const textSpan = notification.querySelector('.justcode-notification-text');
                textSpan.textContent = "Approving...";
                actionsContainer.style.display = 'none'; // Hide buttons immediately
                notification.classList.add('with-spinner');
                
            } else if (e.target.classList.contains('jc-btn-decline')) {
                // User clicked "Decline"
                chrome.runtime.sendMessage({ type: 'auto_deploy_response', approved: false });
                window.justCodeTimer.clear(id);
                notification.classList.add('hide');
            }
        };

        // Change listener for Policy Select
        actionsContainer.onchange = (e) => {
            if (e.target.classList.contains('jc-policy-select')) {
                const newPolicy = e.target.value;
                chrome.runtime.sendMessage({ type: 'update_agent_policy', policy: newPolicy });
            }
        };
    }

    window.justCodeManager = {
        /**
         * @param {string} id - Notification ID
         * @param {string} text - Message text
         * @param {string} type - 'info', 'success', 'error'
         * @param {boolean} showSpinner
         * @param {object} settings - { timeout, showProgressBar }
         * @param {string} [actionsHTML] - Optional HTML for buttons/selectors
         */
        showNotification: function(id, text, type, showSpinner, settings, actionsHTML = null) {
            window.justCodeDOM.ensureInfrastructure();

            const notificationId = `justcode-notification-${id}`;
            let notification = document.getElementById(notificationId);
            let isNew = false;

            if (!notification) {
                isNew = true;
                notification = window.justCodeDOM.createNotificationElement(id);
                window.justCodeDOM.notificationContainer.appendChild(notification);
                attachEventListeners(notification, id);
                attachActionListeners(notification, id);
            }

            const progressBar = notification.querySelector('.justcode-notification-progress-bar');
            notification.classList.remove('hide', 'info', 'success', 'error');
            notification.classList.add(type);
            notification.classList.toggle('with-spinner', showSpinner);
            
            const textSpan = notification.querySelector('.justcode-notification-text');
            if (textSpan) textSpan.innerHTML = text;

            // Handle Actions
            const actionsDiv = notification.querySelector('.justcode-notification-actions');
            if (actionsHTML) {
                actionsDiv.innerHTML = actionsHTML;
                actionsDiv.style.display = 'flex';
                // If actions are present (like Review request), execute logically shouldn't imply auto-hide,
                // but we let the caller control that via 'persistent' class or spinner.
                // We enforce persistence for Review requests generally.
            } else {
                actionsDiv.style.display = 'none';
                actionsDiv.innerHTML = '';
            }
            
            if (isNew) {
                setTimeout(() => notification.classList.add('show'), 10);
            } else {
                notification.classList.add('show');
            }

            window.justCodeTimer.clear(id);
            if (progressBar) {
                progressBar.style.animation = 'none';
                progressBar.style.display = 'none';
            }

            // Start timer if not spinner and not persistent (unless it's an "Always Allow" success message which has actions but should timeout)
            // Rule: If actions contains buttons (allow/decline), make persistent. If just selector, allow timeout.
            const hasInteractiveButtons = actionsHTML && actionsHTML.includes('jc-btn-allow');
            const shouldPersist = showSpinner || notification.classList.contains('persistent') || hasInteractiveButtons;

            if (!shouldPersist) {
                const timeoutDuration = settings.timeout * 1000;
                if (settings.showProgressBar && progressBar) {
                    progressBar.style.display = 'block';
                    void progressBar.offsetWidth; 
                    progressBar.style.animation = `justcode-progress-anim ${timeoutDuration}ms linear forwards`;
                    progressBar.style.animationPlayState = 'running';
                }
                window.justCodeTimer.start(id, timeoutDuration);
            }
        }
    };
})();