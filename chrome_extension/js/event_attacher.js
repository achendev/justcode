import * as profileHandlers from './ui_handlers/profile.js';
import * as inputHandlers from './ui_handlers/inputs.js';
import * as actionHandlers from './ui_handlers/actions.js';
import * as settingsHandlers from './ui_handlers/settings.js';
import * as messageHandlers from './ui_handlers/message.js';

export function attachAllEventListeners(reRenderCallback) {
    // Profile-related events that trigger a re-render
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

    // Input changes that don't require a re-render
    document.querySelectorAll('.project-path').forEach(input => {
        input.addEventListener('change', (e) => inputHandlers.handleInputChange(e, 'projectPath'));
    });
    document.querySelectorAll('.exclude-patterns').forEach(input => {
        input.addEventListener('change', (e) => inputHandlers.handleInputChange(e, 'excludePatterns', '.git/,venv/,.env,log/,*logs/,tmp/'));
        input.addEventListener('focus', inputHandlers.handleExcludeFocus);
    });
    document.querySelectorAll('.get-exclusion-prompt').forEach(button => {
        button.addEventListener('click', (e) => actionHandlers.handleGetExclusionSuggestionClick(e));
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
        button.addEventListener('click', (e) => actionHandlers.handleGetContextClick(e));
    });
    document.querySelectorAll('.deploy-code').forEach(button => {
        button.addEventListener('click', (e) => actionHandlers.handleDeployCodeClick(e));
    });
    document.querySelectorAll('.undo-code').forEach(button => {
        button.addEventListener('click', (e) => actionHandlers.handleUndoCodeClick(e));
    });
    document.querySelectorAll('.redo-code').forEach(button => {
        button.addEventListener('click', (e) => actionHandlers.handleRedoCodeClick(e));
    });

    // Settings-related events
    document.querySelectorAll('.server-url').forEach(input => {
        input.addEventListener('change', (e) => settingsHandlers.handleServerUrlChange(e));
    });
    document.querySelectorAll('.context-size-limit').forEach(input => {
        input.addEventListener('change', (e) => inputHandlers.handleInputChange(e, 'contextSizeLimit'));
    });
    document.querySelectorAll('.code-block-delimiter').forEach(select => {
        select.addEventListener('change', (e) => inputHandlers.handleInputChange(e, 'codeBlockDelimiter'));
    });
    document.querySelectorAll('.custom-instructions-enabled').forEach(checkbox => {
        checkbox.addEventListener('change', (e) => settingsHandlers.handleCustomInstructionsToggle(e));
    });
    document.querySelectorAll('.duplicate-instructions').forEach(checkbox => {
        checkbox.addEventListener('change', (e) => inputHandlers.handleCheckboxChange(e, 'duplicateInstructions'));
    });
    document.querySelectorAll('.critical-instructions').forEach(textarea => {
        textarea.addEventListener('change', (e) => inputHandlers.handleInputChange(e, 'criticalInstructions'));
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
    document.querySelectorAll('.update-app-button').forEach(button => {
        button.addEventListener('click', (e) => actionHandlers.handleUpdateAppClick(e));
    });
    document.querySelectorAll('.close-settings').forEach(button => {
        button.addEventListener('click', settingsHandlers.handleCloseSettingsClick);
    });

    // Message-related events
    document.querySelectorAll('.close-message').forEach(button => {
        button.addEventListener('click', messageHandlers.handleCloseMessage);
    });

    // Archive-related events
    document.querySelectorAll('.restore-profile').forEach(button => {
        button.addEventListener('click', (e) => profileHandlers.handleRestoreProfile(e, reRenderCallback));
    });
    document.querySelectorAll('.permanent-delete-profile').forEach(button => {
        button.addEventListener('click', (e) => profileHandlers.handlePermanentDeleteProfile(e, reRenderCallback));
    });
}