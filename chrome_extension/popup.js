import { initUI, renderProfiles } from './js/ui.js';
import { loadProfiles, saveProfiles } from './js/storage.js';

document.addEventListener('DOMContentLoaded', () => {
    const profilesContainer = document.getElementById('profilesContainer');
    const profileTabs = document.getElementById('profileTabs');
    const addProfileButton = document.getElementById('addProfile');
    const errorDiv = document.getElementById('error');
    
    initUI(profilesContainer, profileTabs, addProfileButton, errorDiv);

    // Add keyboard shortcuts for actions within the popup
    document.addEventListener('keydown', (event) => {
        // We only care about Alt/Option key combinations.
        if (!event.altKey || event.metaKey || event.ctrlKey || event.shiftKey) {
            return;
        }

        let actionTaken = false;
        if (event.key === 'ArrowLeft') {
            // Find and click the "Get Context" button for the active profile
            const getCodeButton = document.querySelector('.profile-card.active .get-code');
            if (getCodeButton) {
                getCodeButton.click();
                actionTaken = true;
            }
        } else if (event.key === 'ArrowRight') {
            // Find and click the "Deploy Code" button for the active profile
            const deployCodeButton = document.querySelector('.profile-card.active .deploy-code');
            if (deployCodeButton) {
                deployCodeButton.click();
                actionTaken = true;
            }
        } else if (event.code === 'KeyA') { // Switch profile left
            actionTaken = true;
            loadProfiles((profiles, activeProfileId) => {
                if (profiles.length <= 1) return;
                const currentIndex = profiles.findIndex(p => p.id === activeProfileId);
                const newIndex = (currentIndex - 1 + profiles.length) % profiles.length;
                const newActiveProfileId = profiles[newIndex].id;
                saveProfiles(profiles, newActiveProfileId);
                renderProfiles(profiles, newActiveProfileId, profilesContainer, profileTabs, errorDiv);
            });
        } else if (event.code === 'KeyS') { // Switch profile right
            actionTaken = true;
            loadProfiles((profiles, activeProfileId) => {
                if (profiles.length <= 1) return;
                const currentIndex = profiles.findIndex(p => p.id === activeProfileId);
                const newIndex = (currentIndex + 1) % profiles.length;
                const newActiveProfileId = profiles[newIndex].id;
                saveProfiles(profiles, newActiveProfileId);
                renderProfiles(profiles, newActiveProfileId, profilesContainer, profileTabs, errorDiv);
            });
        }

        if (actionTaken) {
            event.preventDefault(); // Prevent default browser action for the shortcut
            event.stopPropagation(); // Stop the event from bubbling up
        }
    });
});