import * as profileHandlers from '../ui_handlers/profile.js';

export function attachProfileEventListeners(reRenderCallback) {
    // --- Listeners for the main profile view ---
    document.querySelectorAll('.nav-link').forEach(tab => {
        tab.addEventListener('click', (e) => profileHandlers.handleTabSwitch(e, reRenderCallback));
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
}