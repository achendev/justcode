import * as profileHandlers from './ui_handlers/profile.js';
import * as inputHandlers from './ui_handlers/inputs.js';
import * as actionHandlers from './ui_handlers/actions.js';
import * as settingsHandlers from './ui_handlers/settings.js';

export function attachAllEventListeners(reRenderCallback, errorDiv) {
    // Profile-related events that trigger a re-render
    document.querySelectorAll('.nav-link').forEach(tab => {
        tab.addEventListener('click', (e) => profileHandlers.handleTabSwitch(e, reRenderCallback));
    });

    document.querySelectorAll('.profile-name-input').forEach(input => {
        input.addEventListener('change', (e) => profileHandlers.handleProfileNameChange(e, reRenderCallback));
    });
    
    document.querySelectorAll('.archive-profile').forEach(button => {
        button.addEventListener('click', (e) => profileHandlers.handleArchiveProfile(e, errorDiv, reRenderCallback));
    });

    // Input changes that don't require a re-render
    document.querySelectorAll('.project-path').forEach(input => {
        input.addEventListener('change', (e) => inputHandlers.handleInputChange(e, 'projectPath'));
    });
    document.querySelectorAll('.exclude-patterns').forEach(input => {
        input.addEventListener('change', (e) => inputHandlers.handleInputChange(e, 'excludePatterns', '.git/,venv/,.env,log/,logs/,tmp/'));
    });
    document.querySelectorAll('.include-patterns').forEach(input => {
        input.addEventListener('change', (e) => inputHandlers.handleInputChange(e, 'includePatterns'));
    });
    document.querySelectorAll('.copy-to-clipboard').forEach(checkbox => {
        checkbox.addEventListener('change', (e) => inputHandlers.handleCheckboxChange(e, 'copyToClipboard'));
    });
    document.querySelectorAll('.deploy-from-clipboard').forEach(checkbox => {
        checkbox.addEventListener('change', (e) => inputHandlers.handleCheckboxChange(e, 'deployFromClipboard'));
    });

    // Main action buttons
    document.querySelectorAll('.get-context').forEach(button => {
        button.addEventListener('click', (e) => actionHandlers.handleGetContextClick(e, errorDiv));
    });
    document.querySelectorAll('.deploy-code').forEach(button => {
        button.addEventListener('click', (e) => actionHandlers.handleDeployCodeClick(e, errorDiv));
    });
    document.querySelectorAll('.rollback-code').forEach(button => {
        button.addEventListener('click', (e) => actionHandlers.handleRollbackCodeClick(e, errorDiv));
    });

    // Settings-related events
    document.querySelectorAll('.server-url').forEach(input => {
        input.addEventListener('change', (e) => settingsHandlers.handleServerUrlChange(e));
    });
    document.querySelectorAll('.auth-enabled').forEach(checkbox => {
        checkbox.addEventListener('change', (e) => inputHandlers.handleCheckboxChange(e, 'isAuthEnabled'));
    });
    document.querySelectorAll('.username').forEach(input => {
        input.addEventListener('change', (e) => inputHandlers.handleInputChange(e, 'username'));
    });
    document.querySelectorAll('.password').forEach(input => {
        input.addEventListener('change', (e) => inputHandlers.handleInputChange(e, 'password'));
    });
    document.querySelectorAll('.settings-button').forEach(button => {
        button.addEventListener('click', settingsHandlers.handleOpenSettingsClick);
    });
    document.querySelectorAll('.close-settings').forEach(button => {
        button.addEventListener('click', settingsHandlers.handleCloseSettingsClick);
    });

    // Archive-related events
    document.querySelectorAll('.restore-profile').forEach(button => {
        button.addEventListener('click', (e) => profileHandlers.handleRestoreProfile(e, reRenderCallback));
    });
    document.querySelectorAll('.permanent-delete-profile').forEach(button => {
        button.addEventListener('click', (e) => profileHandlers.handlePermanentDeleteProfile(e, reRenderCallback));
    });
}