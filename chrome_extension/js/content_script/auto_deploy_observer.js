(function() {
    'use strict';

    if (window.justCodeAutoDeployObserver) {
        return;
    }

    const POLLING_INTERVAL = 800; // ms
    let isObserverActive = false;
    let wasGenerating = false;
    let pollingTimer = null;

    // Namespace for control
    window.justCodeAutoDeployObserver = {
        start: function() {
            if (isObserverActive) return;
            console.log("JustCode: Auto-deploy observer started.");
            isObserverActive = true;
            wasGenerating = false; // Reset state
            pollingTimer = setInterval(checkState, POLLING_INTERVAL);
        },
        stop: function() {
            if (!isObserverActive) return;
            console.log("JustCode: Auto-deploy observer stopped.");
            isObserverActive = false;
            if (pollingTimer) {
                clearInterval(pollingTimer);
                pollingTimer = null;
            }
        }
    };

    function checkState() {
        if (!isObserverActive) return;

        let isGenerating = false;

        // 1. AI Studio detection (Updated based on user HTML)
        // We look for the button inside the ms-run-button component
        const msRunButton = document.querySelector('ms-run-button button');
        
        if (msRunButton) {
            // The button is considered "generating" if it contains a spinner or the text "Stop"
            const hasSpinner = !!msRunButton.querySelector('.spin');
            // Check text content safely
            const text = msRunButton.textContent || "";
            const hasStopText = text.includes('Stop');
            
            if (hasSpinner || hasStopText) {
                isGenerating = true;
            }
        } else {
            // 2. Generic/Fallback detection for other platforms or variations
            // ChatGPT often uses aria-label="Stop generating"
            const stopButton = document.querySelector('.run-button.stop, button[aria-label="Stop generating"], button[data-testid="stop-button"]');
            if (stopButton) {
                isGenerating = true;
            }
        }

        if (isGenerating) {
            if (!wasGenerating) {
                console.log("JustCode: Generation started (active run button detected).");
            }
            wasGenerating = true;
        } else {
            // Not generating now.
            if (wasGenerating) {
                // Transitioned from Generating -> Idle
                console.log("JustCode: Generation finished. Triggering auto-deploy.");
                wasGenerating = false;
                
                // Send message to extension
                try {
                    chrome.runtime.sendMessage({ type: 'auto_deploy_trigger' });
                } catch (e) {
                    console.warn("JustCode: Failed to trigger auto-deploy. Extension might be closed.", e);
                    // If extension context is invalid, stop the observer to prevent spam/errors
                    window.justCodeAutoDeployObserver.stop();
                }
            }
        }
    }
})();