// Driver for ChatGPT Web Dictation (Voice Input) targeting #prompt-textarea
(function() {
    'use strict';

    if (window.justCodeChatGPTDictation) return;

    function simulateClick(element) {
        if (!element) return;
        element.focus();
        const eventOptions = { bubbles: true, cancelable: true, view: window };
        element.dispatchEvent(new PointerEvent('pointerdown', eventOptions));
        element.dispatchEvent(new MouseEvent('mousedown', eventOptions));
        element.dispatchEvent(new PointerEvent('pointerup', eventOptions));
        element.dispatchEvent(new MouseEvent('mouseup', eventOptions));
        element.dispatchEvent(new MouseEvent('click', eventOptions));
    }

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
                if (label.includes('attach') || label.includes('send') || label.includes('stop generating')) continue;
                if (btn.querySelector('svg')) return btn;
            }
        }
        return null;
    }

    function findStopButton() {
        const candidates = Array.from(document.querySelectorAll('button[data-testid="dictation-stop-button"], button[data-testid*="stop-voice" i], button[aria-label="Stop dictation"], button[aria-label="Stop recording"], button[aria-label*="Stop" i], button[aria-label*="Done" i], button.bg-black[aria-label*="Stop" i], [role="dialog"] button:has(svg), button:has(svg rect)'));
        if (candidates.length > 0) return candidates[0];

        const pulse = document.querySelector('button:has([class*="animate-pulse"])');
        if (pulse) return pulse;

        return null;
    }

    window.justCodeChatGPTDictation = {
        start: async function() {
            clearPrompt();

            const btn = findDictateButton();
            if (!btn) {
                console.warn("JustCode Dictation: Dictation button not found in ChatGPT UI.");
                return { success: false, error: "Dictation button not found" };
            }

            console.log("JustCode Dictation: Activating microphone...");
            simulateClick(btn);
            return { success: true };
        },

        stop: function() {
            return new Promise((resolve) => {
                const stopBtn = findStopButton() || findDictateButton();
                if (stopBtn) {
                    console.log("JustCode Dictation: Stopping recording...");
                    simulateClick(stopBtn);
                }

                // Ensure prompt container is focused
                const container = getPromptContainer();
                if (container) container.focus();

                let isResolved = false;
                let debounceTimer = null;
                let observer = null;
                let safetyTimeout = null;
                let pollInterval = null;
                let lastSeenText = '';

                const finishExtraction = () => {
                    if (isResolved) return;
                    isResolved = true;

                    if (observer) {
                        observer.disconnect();
                        observer = null;
                    }
                    if (debounceTimer) clearTimeout(debounceTimer);
                    if (safetyTimeout) clearTimeout(safetyTimeout);
                    if (pollInterval) clearInterval(pollInterval);

                    const finalTranscript = extractTextFromPrompt();

                    // Cut/clear the prompt text area
                    clearPrompt();

                    console.log("JustCode Dictation: Final transcript extracted ->", finalTranscript);
                    resolve({ success: finalTranscript.length > 0, text: finalTranscript });
                };

                const checkState = () => {
                    if (isResolved) return;
                    const currentText = extractTextFromPrompt();

                    // Instantly trigger when text arrives from Whisper
                    if (currentText.length > 0) {
                        if (currentText !== lastSeenText) {
                            lastSeenText = currentText;
                            if (debounceTimer) clearTimeout(debounceTimer);
                            // 80ms buffer to allow full paragraph streams to settle
                            debounceTimer = setTimeout(finishExtraction, 80);
                        }
                    }
                };

                // 1. MutationObserver on #prompt-textarea and composer form
                const targetNode = document.querySelector('form') || document.querySelector('#prompt-textarea') || document.body;
                observer = new MutationObserver(() => {
                    checkState();
                });

                observer.observe(targetNode, {
                    childList: true,
                    subtree: true,
                    characterData: true
                });

                // 2. High-frequency 25ms polling fallback
                pollInterval = setInterval(() => {
                    checkState();
                }, 25);

                // Initial immediate check
                checkState();

                // 3. Generous 45s safety timeout so long dictations are never abandoned
                safetyTimeout = setTimeout(() => {
                    console.log("JustCode Dictation: Safety timeout reached (45s). Finalizing extraction...");
                    finishExtraction();
                }, 45000);
            });
        }
    };
})();