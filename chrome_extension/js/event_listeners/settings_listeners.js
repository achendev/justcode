import * as inputHandlers from '../ui_handlers/inputs.js';
import * as settingsHandlers from '../ui_handlers/settings.js';

export function attachSettingsEventListeners(reRenderCallback) {
    // --- Buttons to show/hide settings view ---
    document.querySelectorAll('.settings-button').forEach(button => {
        button.addEventListener('click', settingsHandlers.handleOpenSettingsClick);
    });
    document.querySelectorAll('.close-settings').forEach(button => {
        button.addEventListener('click', settingsHandlers.handleCloseSettingsClick);
    });

    // --- Backend toggle button (on main view, but it's a setting that causes re-render) ---
    document.querySelectorAll('.backend-toggle-btn').forEach(button => {
        button.addEventListener('click', (e) => settingsHandlers.handleBackendToggle(e, reRenderCallback));
    });

    // --- Inputs inside settings view ---
    document.querySelectorAll('.context-size-limit').forEach(input => {
        input.addEventListener('change', (e) => inputHandlers.handleInputChange(e, 'contextSizeLimit'));
    });
    document.querySelectorAll('.code-block-delimiter').forEach(select => {
        select.addEventListener('change', (e) => inputHandlers.handleInputChange(e, 'codeBlockDelimiter'));
    });
    document.querySelectorAll('.custom-instructions-enabled').forEach(checkbox => {
        checkbox.addEventListener('change', (e) => settingsHandlers.handleCustomInstructionsToggle(e));
    });
    document.querySelectorAll('.tolerate-errors').forEach(checkbox => {
        checkbox.addEventListener('change', (e) => inputHandlers.handleCheckboxChange(e, 'tolerateErrors'));
    });
    document.querySelectorAll('.separate-instructions-as-file').forEach(checkbox => {
        checkbox.addEventListener('change', (e) => inputHandlers.handleCheckboxChange(e, 'separateInstructionsAsFile'));
    });
    document.querySelectorAll('.critical-instructions').forEach(textarea => {
        textarea.addEventListener('change', (e) => inputHandlers.handleInputChange(e, 'criticalInstructions'));
    });
    
    // --- Server-mode settings inside settings view ---
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
    document.querySelectorAll('.run-script-on-deploy').forEach(checkbox => {
        checkbox.addEventListener('change', (e) => settingsHandlers.handleRunScriptOnDeployToggle(e));
    });
    document.querySelectorAll('.post-deploy-script').forEach(textarea => {
        textarea.addEventListener('change', (e) => inputHandlers.handleInputChange(e, 'postDeployScript'));
    });
}