// Driver for ChatGPT Web Dictation (Voice Input)
(function() {
    'use strict';

    if (window.justCodeChatGPTDictation) return;

    let isDictating = false;
    let initialTextBeforeDictation = '';

    function getPromptTextarea() {
        return document.querySelector('div#prompt-textarea, textarea#prompt-textarea, [contenteditable="true"]#prompt-textarea, textarea[data-id="root"]');
    }

    function getTextContent(el) {
        if (!el) return '';
        if (el.tagName.toLowerCase() === 'textarea' || el.tagName.toLowerCase() === 'input') {
            return el.value || '';
        }
        return el.innerText || el.textContent || '';
    }

    function clearPromptTextarea(el) {
        if (!el) return;
        if (el.tagName.toLowerCase() === 'textarea' || el.tagName.toLowerCase() === 'input') {
            el.value = '';
        } else {
            el.innerHTML = '<p><br></p>';
        }
        el.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function findDictationButton() {
        // Priority 1: Specific aria-labels / data-testids for voice & dictation
        const candidates = Array.from(document.querySelectorAll('button[aria-label*="voice" i], button[aria-label*="dictat" i], button[aria-label*="record" i], button[aria-label*="microphone" i], button[data-testid*="dictat" i], button[data-testid*="voice" i]'));
        if (candidates.length > 0) return candidates[0];

        // Priority 2: Audio/Mic SVG icon buttons within prompt composer
        const composerForm = document.querySelector('form, [class*="composer"], [class*="prompt"]');
        if (composerForm) {
            const buttons = composerForm.querySelectorAll('button');
            for (const btn of buttons) {
                const label = (btn.getAttribute('aria-label') || '').toLowerCase();
                if (label.includes('attach') || label.includes('send') || label.includes('stop generating')) continue;
                const svgs = btn.querySelectorAll('svg');
                if (svgs.length > 0) return btn;
            }
        }
        return null;
    }

    function findStopButton() {
        // Look for glowing stop button or stop aria-label inside voice container
        const candidates = Array.from(document.querySelectorAll('button[aria-label*="stop" i], button[aria-label*="done" i], button[data-testid*="stop-voice" i], button.bg-black[aria-label*="stop" i]'));
        if (candidates.length > 0) return candidates[0];
        
        // Secondary: Find pulsating/recording indicators
        const pulseButton = document.querySelector('button:has([class*="animate-pulse"]), button[class*="recording"], button[class*="active-voice"]');
        if (pulseButton) return pulseButton;

        return null;
    }

    window.justCodeChatGPTDictation = {
        start: async function() {
            const textarea = getPromptTextarea();
            initialTextBeforeDictation = textarea ? getTextContent(textarea) : '';

            const btn = findDictationButton();
            if (!btn) {
                console.warn("JustCode Dictation: Dictation button not found in ChatGPT DOM.");
                return { success: false, error: "Dictation button not found" };
            }

            console.log("JustCode Dictation: Clicking dictation button to start recording...");
            btn.focus();
            btn.click();
            isDictating = true;
            return { success: true };
        },

        stop: function() {
            return new Promise((resolve) => {
                const textarea = getPromptTextarea();
                const stopBtn = findStopButton() || findDictationButton();

                if (stopBtn) {
                    console.log("JustCode Dictation: Clicking stop button...");
                    stopBtn.click();
                } else {
                    console.warn("JustCode Dictation: Stop button not found, awaiting natural transcript input...");
                }

                // Poll for transcription completion (wait until text changes or stabilizes)
                let attempts = 0;
                const maxAttempts = 60; // Up to 6 seconds

                const checkInterval = setInterval(() => {
                    attempts++;
                    const currentText = textarea ? getTextContent(textarea).trim() : '';

                    // Check if new transcript has populated
                    const isNewTextAvailable = currentText.length > initialTextBeforeDictation.trim().length;
                    const stopButtonGone = !findStopButton();

                    if ((isNewTextAvailable && stopButtonGone) || attempts >= maxAttempts) {
                        clearInterval(checkInterval);
                        isDictating = false;

                        // Calculate difference (the newly dictated portion)
                        let transcript = currentText;
                        if (initialTextBeforeDictation && currentText.startsWith(initialTextBeforeDictation)) {
                            transcript = currentText.substring(initialTextBeforeDictation.length).trim();
                        }

                        // Clear the textarea for the next dictation
                        if (textarea) {
                            clearPromptTextarea(textarea);
                        }

                        console.log("JustCode Dictation: Finished. Result:", transcript);
                        resolve({ success: true, text: transcript });
                    }
                }, 100);
            });
        }
    };
})();