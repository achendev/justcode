// This file contains the self-contained logic for toggling raw mode on AI Studio.

/**
 * This function's ENTIRE BODY will be injected and executed on the page.
 * @param {boolean} [force=false] - If true, ensures raw mode is enabled.
 * @returns {Promise<boolean>} Returns true if the state was CHANGED (toggled on), false otherwise.
 */
export function prepareForFullAnswerExtraction(force) {
    return (async () => {
        try {
            // 1. Check if we even need to inspect the menu (Optimization)
            if (!force) {
                const modelResponses = document.querySelectorAll('.chat-turn-container.model');
                if (modelResponses.length > 0) {
                    const lastResponse = modelResponses[modelResponses.length - 1];
                    const codeBlock = lastResponse.querySelector('ms-code-block');
                    if (!codeBlock) {
                        // No code block visible, and not forced.
                        // Assuming safe to read as-is.
                        return false;
                    }
                }
            }

            console.log("JustCode: Checking Raw Mode state...");

            // 2. Open the menu to check status
            const lastEditor = Array.from(document.querySelectorAll('ms-chunk-editor')).pop();
            if (!lastEditor) { 
                console.warn("JustCode: Editor not found."); 
                return false; 
            }
            
            const menuTrigger = lastEditor.querySelector('button.mat-mdc-menu-trigger');
            if (!menuTrigger) { 
                console.warn("JustCode: Menu trigger not found."); 
                return false; 
            }
            
            menuTrigger.click();
            // Wait for menu animation (Angular Material)
            await new Promise(resolve => setTimeout(resolve, 200)); 

            // 3. Find the toggle button in the open menu
            const toggleButton = document.querySelector('div.mat-mdc-menu-panel button[data-test-raw-mode]');
            if (!toggleButton) { 
                console.warn("JustCode: Toggle button not found in menu.");
                // Try to close menu by clicking backdrop if it exists
                document.querySelector('.cdk-overlay-backdrop')?.click();
                return false; 
            }

            // 4. Check if already enabled (Look for the checkmark span)
            const isAlreadyEnabled = !!toggleButton.querySelector('span[data-test-raw-mode-checkmark]');
            
            if (isAlreadyEnabled) {
                console.log("JustCode: Raw Mode is ALREADY enabled.");
                // Close the menu without changing anything
                const backdrop = document.querySelector('.cdk-overlay-backdrop');
                if (backdrop) {
                    backdrop.click();
                } else {
                    // Fallback: click trigger again or body
                    document.body.click(); 
                }
                return false; // We did NOT toggle it (it was already good)
            }

            // 5. Enable it
            console.log("JustCode: Enabling Raw Mode...");
            toggleButton.click();
            
            // Wait for view to update
            await new Promise(resolve => setTimeout(resolve, 200));
            return true; // We successfully toggled it ON

        } catch (error) {
            console.error("JustCode: Toggle sequence error:", error);
            // Try to cleanup menu if open
            document.querySelector('.cdk-overlay-backdrop')?.click();
            return false;
        }
    })();
}

/**
 * This function is injected to revert the view.
 * It assumes prepareForFullAnswerExtraction returned true, meaning we are currently in Raw Mode
 * and need to toggle it OFF.
 */
export function revertFullAnswerExtraction() {
     (async () => {
        try {
            console.log("JustCode: Reverting Raw Mode...");
            const lastEditor = Array.from(document.querySelectorAll('ms-chunk-editor')).pop();
            if (!lastEditor) return;
            
            const menuTrigger = lastEditor.querySelector('button.mat-mdc-menu-trigger');
            if (!menuTrigger) return;
            
            menuTrigger.click();
            await new Promise(e => setTimeout(e, 200));
            
            const toggleButton = document.querySelector('div.mat-mdc-menu-panel button[data-test-raw-mode]');
            if (!toggleButton) {
                 document.querySelector('.cdk-overlay-backdrop')?.click();
                 return;
            }
            
            // We just click it to toggle off
            toggleButton.click();
            console.log("JustCode: Reverted.");
            
        } catch (error) {
            console.error("JustCode: Revert error:", error);
            document.querySelector('.cdk-overlay-backdrop')?.click();
        }
    })();
}