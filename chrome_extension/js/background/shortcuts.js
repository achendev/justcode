/**
 * Injects or replaces the global keyboard shortcut listener in a specific tab.
 * This function is designed to be called whenever the extension starts or is reloaded,
 * ensuring that tabs always have a listener connected to the live service worker.
 * @param {number} tabId The ID of the tab to inject the script into.
 * @param {object} settings The current application settings, which include shortcut configurations.
 */
export function injectShortcutListener(tabId, settings) {
    if (!settings) return;

    const listenerFunc = (settings) => {
        const listenerName = 'justCodeGlobalKeyDownHandler';
        
        // If an old listener from a previous extension context exists, remove it.
        if (window[listenerName]) {
            document.removeEventListener('keydown', window[listenerName], true);
        }

        // Define the new listener function.
        window[listenerName] = (event) => {
            // Self-destruct mechanism: If the extension context is lost (e.g., reloaded again),
            // remove the listener to prevent errors and memory leaks.
            if (!chrome.runtime?.id) {
                document.removeEventListener('keydown', window[listenerName], true);
                delete window[listenerName];
                return;
            }
            
            // We only care about the Alt key being pressed, without Ctrl or Meta.
            if (!event.altKey || event.ctrlKey || event.metaKey) {
                return;
            }

            // Check if shortcuts are enabled for the current domain.
            const allowedDomains = (settings.shortcutDomains || '').split(',').map(d => d.trim().toLowerCase()).filter(Boolean);
            if (!allowedDomains.includes(window.location.hostname)) {
                return;
            }

            let command = null;
            switch (event.key) {
                case 'ArrowLeft': 
                    if (settings.isGetContextShortcutEnabled) command = 'get-context-shortcut'; 
                    break;
                case 'ArrowRight': 
                    if (settings.isDeployCodeShortcutEnabled) command = 'deploy-code-shortcut'; 
                    break;
            }
            
            // Use event.code to robustly handle '<' and '>' regardless of Shift key.
            switch (event.code) {
                case 'Comma':
                    if (settings.isUndoShortcutEnabled) command = 'undo-code-shortcut';
                    break;
                case 'Period':
                     if (settings.isRedoShortcutEnabled) command = 'redo-code-shortcut';
                     break;
                case 'KeyV':
                    if (settings.isApplyReplacementsShortcutEnabled) command = 'apply-replacements-shortcut';
                    break;
            }

            if (command) {
                event.preventDefault();
                event.stopPropagation();
                // This `sendMessage` call is valid because it's in a freshly injected script context.
                chrome.runtime.sendMessage({ type: 'execute-command', command: command, hostname: window.location.hostname });
            }
        };

        // Attach the new listener to the document.
        document.addEventListener('keydown', window[listenerName], true);
    };
    
    // Execute the function in the target tab.
    chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: listenerFunc,
        args: [settings]
    }).catch(err => console.log(`JustCode: Could not inject shortcut listener into tab ${tabId}.`, err.message));
}