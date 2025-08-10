import { initUI, renderUI, updateFolderName } from './js/ui.js';
import { loadData, saveData } from './js/storage.js';
import { handleGetContextClick, handleDeployCodeClick, handleUndoCodeClick } from './js/ui_handlers/actions.js';
import { updateAndSaveMessage } from './js/ui_handlers/message.js';

document.addEventListener('DOMContentLoaded', async () => {
    // --- THEME LOGIC ---
    const themeSwitcher = document.getElementById('theme-switcher');
    const sunIcon = '<i class="bi bi-brightness-high-fill"></i>';
    const cloudyIcon = '<i class="bi bi-cloud-sun-fill"></i>';

    const applyTheme = (theme) => {
        if (theme === 'dark') {
            document.body.classList.remove('light-theme');
            document.body.classList.add('dark-theme');
            themeSwitcher.innerHTML = cloudyIcon;
        } else {
            document.body.classList.remove('dark-theme');
            document.body.classList.add('light-theme');
            themeSwitcher.innerHTML = sunIcon;
        }
    };

    const updateThemeSelector = (theme) => {
        const themeSelector = document.getElementById('themeSelector');
        if (themeSelector) {
            themeSelector.value = theme || 'system';
        }
    };

    const handleThemeChange = (newThemeValue) => {
        if (newThemeValue === 'system') {
            const currentSystemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
            applyTheme(currentSystemTheme);
            chrome.storage.local.remove('theme');
            updateThemeSelector('system');
        } else {
            applyTheme(newThemeValue);
            chrome.storage.local.set({ theme: newThemeValue });
            updateThemeSelector(newThemeValue);
        }
    };

    // Step 1: Apply system theme immediately to prevent flashing.
    const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    applyTheme(systemTheme);

    // Step 2: Load and apply user-saved theme, and update UI controls.
    chrome.storage.local.get('theme', (data) => {
        const savedTheme = data.theme;
        if (savedTheme) {
            applyTheme(savedTheme);
        }
        updateThemeSelector(savedTheme || 'system');
    });

    // Theme switcher button event listener (the original toggle behavior)
    themeSwitcher.addEventListener('click', () => {
        const isDark = document.body.classList.contains('dark-theme');
        handleThemeChange(isDark ? 'light' : 'dark');
    });

    // Theme settings selector event listener
    const themeSelector = document.getElementById('themeSelector');
    if (themeSelector) {
        themeSelector.addEventListener('change', (event) => handleThemeChange(event.target.value));
    }

    // Listener for system theme changes, to update if 'system' is selected
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
        chrome.storage.local.get('theme', (data) => {
            if (!data.theme) { // Only change if we are in system mode
                applyTheme(e.matches ? "dark" : "light");
            }
        });
    });
    // --- END THEME LOGIC ---

    const detachWindowButton = document.getElementById('detachWindow');
    const mainView = document.getElementById('mainView');
    const archiveView = document.getElementById('archiveView');
    const appSettingsView = document.getElementById('appSettingsView');

    // --- View Mode Logic ---
    const urlParams = new URLSearchParams(window.location.search);
    const isDetached = urlParams.get('view') === 'window';
    const initialHeight = urlParams.get('height');

    if (isDetached) {
        detachWindowButton.style.display = 'none';
        document.body.classList.add('detached');
        if (initialHeight) {
            const adjustedHeight = parseInt(initialHeight, 10) + 40;
            document.body.style.height = `${adjustedHeight}px`;
        }
    } else {
        detachWindowButton.addEventListener('click', () => {
            const currentHeight = mainView.offsetHeight;
            const popupUrl = chrome.runtime.getURL(`popup.html?view=window&height=${currentHeight}`);
            chrome.windows.create({
                url: popupUrl,
                type: 'popup',
                width: 350,
                height: currentHeight + 57
            });
            window.close();
        });
    }

    // Listen for messages from other extension scripts
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (sender.tab) return; // Ignore messages from content scripts

        switch (message.type) {
            case "folderSelected":
                updateFolderName(message.profileId, message.folderName);
                updateAndSaveMessage(message.profileId, `Folder '${message.folderName}' access granted.`, 'success');
                break;
            case "closePopupOnShortcut":
                const isDetachedWindow = new URLSearchParams(window.location.search).get('view') === 'window';
                if (!isDetachedWindow) {
                    window.close();
                }
                break;
        }
        return true;
    });

    const profilesContainer = document.getElementById('profilesContainer');
    const profileTabs = document.getElementById('profileTabs');
    const addProfileButton = document.getElementById('addProfile');
    const archiveListContainer = document.getElementById('archiveListContainer');
    
    // --- UI Initialization ---
    const reRender = () => {
        loadData((profiles, activeProfileId, archivedProfiles) => {
            renderUI(profiles, activeProfileId, archivedProfiles, profilesContainer, profileTabs, archiveListContainer);
        });
    };
    initUI(profilesContainer, profileTabs, addProfileButton, archiveListContainer);


    // --- View Switching Logic ---
    const archiveButton = document.getElementById('archiveButton');
    const closeArchiveButton = document.getElementById('closeArchive');
    const appSettingsButton = document.getElementById('appSettingsButton');
    const closeAppSettingsButton = document.getElementById('closeAppSettings');

    archiveButton.addEventListener('click', () => {
        mainView.style.display = 'none';
        archiveView.style.display = 'block';
        appSettingsView.style.display = 'none';
    });

    closeArchiveButton.addEventListener('click', () => {
        mainView.style.display = 'block';
        archiveView.style.display = 'none';
    });
    
    appSettingsButton.addEventListener('click', () => {
        mainView.style.display = 'none';
        archiveView.style.display = 'none';
        appSettingsView.style.display = 'block';
    });

    closeAppSettingsButton.addEventListener('click', () => {
        mainView.style.display = 'block';
        appSettingsView.style.display = 'none';
    });

    // --- App Settings ---
    const exportBtn = document.getElementById('exportSettingsButton');
    const importBtn = document.getElementById('importSettingsButton');
    const importFileInput = document.getElementById('importSettingsFile');
    const closeOnGetContextCheckbox = document.getElementById('closeOnGetContext');
    
    // Shortcut Checkboxes
    const getContextShortcutCheckbox = document.getElementById('isGetContextShortcutEnabled');
    const deployCodeShortcutCheckbox = document.getElementById('isDeployCodeShortcutEnabled');
    const undoShortcutCheckbox = document.getElementById('isUndoShortcutEnabled');
    const redoShortcutCheckbox = document.getElementById('isRedoShortcutEnabled');

    const shortcutDomainsTextarea = document.getElementById('shortcutDomainsTextarea');
    const notificationPositionSelector = document.getElementById('notificationPositionSelector');
    const notificationTimeoutInput = document.getElementById('notificationTimeoutInput');
    const defaultShortcutDomains = 'aistudio.google.com,grok.com,x.com,perplexity.ai,gemini.google.com,chatgpt.com';

    // Initialize settings from storage
    chrome.storage.local.get([
        'closeOnGetContext', 
        'shortcutDomains', 
        'notificationPosition', 
        'notificationTimeout', 
        'isGetContextShortcutEnabled',
        'isDeployCodeShortcutEnabled',
        'isUndoShortcutEnabled',
        'isRedoShortcutEnabled'
    ], (data) => {
        closeOnGetContextCheckbox.checked = !!data.closeOnGetContext;
        shortcutDomainsTextarea.value = data.shortcutDomains === undefined ? defaultShortcutDomains : data.shortcutDomains;
        notificationPositionSelector.value = data.notificationPosition || 'bottom-left';
        notificationTimeoutInput.value = data.notificationTimeout === undefined ? 4 : data.notificationTimeout;
        
        // Set shortcut checkboxes, defaulting to true/false as specified
        getContextShortcutCheckbox.checked = data.isGetContextShortcutEnabled !== false;
        deployCodeShortcutCheckbox.checked = data.isDeployCodeShortcutEnabled !== false;
        undoShortcutCheckbox.checked = !!data.isUndoShortcutEnabled;
        redoShortcutCheckbox.checked = !!data.isRedoShortcutEnabled;
    });
    
    // Add listeners for settings changes
    closeOnGetContextCheckbox.addEventListener('change', (event) => {
        chrome.storage.local.set({ closeOnGetContext: event.target.checked });
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

    exportBtn.addEventListener('click', async () => {
        chrome.storage.local.get(null, (allData) => {
            const exportableData = {};
            for (const key in allData) {
                if (!key.startsWith('undo_stack_') && !key.startsWith('redo_stack_')) {
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
                        chrome.storage.local.set(importedData, () => {
                            alert('Settings imported successfully!');
                            reRender(); // Re-render the entire UI with the new data
                        });
                    }
                } else {
                    alert('Error: Invalid settings file. Missing "profiles" or "activeProfileId".');
                }
            } catch (error) {
                alert(`Error parsing file: ${error.message}`);
            } finally {
                // Reset file input to allow importing the same file again
                importFileInput.value = '';
            }
        };
        reader.readAsText(file);
    });

    // --- Key Listeners ---
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Shift') {
            document.querySelectorAll('.profile-card.active .archive-profile').forEach(btn => btn.style.display = 'none');
            document.querySelectorAll('.profile-card.active .permanent-delete-direct').forEach(btn => btn.style.display = 'inline-block');
        }
    });
    document.addEventListener('keyup', (e) => {
        if (e.key === 'Shift') {
            document.querySelectorAll('.profile-card.active .archive-profile').forEach(btn => btn.style.display = 'inline-block');
            document.querySelectorAll('.profile-card.active .permanent-delete-direct').forEach(btn => btn.style.display = 'none');
        }
    });

    document.addEventListener('keydown', (event) => {
        if (event.altKey && !event.metaKey && !event.ctrlKey && !event.shiftKey) {
            let actionTaken = false;
            const activeCard = document.querySelector('.profile-card.active');
            if (!activeCard) return;

            if (event.key === 'ArrowRight') {
                const btn = activeCard.querySelector('.deploy-code');
                if (btn && !btn.disabled) { 
                    const mockEvent = { currentTarget: btn };
                    handleDeployCodeClick(mockEvent); 
                    actionTaken = true; 
                }
            } else if (event.key === 'ArrowLeft') {
                const btn = activeCard.querySelector('.get-context');
                 if (btn && !btn.disabled) {
                    const mockEvent = { currentTarget: btn };
                    handleGetContextClick(mockEvent);
                    actionTaken = true;
                }
            } else if (event.code === 'KeyR') {
                const btn = activeCard.querySelector('.undo-code');
                if (btn && !btn.disabled) {
                    const mockEvent = { currentTarget: btn };
                    handleUndoCodeClick(mockEvent);
                    actionTaken = true;
                }
            } else if (event.code === 'KeyA' || event.code === 'KeyS') {
                actionTaken = true;
                loadData((profiles, activeProfileId, archivedProfiles) => {
                    if (profiles.length <= 1) return;
                    const direction = (event.code === 'KeyA') ? -1 : 1;
                    const currentIndex = profiles.findIndex(p => p.id === activeProfileId);
                    const newIndex = (currentIndex + direction + profiles.length) % profiles.length;
                    const newActiveProfileId = profiles[newIndex].id;
                    saveData(profiles, newActiveProfileId, archivedProfiles);
                    renderUI(profiles, newActiveProfileId, archivedProfiles, profilesContainer, profileTabs, archiveListContainer);
                });
            }

            if (actionTaken) {
                event.preventDefault();
                event.stopPropagation();
            }
        }
    });
});