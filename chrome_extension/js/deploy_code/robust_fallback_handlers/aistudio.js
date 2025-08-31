// This file contains special logic for AI Studio's robust fallback.
// It handles toggling the "raw mode" to ensure the full answer can be extracted correctly.

/**
 * Prepares the AI Studio page for full answer extraction by enabling raw text mode.
 * This is necessary because the default markdown view can alter the code block content.
 * @returns {Promise<boolean>} A promise that resolves to `true` if the page state was changed, `false` otherwise.
 */
export async function prepareForFullAnswerExtraction() {
    // This selector targets the "Toggle viewing raw output" button.
    const toggleButton = document.querySelector('button[iconname="text_compare"]');
    if (!toggleButton) {
        console.log("JustCode Fallback: Raw mode toggle button not found on AI Studio.");
        return false;
    }

    const isRawModeActive = toggleButton.classList.contains('ms-button-active');
    
    // If markdown view is currently active (i.e., raw mode is NOT active), click the button.
    if (!isRawModeActive) {
        console.log("JustCode Fallback: Enabling raw mode on AI Studio.");
        toggleButton.click();
        // Wait for the DOM to update after the click.
        await new Promise(resolve => setTimeout(resolve, 500));
        return true; // The state was changed.
    }

    return false; // The state was already correct (raw mode was on).
}

/**
 * Reverts the AI Studio page to its default markdown view after extraction.
 */
export async function revertFullAnswerExtraction() {
    const toggleButton = document.querySelector('button[iconname="text_compare"]');
    if (!toggleButton) {
        return;
    }
    
    // If we are reverting, it means we must have enabled raw mode.
    // The button should be active. Click it to go back to the default markdown view.
    if (toggleButton.classList.contains('ms-button-active')) {
        console.log("JustCode Fallback: Reverting to markdown view on AI Studio.");
        toggleButton.click();
        await new Promise(resolve => setTimeout(resolve, 200));
    }
}