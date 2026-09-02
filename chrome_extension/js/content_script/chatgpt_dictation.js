// Driver for ChatGPT Web Dictation (Voice Input) targeting #prompt-textarea
(function() {
    'use strict';

    const DRIVER_VERSION = 4;
    if (window.justCodeChatGPTDictation?.version === DRIVER_VERSION) return;

    let recordingState = 'idle';
    let recordingGeneration = 0;
    let activeSessionId = null;
    let cancelPendingExtraction = null;
    const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    function trace(event, sessionId = activeSessionId, details = {}) {
        try {
            chrome.runtime.sendMessage({
                type: 'dictation_debug_trace',
                event,
                sessionId,
                details: { recordingState, recordingGeneration, ...details }
            }).catch(() => {});
        } catch (error) {}
    }

    async function waitFor(getValue, timeoutMs) {
        const deadline = Date.now() + timeoutMs;
        let value = getValue();
        while (!value && Date.now() < deadline) {
            await delay(25);
            value = getValue();
        }
        return value;
    }

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

        container.focus();
        if (container.tagName.toLowerCase() === 'textarea' || container.tagName.toLowerCase() === 'input') {
            const prototype = container.tagName.toLowerCase() === 'textarea'
                ? HTMLTextAreaElement.prototype
                : HTMLInputElement.prototype;
            const valueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
            if (valueSetter) valueSetter.call(container, '');
            else container.value = '';
        } else {
            // Use the browser's editing path first so React receives the same
            // mutation it would receive from a user deleting composer text.
            try {
                const selection = window.getSelection();
                const range = document.createRange();
                range.selectNodeContents(container);
                selection.removeAllRanges();
                selection.addRange(range);
                document.execCommand('delete', false);
                selection.removeAllRanges();
            } catch (error) {}
            if ((container.innerText || container.textContent || '').trim()) {
                container.innerHTML = '<p><br></p>';
            }
        }

        try {
            container.dispatchEvent(new InputEvent('input', {
                bubbles: true,
                composed: true,
                inputType: 'deleteContentBackward',
                data: null
            }));
        } catch (error) {
            container.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
        }
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

    function isVisible(element) {
        return Boolean(
            element &&
            !element.disabled &&
            element.getClientRects().length > 0
        );
    }

    function findIdleDictateButton() {
        // Keep this deliberately stricter than findDictateButton(). Its broad
        // SVG fallback is useful for starting, but cannot prove that ChatGPT
        // has returned to the idle dictation state.
        const candidates = Array.from(document.querySelectorAll([
            'button[data-testid="dictation-button"]',
            'button[data-testid*="dictation" i][aria-label]',
            'button[aria-label="Dictate"]',
            'button[aria-label*="Start dictation" i]',
            'button[aria-label*="voice input" i]',
            'button[aria-label*="microphone" i]'
        ].join(', ')));
        return candidates.find(isVisible) || null;
    }

    function findActiveDictationIndicator() {
        const activityPattern = /\b(listening|transcribing|processing|recording)\b/i;
        const candidates = Array.from(document.querySelectorAll([
            '[role="status"]',
            '[role="alert"]',
            '[aria-live="polite"]',
            '[aria-live="assertive"]',
            '[data-sonner-toast]',
            '[data-radix-toast-viewport] > *',
            '[aria-label*="listening" i]',
            '[aria-label*="transcrib" i]',
            '[aria-label*="processing" i]'
        ].join(', ')));

        return candidates.find(element => {
            if (!isVisible(element)) return false;
            const description = [
                element.getAttribute('aria-label') || '',
                element.getAttribute('title') || '',
                element.innerText || element.textContent || ''
            ].join(' ');
            const hasSpinner = Boolean(element.querySelector?.(
                '[class*="animate-spin"], [class*="animate-pulse"], [aria-busy="true"], [data-loading="true"]'
            ));
            return activityPattern.test(description) || hasSpinner;
        }) || null;
    }

    function readPostStopUiState() {
        const prompt = getPromptContainer();
        const recordingControlVisible = Boolean(findStopButton() || findCancelButton());
        const processingIndicatorVisible = Boolean(
            findActiveDictationIndicator() ||
            prompt?.closest('form')?.querySelector('[aria-busy="true"]')
        );
        const idleDictateButtonVisible = Boolean(findIdleDictateButton());
        return {
            recordingControlVisible,
            processingIndicatorVisible,
            idleDictateButtonVisible,
            terminalEmpty: (
                !recordingControlVisible &&
                !processingIndicatorVisible &&
                idleDictateButtonVisible
            )
        };
    }

    function findStopButton() {
        const root = getPromptContainer()?.closest('form') || document;
        const candidates = Array.from(root.querySelectorAll('button[data-testid="dictation-stop-button"], button[data-testid*="stop-voice" i], button[aria-label="Stop dictation"], button[aria-label="Stop recording"], button[aria-label*="Stop" i], button[aria-label*="Done" i], button[title*="Stop" i], button.bg-black[aria-label*="Stop" i], button:has(svg rect), [role="button"]:has(svg rect)'));
        const visibleCandidate = candidates.find(button =>
            !button.disabled && button.getClientRects().length > 0
        );
        if (visibleCandidate) return visibleCandidate;

        const pulse = document.querySelector('button:has([class*="animate-pulse"])');
        if (pulse && !pulse.disabled && pulse.getClientRects().length > 0) return pulse;

        return null;
    }

    function findCancelButton() {
        const root = getPromptContainer()?.closest('form');
        if (!root) return null;
        const candidates = Array.from(root.querySelectorAll('button[data-testid*="cancel" i], button[aria-label*="cancel" i], button[title*="cancel" i], button[aria-label="Close"], button[title="Close"]'));
        return candidates.find(button =>
            !button.disabled && button.getClientRects().length > 0
        ) || null;
    }

    async function forceRecordingStopped(timeoutMs, cancel) {
        // Never fall back to the dictate/start button here. That old fallback
        // could turn a fast key release into a brand-new recording.
        const deadline = Date.now() + timeoutMs;
        let stopButton = null;
        while (Date.now() < deadline) {
            const cancelButton = cancel ? findCancelButton() : null;
            if (cancelButton) {
                console.log("JustCode Dictation: Cancelling recording...");
                trace('driver_cancel_control_clicked');
                simulateClick(cancelButton);
                return true;
            }
            stopButton = findStopButton();
            if (stopButton) break;
            await delay(25);
        }
        if (!stopButton) return false;

        console.log("JustCode Dictation: Stopping recording...");
        trace('driver_stop_control_clicked');
        simulateClick(stopButton);

        // ChatGPT occasionally misses the first synthetic click while its
        // recording controls are still transitioning. Retry only if a real
        // stop control remains; never click the microphone/start control.
        await delay(120);
        const remainingStopButton = findStopButton();
        if (remainingStopButton === stopButton && stopButton.isConnected) {
            simulateClick(stopButton);
            await delay(120);
        }
        return true;
    }

    async function guardAgainstLateRecording(generation, cancel) {
        // If ChatGPT creates its recording UI unusually late, stop it when it
        // finally appears. A newer start invalidates this guard so it cannot
        // cancel the user's next intentional dictation.
        const deadline = Date.now() + 30000;
        while (recordingGeneration === generation && Date.now() < deadline) {
            const lateCancelButton = cancel ? findCancelButton() : null;
            if (lateCancelButton) {
                console.log("JustCode Dictation: Cancelling late recording UI...");
                simulateClick(lateCancelButton);
                return;
            }
            const lateStopButton = findStopButton();
            if (lateStopButton) {
                console.log("JustCode Dictation: Stopping late recording control...");
                simulateClick(lateStopButton);
                return;
            }
            await delay(100);
        }
    }

    window.justCodeChatGPTDictation = {
        version: DRIVER_VERSION,

        start: async function(sessionId = null) {
            trace('driver_start_entered', sessionId, { previousSessionId: activeSessionId });
            if ((recordingState === 'recording' || recordingState === 'starting') &&
                activeSessionId === sessionId) {
                trace('driver_duplicate_start_ignored', sessionId);
                return { success: true };
            }

            // A new hotkey session supersedes an older transcript wait. Resolve
            // that promise immediately so it cannot occupy the extension for
            // its 3–15 second safety timeout or clear the new session's text.
            if (cancelPendingExtraction) {
                cancelPendingExtraction();
                cancelPendingExtraction = null;
            }

            const previousState = recordingState;
            recordingGeneration += 1;
            const generation = recordingGeneration;
            activeSessionId = sessionId;
            recordingState = 'starting';

            // Repeated or interrupted presses can leave a real ChatGPT stop/X
            // control behind. Remove only a verified recording control before
            // clicking the microphone for the new generation.
            const previousControlVisible = Boolean(findStopButton() || findCancelButton());
            if (previousControlVisible || previousState === 'recording' || previousState === 'starting') {
                trace('driver_start_cleaning_previous_ui', sessionId, { previousState });
                await forceRecordingStopped(previousControlVisible ? 800 : 300, true);
                await delay(80);
                if (recordingGeneration !== generation) {
                    return { success: false, superseded: true };
                }
            }

            clearPrompt();

            const btn = await waitFor(findDictateButton, 1500);
            if (!btn) {
                recordingState = 'idle';
                activeSessionId = null;
                trace('driver_dictation_button_missing', sessionId);
                console.warn("JustCode Dictation: Dictation button not found in ChatGPT UI.");
                return { success: false, error: "Dictation button not found" };
            }

            console.log("JustCode Dictation: Activating microphone...");
            simulateClick(btn);
            recordingState = 'recording';
            trace('driver_microphone_clicked', sessionId);
            return { success: true };
        },

        stop: async function(options = {}) {
            const cancel = options.cancel === true;
            const durationMs = options.durationMs || 0;
            const sessionId = options.sessionId ?? activeSessionId;
            trace('driver_stop_entered', sessionId, { cancel, durationMs, activeSessionId });

            // A late stop from an older session must never stop the microphone
            // belonging to a newer press.
            if (sessionId != null && sessionId !== activeSessionId) {
                trace('driver_stale_stop_ignored', sessionId, { activeSessionId });
                return { success: false, text: "", cancelled: true, superseded: true };
            }

            const stoppedGeneration = recordingGeneration;
            recordingState = 'stopping';
            const stopped = await forceRecordingStopped(cancel ? 800 : 1500, cancel);
            trace('driver_stop_control_result', sessionId, { stopped });
            if (!stopped) {
                guardAgainstLateRecording(stoppedGeneration, cancel);
            }

            if (cancel) {
                if (recordingGeneration === stoppedGeneration) {
                    clearPrompt();
                    recordingState = 'idle';
                    activeSessionId = null;
                }
                trace('driver_stop_cancelled', sessionId);
                console.log("JustCode Dictation: Fast tap cancelled.");
                return { success: false, text: "", cancelled: true };
            }

            return new Promise((resolve) => {
                // Ensure prompt container is focused
                const container = getPromptContainer();
                if (container) container.focus();

                let isResolved = false;
                let debounceTimer = null;
                let observer = null;
                let safetyTimeout = null;
                let pollInterval = null;
                let lastSeenText = '';
                let emptyIdleSince = null;
                let lastUiStateSignature = null;

                const finishExtraction = (superseded = false, reason = 'text') => {
                    if (isResolved) return;
                    isResolved = true;

                    if (observer) {
                        observer.disconnect();
                        observer = null;
                    }
                    if (debounceTimer) clearTimeout(debounceTimer);
                    if (safetyTimeout) clearTimeout(safetyTimeout);
                    if (pollInterval) clearInterval(pollInterval);
                    if (cancelPendingExtraction === cancelThisExtraction) {
                        cancelPendingExtraction = null;
                    }

                    // Never inspect or clear the composer after a newer start;
                    // it may already contain that newer session's audio/text.
                    const finalTranscript = superseded ? '' : extractTextFromPrompt();

                    if (!superseded && recordingGeneration === stoppedGeneration) {
                        clearPrompt();
                        recordingState = 'idle';
                        activeSessionId = null;
                    }

                    trace('driver_extraction_finished', sessionId, {
                        reason,
                        superseded,
                        textLength: finalTranscript.length
                    });
                    console.log("JustCode Dictation: Final transcript extracted ->", finalTranscript);
                    resolve({
                        success: finalTranscript.length > 0,
                        text: finalTranscript,
                        superseded
                    });
                };

                const cancelThisExtraction = () => finishExtraction(true, 'newer_session');
                cancelPendingExtraction = cancelThisExtraction;

                const checkState = () => {
                    if (isResolved) return;
                    if (recordingGeneration !== stoppedGeneration) {
                        finishExtraction(true, 'generation_changed');
                        return;
                    }
                    const currentText = extractTextFromPrompt();

                    // Instantly trigger when text arrives from Whisper
                    if (currentText.length > 0) {
                        emptyIdleSince = null;
                        if (currentText !== lastSeenText) {
                            lastSeenText = currentText;
                            if (debounceTimer) clearTimeout(debounceTimer);
                            // 80ms buffer to allow full paragraph streams to settle
                            debounceTimer = setTimeout(() => finishExtraction(false, 'text'), 80);
                        }
                        return;
                    }

                    // ChatGPT can finish a silent recording immediately. In
                    // that case no prompt mutation ever arrives, but the UI
                    // returns to a stable idle state: recording/processing
                    // controls disappear and the dictate button comes back.
                    const uiState = readPostStopUiState();
                    const uiStateSignature = JSON.stringify(uiState);
                    if (uiStateSignature !== lastUiStateSignature) {
                        lastUiStateSignature = uiStateSignature;
                        trace('driver_post_stop_ui_state', sessionId, uiState);
                    }

                    if (uiState.terminalEmpty) {
                        if (emptyIdleSince === null) emptyIdleSince = Date.now();
                        // Require stability to avoid completing during the
                        // brief transition from recording to transcription.
                        if (Date.now() - emptyIdleSince >= 175) {
                            finishExtraction(false, 'idle_empty');
                        }
                    } else {
                        emptyIdleSince = null;
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

                // 3. Bound transcript extraction. Short, silent holds settle
                // quickly when the DOM signal above is available; this timer
                // is only a fallback for unknown future ChatGPT UI states.
                const transcriptTimeoutMs = durationMs <= 1200
                    ? 3000
                    : durationMs <= 3000
                        ? 5000
                        : 15000;
                safetyTimeout = setTimeout(() => {
                    console.log("JustCode Dictation: Transcript timeout reached. Finalizing extraction...");
                    finishExtraction(false, 'timeout');
                }, transcriptTimeoutMs);

                // Initial immediate check after every cleanup handle exists.
                checkState();
            });
        }
    };
})();
