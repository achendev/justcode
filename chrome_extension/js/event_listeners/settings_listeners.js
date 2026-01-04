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

    // --- Backend toggle button ---
    document.querySelectorAll('.backend-toggle-btn').forEach(button => {
        button.addEventListener('click', (e) => settingsHandlers.handleBackendToggle(e, reRenderCallback));
    });

    // --- Agent Mode toggle button ---
    document.querySelectorAll('.agent-mode-toggle-btn').forEach(button => {
        button.addEventListener('click', (e) => settingsHandlers.handleAgentModeToggle(e, reRenderCallback));
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
    document.querySelectorAll('.add-empty-line-on-deploy').forEach(checkbox => {
        checkbox.addEventListener('change', (e) => inputHandlers.handleCheckboxChange(e, 'addEmptyLineOnDeploy'));
    });
    document.querySelectorAll('.use-numeric-prefixes-for-multi-project').forEach(checkbox => {
        checkbox.addEventListener('change', (e) => inputHandlers.handleCheckboxChange(e, 'useNumericPrefixesForMultiProject'));
    });
    document.querySelectorAll('.separate-instructions').forEach(select => {
        select.addEventListener('change', (e) => inputHandlers.handleInputChange(e, 'separateInstructions'));
    });
    document.querySelectorAll('.critical-instructions').forEach(textarea => {
        textarea.addEventListener('change', (e) => inputHandlers.handleInputChange(e, 'criticalInstructions'));
    });
    
    // --- Auto Deploy Toggle ---
    document.querySelectorAll('.auto-deploy').forEach(checkbox => {
        checkbox.addEventListener('change', (e) => settingsHandlers.handleAutoDeployToggle(e));
    });
    // --- Agent Review Policy ---
    document.querySelectorAll('.agent-review-policy').forEach(select => {
        select.addEventListener('change', (e) => inputHandlers.handleInputChange(e, 'agentReviewPolicy'));
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
    document.querySelectorAll('.gather-additional-context').forEach(checkbox => {
        checkbox.addEventListener('change', (e) => settingsHandlers.handleGatherAdditionalContextToggle(e));
    });
    document.querySelectorAll('.additional-context-script').forEach(textarea => {
        textarea.addEventListener('change', (e) => inputHandlers.handleInputChange(e, 'additionalContextScript'));
    });
    document.querySelectorAll('.run-script-on-deploy').forEach(checkbox => {
        checkbox.addEventListener('change', (e) => settingsHandlers.handleRunScriptOnDeployToggle(e));
    });
    document.querySelectorAll('.post-deploy-script').forEach(textarea => {
        textarea.addEventListener('change', (e) => inputHandlers.handleInputChange(e, 'postDeployScript'));
    });

    // --- Two-way sync settings ---
    document.querySelectorAll('.two-way-sync-enabled').forEach(checkbox => {
        checkbox.addEventListener('change', (e) => settingsHandlers.handleTwoWaySyncToggle(e));
    });
    document.querySelectorAll('.two-way-sync-rules').forEach(textarea => {
        textarea.addEventListener('change', (e) => inputHandlers.handleInputChange(e, 'twoWaySyncRules'));
    });

    // --- Auto IP Masking ---
    document.querySelectorAll('.auto-mask-ips').forEach(checkbox => {
        checkbox.addEventListener('change', (e) => settingsHandlers.handleAutoMaskIPsToggle(e));
    });
    
    // --- Auto Email Masking ---
    document.querySelectorAll('.auto-mask-emails').forEach(checkbox => {
        checkbox.addEventListener('change', (e) => settingsHandlers.handleAutoMaskEmailsToggle(e));
    });
}