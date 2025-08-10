import { handleGetContextClick, handleDeployCodeClick, handleUndoCodeClick, handleRedoCodeClick } from '../ui_handlers/actions.js';
import { loadData, saveData } from '../storage.js';
import { renderUI } from '../ui.js';

function switchProfileTab(direction, reRender) {
    loadData((profiles, activeProfileId, archivedProfiles) => {
        if (profiles.length <= 1) return;
        const currentIndex = profiles.findIndex(p => p.id === activeProfileId);
        // The modulo operator handles wrapping around correctly
        const newIndex = (currentIndex + direction + profiles.length) % profiles.length;
        const newActiveProfileId = profiles[newIndex].id;
        
        saveData(profiles, newActiveProfileId, archivedProfiles);
        reRender(); // Re-render with the new active profile
    });
}

export function initializeListeners(reRender) {
    // --- Key Listeners for profile state ---
    document.addEventListener('keydown', (e) => {
        // Show delete button when shift is held down
        if (e.key === 'Shift') {
            document.querySelectorAll('.profile-card.active .archive-profile').forEach(btn => btn.style.display = 'none');
            document.querySelectorAll('.profile-card.active .permanent-delete-direct').forEach(btn => btn.style.display = 'inline-block');
        }
    });
    document.addEventListener('keyup', (e) => {
        // Hide delete button when shift is released
        if (e.key === 'Shift') {
            document.querySelectorAll('.profile-card.active .archive-profile').forEach(btn => btn.style.display = 'inline-block');
            document.querySelectorAll('.profile-card.active .permanent-delete-direct').forEach(btn => btn.style.display = 'none');
        }
    });

    // --- Key Listeners for shortcuts ---
    document.addEventListener('keydown', (event) => {
        // Check for Alt key without other modifiers
        if (event.altKey && !event.metaKey && !event.ctrlKey && !event.shiftKey) {
            let actionTaken = false;
            const activeCard = document.querySelector('.profile-card.active');
            if (!activeCard) return;

            const clickButton = (selector, handler) => {
                const btn = activeCard.querySelector(selector);
                if (btn && !btn.disabled) {
                    const mockEvent = { currentTarget: btn };
                    handler(mockEvent);
                    return true;
                }
                return false;
            };

            switch (event.key) {
                case 'ArrowRight':
                    actionTaken = clickButton('.deploy-code', handleDeployCodeClick);
                    break;
                case 'ArrowLeft':
                    actionTaken = clickButton('.get-context', handleGetContextClick);
                    break;
                case ',': // Corresponds to Alt + <
                    actionTaken = clickButton('.undo-code', handleUndoCodeClick);
                    break;
                case '.': // Corresponds to Alt + >
                    actionTaken = clickButton('.redo-code', handleRedoCodeClick);
                    break;
            }
            
            switch (event.code) {
                case 'KeyA':
                    switchProfileTab(-1, reRender);
                    actionTaken = true;
                    break;
                case 'KeyS':
                    switchProfileTab(1, reRender);
                    actionTaken = true;
                    break;
            }

            if (actionTaken) {
                event.preventDefault();
                event.stopPropagation();
            }
        }
    });
}