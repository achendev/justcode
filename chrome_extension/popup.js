import { initUI, renderUI } from './js/ui.js';
import { loadData, saveData } from './js/storage.js';
import { handleGetContextClick } from './js/ui_handlers/actions.js';

document.addEventListener('DOMContentLoaded', () => {
    const profilesContainer = document.getElementById('profilesContainer');
    const profileTabs = document.getElementById('profileTabs');
    const addProfileButton = document.getElementById('addProfile');
    const archiveListContainer = document.getElementById('archiveListContainer');
    const errorDiv = document.getElementById('error');
    const updateAppButton = document.getElementById('updateAppButton');
    
    initUI(profilesContainer, profileTabs, addProfileButton, archiveListContainer, errorDiv);

    // Add listener for the update button
    updateAppButton.addEventListener('click', () => {
        errorDiv.textContent = 'Checking for updates...';
        loadData(async (profiles, activeProfileId) => {
            const activeProfile = profiles.find(p => p.id === activeProfileId);
            if (!activeProfile || !activeProfile.serverUrl) {
                errorDiv.textContent = 'Error: No active profile or server URL configured.';
                return;
            }

            const serverUrl = activeProfile.serverUrl.endsWith('/') ? activeProfile.serverUrl.slice(0, -1) : activeProfile.serverUrl;
            const endpoint = `${serverUrl}/update`;

            try {
                const headers = { 'Content-Type': 'text/plain' };
                if (activeProfile.isAuthEnabled && activeProfile.username) {
                    headers['Authorization'] = 'Basic ' + btoa(`${activeProfile.username}:${activeProfile.password}`);
                }

                const response = await fetch(endpoint, {
                    method: 'POST',
                    headers: headers
                });

                const resultText = await response.text();
                if (!response.ok) {
                    throw new Error(resultText);
                }
                
                // Show the success/info message from the server
                errorDiv.textContent = resultText;

            } catch (error) {
                errorDiv.textContent = `Update failed: ${error.message}`;
                console.error('JustCode Update Error:', error);
            }
        });
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
                handleGetContextClick(mockEvent, errorDiv, true);
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
            const rollbackButton = document.querySelector('.profile-card.active .rollback-code');
            if (rollbackButton) {
                rollbackButton.click();
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
                renderUI(profiles, newActiveProfileId, archivedProfiles, profilesContainer, profileTabs, archiveListContainer, errorDiv);
            });
        } else if (event.code === 'KeyS') { // Switch profile right
            actionTaken = true;
            loadData((profiles, activeProfileId, archivedProfiles) => {
                if (profiles.length <= 1) return;
                const currentIndex = profiles.findIndex(p => p.id === activeProfileId);
                const newIndex = (currentIndex + 1) % profiles.length;
                const newActiveProfileId = profiles[newIndex].id;
                saveData(profiles, newActiveProfileId, archivedProfiles);
                renderUI(profiles, newActiveProfileId, archivedProfiles, profilesContainer, profileTabs, archiveListContainer, errorDiv);
            });
        }

        if (actionTaken) {
            event.preventDefault(); // Prevent default browser action for the shortcut
            event.stopPropagation(); // Stop the event from bubbling up
        }
    });
});