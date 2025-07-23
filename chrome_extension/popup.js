import { initUI, renderUI, updateFolderName } from './js/ui.js';
import { loadData, saveData } from './js/storage.js';
import { handleGetContextClick, handleUndoCodeClick } from './js/ui_handlers/actions.js';
import { updateAndSaveMessage } from './js/ui_handlers/message.js';

document.addEventListener('DOMContentLoaded', async () => {
    const detachWindowButton = document.getElementById('detachWindow');
    const mainView = document.getElementById('mainView');

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

    // Listen for messages from the folder picker window (for JS mode)
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (sender.tab) return; // Ignore messages from content scripts

        switch (message.type) {
            case "folderSelected":
                updateFolderName(message.profileId, message.folderName);
                updateAndSaveMessage(message.profileId, `Folder '${message.folderName}' access granted.`, 'success');
                break;
            // Other cases for picker window communication can be added here
        }
        return true;
    });

    const profilesContainer = document.getElementById('profilesContainer');
    const profileTabs = document.getElementById('profileTabs');
    const addProfileButton = document.getElementById('addProfile');
    const archiveListContainer = document.getElementById('archiveListContainer');
    
    initUI(profilesContainer, profileTabs, addProfileButton, archiveListContainer);

    profileTabs.addEventListener('wheel', (event) => {
        if (event.deltaY !== 0) {
            event.preventDefault();
            profileTabs.scrollLeft += event.deltaY;
        }
    });

    // Shift-key listener to swap Archive/Delete buttons
    const toggleDeleteButton = (showDelete) => {
        document.querySelectorAll('.profile-card.active .archive-profile').forEach(btn => btn.style.display = showDelete ? 'none' : 'inline-block');
        document.querySelectorAll('.profile-card.active .permanent-delete-direct').forEach(btn => btn.style.display = showDelete ? 'inline-block' : 'none');
    };
    document.addEventListener('keydown', (e) => { if (e.key === 'Shift') toggleDeleteButton(true); });
    document.addEventListener('keyup', (e) => { if (e.key === 'Shift') toggleDeleteButton(false); });
    window.addEventListener('blur', () => toggleDeleteButton(false));

    // Keyboard shortcuts for actions within the popup
    document.addEventListener('keydown', (event) => {
        if (!event.altKey || event.metaKey || event.ctrlKey || event.shiftKey) return;

        let actionTaken = false;
        const activeCard = document.querySelector('.profile-card.active');
        if (!activeCard) return;

        if (event.key === 'ArrowLeft') {
            const btn = activeCard.querySelector('.get-context');
            if (btn) {
                const mockEvent = { currentTarget: btn };
                handleGetContextClick(mockEvent, true);
                actionTaken = true;
            }
        } else if (event.key === 'ArrowRight') {
            const btn = activeCard.querySelector('.deploy-code');
            if (btn) { btn.click(); actionTaken = true; }
        } else if (event.code === 'KeyR') {
            const btn = activeCard.querySelector('.undo-code');
            if (btn && !btn.disabled) {
                const mockEvent = { currentTarget: btn };
                handleUndoCodeClick(mockEvent);
                actionTaken = true;
            }
        } else if (event.code === 'KeyA' || event.code === 'KeyS') { // Profile switching
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
    });
});