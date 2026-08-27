// Driver for ChatGPT Web Dictation (Voice Input) targeting #prompt-textarea
(function() {
    'use strict';

    if (window.justCodeChatGPTDictation) return;

    let initialTextBeforeDictation = '';

    function getPromptContainer() {
        return document.querySelector('#prompt-textarea');
    }

    function extractTextFromPrompt() {
        const container = getPromptContainer();
        if (!container) return '';

        // Check for <p> elements inside #prompt-textarea
        const paragraphs = Array.from(container.querySelectorAll('p'));
        if (paragraphs.length > 0) {
            const pText = paragraphs
                .map(p => (p.innerText || p.textContent || '').trim())
                .filter(t => t.length > 0)
                .join('\n');
            if (pText) return pText;
        }

        if (container.tagName.toLowerCase() === 'textarea' || container.tagName.toLowerCase() === 'input') {
            return (container.value || '').trim();
        }

        return (container.innerText || container.textContent || '').trim();
    }

    function clearPrompt() {
        const container = getPromptContainer();
        if (!container) return;

        if (container.tagName.toLowerCase() === 'textarea' || container.tagName.toLowerCase() === 'input') {
            container.value = '';
        } else {
            container.innerHTML = '<p><br></p>';
        }

        container.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
        container.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function findDictateButton() {
        // Look for ChatGPT voice / dictate button
        const candidates = Array.from(document.querySelectorAll('button[data-testid="dictation-button"], button[data-testid*="voice" i], button[aria-label*="Dictat" i], button[aria-label*="voice" i], button[aria-label*="Record" i], button[aria-label*="microphone" i]'));
        if (candidates.length > 0) return candidates[0];

        // Search within the prompt form area
        const form = document.querySelector('form');
        if (form) {
            const buttons = form.querySelectorAll('button');
            for (const btn of buttons) {
                const label = (btn.getAttribute('aria-label') || '').toLowerCase();
                if (label.includes('attach') || label.includes('send') || label.includes('stop')) continue;
                if (btn.querySelector('svg')) return btn;
            }
        }
        return null;
    }

    function findStopButton() {
        // Stop or Done buttons when voice dictation is active
        const candidates = Array.from(document.querySelectorAll('button[aria-label*="Stop" i], button[aria-label*="Done" i], button[data-testid*="stop-voice" i], button[data-testid="dictation-stop-button"], button.bg-black[aria-label*="Stop" i]'));
        if (candidates.length > 0) return candidates[0];
        
        const pulse = document.querySelector('button:has([class*="animate-pulse"]), button:has(svg rect)');
        if (pulse) return pulse;

        return null;
    }

    window.justCodeChatGPTDictation = {
        start: async function() {
            initialTextBeforeDictation = extractTextFromPrompt();

            const btn = findDictateButton();
            if (!btn) {
                console.warn("JustCode Dictation: Dictation button not found in ChatGPT UI.");
                return { success: false, error: "Dictation button not found" };
            }

            console.log("JustCode Dictation: Activating microphone...");
            btn.focus();
            btn.click();
            return { success: true };
        },

        stop: function() {
            return new Promise((resolve) => {
                const stopBtn = findStopButton() || findDictateButton();
                if (stopBtn) {
                    console.log("JustCode Dictation: Stopping recording...");
                    stopBtn.click();
                }

                // Poll for Whisper text to appear and settle in #prompt-textarea/p
                let attempts = 0;
                let lastSeenText = '';
                let stableCount = 0;
                const maxAttempts = 80; // Up to 8 seconds

                const interval = setInterval(() => {
                    attempts++;
                    const currentText = extractTextFromPrompt();

                    if (currentText.length > 0) {
                        if (currentText === lastSeenText) {
                            stableCount++;
                        } else {
                            stableCount = 0;
                            lastSeenText = currentText;
                        }

                        // Text is stable for at least 300ms and stop button has vanished
                        const isStopButtonGone = !findStopButton();
                        if ((stableCount >= 3 && isStopButtonGone) || attempts >= maxAttempts) {
                            clearInterval(interval);

                            // Calculate the new portion
                            let finalTranscript = currentText;
                            if (initialTextBeforeDictation && currentText.startsWith(initialTextBeforeDictation)) {
                                finalTranscript = currentText.substring(initialTextBeforeDictation.length).trim();
                            }

                            // Cut / clean the input area
                            clearPrompt();

                            console.log("JustCode Dictation: Transcription complete ->", finalTranscript);
                            resolve({ success: true, text: finalTranscript });
                        }
                    } else if (attempts >= maxAttempts) {
                        clearInterval(interval);
                        resolve({ success: false, text: "" });
                    }
                }, 100);
            });
        }
    };
})();