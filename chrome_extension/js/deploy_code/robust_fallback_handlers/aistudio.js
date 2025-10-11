// This file contains the self-contained logic for toggling raw mode on AI Studio.
// It will only toggle if a rendered code block is detected.

/**
 * This function's ENTIRE BODY will be injected and executed on the page.
 * It checks for a rendered code block before attempting to toggle the view.
 * @returns {Promise<boolean>} Returns true if a toggle was performed, false otherwise.
 */
export function prepareForFullAnswerExtraction() {
    // This self-contained async function is what gets executed in the target tab.
    return (async () => {
        try {
            console.log("--- JustCode Fallback: Checking if AI Studio toggle is needed... ---");

            // 1. Find the last model response on the page.
            const modelResponses = document.querySelectorAll('.chat-turn-container.model');
            if (modelResponses.length === 0) {
                console.log("JustCode: No model response found. No toggle action will be taken.");
                return false; // No toggle was performed.
            }
            const lastResponse = modelResponses[modelResponses.length - 1];

            // 2. THE NEW CHECK: Look for a rendered code block.
            const codeBlock = lastResponse.querySelector('ms-code-block');
            if (!codeBlock) {
                console.log("JustCode: No '<ms-code-block>' found in the last response. Assuming raw mode or no code. SKIPPING toggle.");
                return false; // No toggle was needed or performed.
            }

            console.log("JustCode: Found '<ms-code-block>'. A toggle is required. Starting sequence...");

            // 3. Find the menu trigger button inside the last editor.
            const lastEditor = Array.from(document.querySelectorAll('ms-chunk-editor')).pop();
            if (!lastEditor) { throw new Error("Could not find the last 'ms-chunk-editor'."); }
            
            const menuTrigger = lastEditor.querySelector('button.mat-mdc-menu-trigger');
            if (!menuTrigger) { throw new Error("Could not find the menu trigger button."); }
            
            menuTrigger.click();
            await new Promise(resolve => setTimeout(resolve, 100));

            // 4. Find and click the toggle button.
            const toggleButtonSelector = 'div.mat-mdc-menu-panel button.mat-mdc-menu-item.icon-text-button[data-test-raw-mode]';
            const toggleButton = document.querySelector(toggleButtonSelector);
            if (!toggleButton) { throw new Error(`Could not find toggle button: "${toggleButtonSelector}"`); }

            toggleButton.click();
            await new Promise(resolve => setTimeout(resolve, 100));

            console.log("--- JustCode: Toggle sequence complete. ---");
            return true; // A toggle was successfully performed.

        } catch (error) {
            console.error("JustCode: An error occurred during the toggle sequence:", error.message);
            return false; // A toggle was attempted but failed.
        }
    })();
}

/**
 * This function is also injected to revert the view. It does not need to check state,
 * as it's only called if the prepare function succeeded and returned true.
 */
export function revertFullAnswerExtraction() {
     (async () => {
        try {
            console.log("--- JustCode Fallback: Starting revert toggle sequence... ---");
            const lastEditor = Array.from(document.querySelectorAll('ms-chunk-editor')).pop();
            if (!lastEditor) { return; }
            const menuTrigger = lastEditor.querySelector('button.mat-mdc-menu-trigger');
            if (!menuTrigger) { return; }
            menuTrigger.click();
            await new Promise(e => setTimeout(e, 100));
            const toggleButton = document.querySelector('div.mat-mdc-menu-panel button.mat-mdc-menu-item.icon-text-button[data-test-raw-mode]');
            if (!toggleButton) { return; }
            toggleButton.click();
            console.log("--- JustCode Fallback: Revert sequence complete. ---");
        } catch (error) {
            console.error("JustCode: An error occurred during the revert sequence:", error.message);
        }
    })();
}