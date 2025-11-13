import * as profileHandlers from '../ui_handlers/profile.js';

let draggedProfileId = null;

export function attachProfileEventListeners(reRenderCallback) {
    // --- Listeners for the main profile view ---
    document.querySelectorAll('.nav-link').forEach(tab => {
        tab.setAttribute('draggable', true);

        tab.addEventListener('click', (e) => profileHandlers.handleTabSwitch(e, reRenderCallback));
        
        // Drag and Drop listeners
        tab.addEventListener('dragstart', (e) => {
            if (e.target.classList.contains('nav-link')) {
                draggedProfileId = parseInt(e.target.dataset.id);
                e.dataTransfer.effectAllowed = 'move';
                // Add class after a short delay to ensure the drag image is the original element
                setTimeout(() => {
                    e.target.classList.add('dragging');
                }, 0);
            }
        });

        tab.addEventListener('dragend', (e) => {
            e.target.classList.remove('dragging');
            document.querySelectorAll('.nav-link.drag-over').forEach(t => t.classList.remove('drag-over'));
            draggedProfileId = null;
        });

        tab.addEventListener('dragover', (e) => {
            e.preventDefault(); // This is necessary to allow a drop.
        });

        tab.addEventListener('dragenter', (e) => {
            e.preventDefault();
            const targetId = parseInt(e.currentTarget.dataset.id);
            if (draggedProfileId !== null && draggedProfileId !== targetId) {
                e.currentTarget.classList.add('drag-over');
            }
        });
        
        tab.addEventListener('dragleave', (e) => {
            e.currentTarget.classList.remove('drag-over');
        });

        tab.addEventListener('drop', (e) => {
            e.preventDefault();
            e.currentTarget.classList.remove('drag-over');
            const targetProfileId = parseInt(e.currentTarget.dataset.id);

            if (draggedProfileId !== null && draggedProfileId !== targetProfileId) {
                profileHandlers.handleProfileReorder(draggedProfileId, targetProfileId, reRenderCallback);
            }
        });
    });

    document.querySelectorAll('.profile-name-input').forEach(input => {
        input.addEventListener('change', (e) => profileHandlers.handleProfileNameChange(e, reRenderCallback));
    });

    document.querySelectorAll('.copy-profile').forEach(button => {
        button.addEventListener('click', (e) => profileHandlers.handleCopyProfile(e, reRenderCallback));
    });
    
    document.querySelectorAll('.archive-profile').forEach(button => {
        button.addEventListener('click', (e) => profileHandlers.handleArchiveProfile(e, reRenderCallback));
    });

    document.querySelectorAll('.permanent-delete-direct').forEach(button => {
        button.addEventListener('click', (e) => profileHandlers.handleDirectPermanentDeleteProfile(e, reRenderCallback));
    });

    document.querySelectorAll('.move-profile-left').forEach(button => {
        button.addEventListener('click', (e) => profileHandlers.handleMoveProfileLeft(e, reRenderCallback));
    });

    document.querySelectorAll('.move-profile-right').forEach(button => {
        button.addEventListener('click', (e) => profileHandlers.handleMoveProfileRight(e, reRenderCallback));
    });
}

export function attachArchiveEventListeners(reRenderCallback) {
    // --- Listeners for the archive view ---
    document.querySelectorAll('.restore-profile').forEach(button => {
        button.addEventListener('click', (e) => profileHandlers.handleRestoreProfile(e, reRenderCallback));
    });
    document.querySelectorAll('.permanent-delete-profile').forEach(button => {
        button.addEventListener('click', (e) => profileHandlers.handlePermanentDeleteProfile(e, reRenderCallback));
    });

    // --- Search Listener ---
    const searchInput = document.getElementById('archiveSearchInput');
    if (searchInput) {
        searchInput.addEventListener('input', profileHandlers.handleArchiveSearch);
    }
}