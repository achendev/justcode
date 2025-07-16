import { initUI, renderUI } from './js/ui.js';
import { loadData, saveData } from './js/storage.js';
import { handleGetContextClick, handleUndoCodeClick } from './js/ui_handlers/actions.js';

async function checkAndHandleClipboardPermission() {
    const mainView = document.getElementById('mainView');
    const archiveView = document.getElementById('archiveView');
    const permissionsView = document.getElementById('permissionsView');

    // Hide all views initially to prevent flicker
    mainView.style.display = 'none';
    archiveView.style.display = 'none';
    permissionsView.style.display = 'none';

    try {
        // We need to check both read and write permissions. These are for the extension's own origin.
        const readPerm = await navigator.permissions.query({ name: 'clipboard-read' });
        const writePerm = await navigator.permissions.query({ name: 'clipboard-write' });

        // If both are granted, show the main UI.
        if (readPerm.state === 'granted' && writePerm.state === 'granted') {
            mainView.style.display = 'block'; // Show default view
            return true;
        } else {
            // If either is denied or requires a prompt, show the instructions.
            permissionsView.style.display = 'block';
            return false;
        }
    } catch (error) {
        // Fallback for browsers that might not support the Permissions API for clipboard.
        console.warn("Could not query clipboard permissions, assuming they are granted.", error);
        mainView.style.display = 'block'; // Show default view
        return true;
    }
}


document.addEventListener('DOMContentLoaded', async () => {
    const goToSettingsButton = document.getElementById('goToSettings');
    const reloadExtensionButton = document.getElementById('reloadExtension');
    const detachWindowButton = document.getElementById('detachWindow');
    const mainView = document.getElementById('mainView');

    // --- View Mode Logic ---
    const urlParams = new URLSearchParams(window.location.search);
    const isDetached = urlParams.get('view') === 'window';
    const initialHeight = urlParams.get('height');

    if (isDetached) {
        // This is a detached window.
        detachWindowButton.style.display = 'none'; // Hide the button
        document.body.classList.add('detached'); // Add class for styling
        if (initialHeight) {
            // Add a little padding to account for window chrome
            const adjustedHeight = parseInt(initialHeight, 10) + 40;
            document.body.style.height = `${adjustedHeight}px`;
        }
    } else {
        // This is a popup.
        detachWindowButton.addEventListener('click', () => {
            const currentHeight = mainView.offsetHeight;
            const popupUrl = chrome.runtime.getURL(`popup.html?view=window&height=${currentHeight}`);
            chrome.windows.create({
                url: popupUrl,
                type: 'popup',
                width: 350,
                height: currentHeight + 57 // Add padding for window chrome
            });
            window.close(); // Close the current popup view
        });
    }

    goToSettingsButton.addEventListener('click', () => {
        // Opens the extension's details page where site permissions can be found.
        chrome.tabs.create({ url: 'chrome://extensions/?id=' + chrome.runtime.id });
    });

    reloadExtensionButton.addEventListener('click', () => {
        window.location.reload();
    });

    const hasPermission = await checkAndHandleClipboardPermission();

    if (!hasPermission) {
        return; // Stop initialization if permissions are not granted.
    }

    const profilesContainer = document.getElementById('profilesContainer');
    const profileTabs = document.getElementById('profileTabs');
    const addProfileButton = document.getElementById('addProfile');
    const archiveListContainer = document.getElementById('archiveListContainer');
    
    initUI(profilesContainer, profileTabs, addProfileButton, archiveListContainer);

    // Allow horizontal scrolling of tabs with the mouse wheel
    profileTabs.addEventListener('wheel', (event) => {
        // If there's vertical scroll, prevent default and scroll horizontally
        if (event.deltaY !== 0) {
            event.preventDefault();
            profileTabs.scrollLeft += event.deltaY;
        }
    });

    // Add Shift-key listener to swap Archive/Delete buttons
    document.addEventListener('keydown', (event) => {
        // Only act if Shift is pressed and it's the only modifier key
        if (event.key === 'Shift' && !event.ctrlKey && !event.altKey && !event.metaKey) {
            document.querySelectorAll('.profile-card.active .archive-profile').forEach(btn => btn.style.display = 'none');
            document.querySelectorAll('.profile-card.active .permanent-delete-direct').forEach(btn => btn.style.display = 'inline-block');
        }
    });

    document.addEventListener('keyup', (event) => {
        if (event.key === 'Shift') {
            document.querySelectorAll('.profile-card.active .archive-profile').forEach(btn => btn.style.display = 'inline-block');
            document.querySelectorAll('.profile-card.active .permanent-delete-direct').forEach(btn => btn.style.display = 'none');
        }
    });

    // Also handle window blur to reset button state
    window.addEventListener('blur', () => {
        document.querySelectorAll('.profile-card.active .archive-profile').forEach(btn => btn.style.display = 'inline-block');
        document.querySelectorAll('.profile-card.active .permanent-delete-direct').forEach(btn => btn.style.display = 'none');
    });

    // Add keyboard shortcuts for actions within the popup
    document.addEventListener('keydown', (event) => {
        // We only care about Alt/Option key combinations.
        if (!event.altKey || event.metaKey || event.ctrlKey || event.shiftKey) {
            return;
        }

        let actionTaken = false;
        if (event.key === 'ArrowLeft') {
            const getContextButton = document.querySelector('.profile-card.active .get-context');
            if (getContextButton) {
                const mockEvent = { currentTarget: getContextButton };
                handleGetContextClick(mockEvent, true);
                actionTaken = true;
            }
        } else if (event.key === 'ArrowRight') {
            // Find and click the "Deploy Code" button for the active profile
            const deployCodeButton = document.querySelector('.profile-card.active .deploy-code');
            if (deployCodeButton) {
                deployCodeButton.click();
                actionTaken = true;
            }
        } else if (event.code === 'KeyR') { // Use event.code for reliability
            const undoButton = document.querySelector('.profile-card.active .undo-code');
            if (undoButton && !undoButton.disabled) {
                const mockEvent = { currentTarget: undoButton };
                handleUndoCodeClick(mockEvent);
                actionTaken = true;
            }
        } else if (event.code === 'KeyA') { // Switch profile left
            actionTaken = true;
            loadData((profiles, activeProfileId, archivedProfiles) => {
                if (profiles.length <= 1) return;
                const currentIndex = profiles.findIndex(p => p.id === activeProfileId);
                const newIndex = (currentIndex - 1 + profiles.length) % profiles.length;
                const newActiveProfileId = profiles[newIndex].id;
                saveData(profiles, newActiveProfileId, archivedProfiles);
                renderUI(profiles, newActiveProfileId, archivedProfiles, profilesContainer, profileTabs, archiveListContainer);
            });
        } else if (event.code === 'KeyS') { // Switch profile right
            actionTaken = true;
            loadData((profiles, activeProfileId, archivedProfiles) => {
                if (profiles.length <= 1) return;
                const currentIndex = profiles.findIndex(p => p.id === activeProfileId);
                const newIndex = (currentIndex + 1) % profiles.length;
                const newActiveProfileId = profiles[newIndex].id;
                saveData(profiles, newActiveProfileId, archivedProfiles);
                renderUI(profiles, newActiveProfileId, archivedProfiles, profilesContainer, profileTabs, archiveListContainer);
            });
        }

        if (actionTaken) {
            event.preventDefault(); // Prevent default browser action for the shortcut
            event.stopPropagation(); // Stop the event from bubbling up
        }
    });
});