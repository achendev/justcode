export function initializeAppSettings(reRender) {
    const exportBtn = document.getElementById('exportSettingsButton');
    const importBtn = document.getElementById('importSettingsButton');
    const importFileInput = document.getElementById('importSettingsFile');
    const closeOnGetContextCheckbox = document.getElementById('closeOnGetContext');
    const rememberTabProfileCheckbox = document.getElementById('rememberTabProfile');
    const verboseDeployLogCheckbox = document.getElementById('showVerboseDeployLog');
    const hideErrorsOnSuccessCheckbox = document.getElementById('hideErrorsOnSuccess');
    const wordWrapMessagesCheckbox = document.getElementById('wordWrapMessages');
    const robustDeployCheckbox = document.getElementById('robustDeployFallback');
    
    // Shortcut Checkboxes
    const getContextShortcutCheckbox = document.getElementById('isGetContextShortcutEnabled');
    const deployCodeShortcutCheckbox = document.getElementById('isDeployCodeShortcutEnabled');
    const undoShortcutCheckbox = document.getElementById('isUndoShortcutEnabled');
    const redoShortcutCheckbox = document.getElementById('isRedoShortcutEnabled');
    const showProgressBarCheckbox = document.getElementById('showNotificationProgressBar');

    const shortcutDomainsTextarea = document.getElementById('shortcutDomainsTextarea');
    const notificationPositionSelector = document.getElementById('notificationPositionSelector');
    const notificationTimeoutInput = document.getElementById('notificationTimeoutInput');
    const defaultShortcutDomains = 'aistudio.google.com,grok.com,x.com,www.perplexity.ai,gemini.google.com,chatgpt.com';

    // Initialize settings from storage
    chrome.storage.local.get([
        'closeOnGetContext',
        'rememberTabProfile',
        'showVerboseDeployLog',
        'hideErrorsOnSuccess',
        'wordWrapMessagesEnabled',
        'robustDeployFallback',
        'shortcutDomains', 
        'notificationPosition', 
        'notificationTimeout', 
        'isGetContextShortcutEnabled',
        'isDeployCodeShortcutEnabled',
        'isUndoShortcutEnabled',
        'isRedoShortcutEnabled',
        'showNotificationProgressBar'
    ], (data) => {
        closeOnGetContextCheckbox.checked = data.closeOnGetContext === true;
        rememberTabProfileCheckbox.checked = data.rememberTabProfile !== false; // Default true
        verboseDeployLogCheckbox.checked = data.showVerboseDeployLog !== false; // Default to true
        hideErrorsOnSuccessCheckbox.checked = data.hideErrorsOnSuccess !== false; // Default to true
        wordWrapMessagesCheckbox.checked = data.wordWrapMessagesEnabled !== false; // Default to true
        robustDeployCheckbox.checked = data.robustDeployFallback !== false; // Default true
        shortcutDomainsTextarea.value = data.shortcutDomains === undefined ? defaultShortcutDomains : data.shortcutDomains;
        notificationPositionSelector.value = data.notificationPosition || 'bottom-left';
        notificationTimeoutInput.value = data.notificationTimeout === undefined ? 4 : data.notificationTimeout;
        
        getContextShortcutCheckbox.checked = data.isGetContextShortcutEnabled !== false;
        deployCodeShortcutCheckbox.checked = data.isDeployCodeShortcutEnabled !== false;
        undoShortcutCheckbox.checked = data.isUndoShortcutEnabled !== false;
        redoShortcutCheckbox.checked = data.isRedoShortcutEnabled !== false;
        showProgressBarCheckbox.checked = data.showNotificationProgressBar !== false;
    });
    
    // Add listeners for settings changes
    closeOnGetContextCheckbox.addEventListener('change', (event) => {
        chrome.storage.local.set({ closeOnGetContext: event.target.checked });
    });

    rememberTabProfileCheckbox.addEventListener('change', (event) => {
        chrome.storage.local.set({ rememberTabProfile: event.target.checked });
    });

    verboseDeployLogCheckbox.addEventListener('change', (event) => {
        chrome.storage.local.set({ showVerboseDeployLog: event.target.checked });
    });

    hideErrorsOnSuccessCheckbox.addEventListener('change', (event) => {
        chrome.storage.local.set({ hideErrorsOnSuccess: event.target.checked });
    });

    wordWrapMessagesCheckbox.addEventListener('change', (event) => {
        const isEnabled = event.target.checked;
        chrome.storage.local.set({ wordWrapMessagesEnabled: isEnabled });
        // Live update any visible messages
        document.querySelectorAll('.message-text').forEach(span => {
            span.classList.toggle('word-wrap-enabled', isEnabled);
        });
    });

    robustDeployCheckbox.addEventListener('change', (event) => {
        chrome.storage.local.set({ robustDeployFallback: event.target.checked });
    });

    const createShortcutChangeListener = (id, key) => {
        const checkbox = document.getElementById(id);
        checkbox.addEventListener('change', (event) => {
            chrome.storage.local.set({ [key]: event.target.checked });
        });
    };

    createShortcutChangeListener('isGetContextShortcutEnabled', 'isGetContextShortcutEnabled');
    createShortcutChangeListener('isDeployCodeShortcutEnabled', 'isDeployCodeShortcutEnabled');
    createShortcutChangeListener('isUndoShortcutEnabled', 'isUndoShortcutEnabled');
    createShortcutChangeListener('isRedoShortcutEnabled', 'isRedoShortcutEnabled');
    createShortcutChangeListener('showNotificationProgressBar', 'showNotificationProgressBar');

    notificationPositionSelector.addEventListener('change', (event) => {
        chrome.storage.local.set({ notificationPosition: event.target.value });
    });

    notificationTimeoutInput.addEventListener('change', (event) => {
        let timeout = parseInt(event.target.value, 10);
        if (isNaN(timeout) || timeout < 1) {
            timeout = 4; // default to 4 if invalid
        }
        event.target.value = timeout;
        chrome.storage.local.set({ notificationTimeout: timeout });
    });

    shortcutDomainsTextarea.addEventListener('change', (event) => {
        const domains = event.target.value.split(',').map(d => d.trim()).filter(Boolean).join(', ');
        chrome.storage.local.set({ shortcutDomains: domains });
        shortcutDomainsTextarea.value = domains; // Clean up the view
    });

    // --- Import/Export Logic ---
    exportBtn.addEventListener('click', async () => {
        chrome.storage.local.get(null, (allData) => {
            const exportableData = {};
            for (const key in allData) {
                // Exclude undo/redo stacks and usage counts from the export
                if (!key.startsWith('undo_stack_') && !key.startsWith('redo_stack_') && !key.endsWith('ButtonUsageCount')) {
                    exportableData[key] = allData[key];
                }
            }
            const dataStr = JSON.stringify(exportableData, null, 2);
            const blob = new Blob([dataStr], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'justcode_data.json';
            a.click();
            URL.revokeObjectURL(url);
        });
    });
    
    importBtn.addEventListener('click', () => importFileInput.click());

    importFileInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const importedData = JSON.parse(e.target.result);
                if (importedData.profiles && importedData.activeProfileId) {
                    if (confirm('This will overwrite all your current profiles and settings. Are you sure?')) {
                        // Use the callback to re-render the UI after data is set
                        chrome.storage.local.set(importedData, () => {
                            alert('Settings imported successfully!');
                            reRender();
                        });
                    }
                } else {
                    alert('Error: Invalid settings file. Missing "profiles" or "activeProfileId".');
                }
            } catch (error) {
                alert(`Error parsing file: ${error.message}`);
            } finally {
                importFileInput.value = '';
            }
        };
        reader.readAsText(file);
    });
}