/**
 * Injects a simple, stateless global keyboard shortcut listener into a specific tab.
 * This listener just forwards key events to the background script, which decides
 * whether to act based on current settings. This removes the need to re-inject
 * the script when settings change.
 * @param {number} tabId The ID of the tab to inject the script into.
 * @param {object} unusedSettings Deprecated argument, kept for signature compatibility but ignored.
 */
export function injectShortcutListener(tabId, unusedSettings) {
    const listenerFunc = () => {
        const listenerName = 'justCodeGlobalKeyDownHandler';
        
        // If the listener is already there, we don't need to do anything.
        if (window[listenerName]) {
            return;
        }

        // Define the new listener function.
        window[listenerName] = (event) => {
            // Self-destruct mechanism: If the extension context is lost
            if (!chrome.runtime?.id) {
                document.removeEventListener('keydown', window[listenerName], true);
                delete window[listenerName];
                return;
            }
            
            // We only care about the Alt key being pressed, without Ctrl or Meta.
            if (!event.altKey || event.ctrlKey || event.metaKey) {
                return;
            }

            let command = null;
            
            // Map keys to commands directly
            switch (event.key) {
                case 'ArrowLeft': command = 'get-context-shortcut'; break;
                case 'ArrowRight': command = 'deploy-code-shortcut'; break;
            }
            
            // Use event.code for robustness with localized keyboards
            switch (event.code) {
                case 'Comma': command = 'undo-code-shortcut'; break;
                case 'Period': command = 'redo-code-shortcut'; break;
                case 'KeyV': command = 'apply-replacements-shortcut'; break;
            }

            if (command) {
                event.preventDefault();
                event.stopPropagation();
                // Send the intent to the background script to verify settings and execute.
                chrome.runtime.sendMessage({ 
                    type: 'try-execute-command', 
                    command: command, 
                    hostname: window.location.hostname 
                });
            }
        };

        // Attach the new listener to the document.
        document.addEventListener('keydown', window[listenerName], true);
    };
    
    // Execute the function in the target tab.
    chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: listenerFunc
    }).catch(err => console.log(`JustCode: Could not inject shortcut listener into tab ${tabId}.`, err.message));
}