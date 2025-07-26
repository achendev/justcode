import * as actionHandlers from '../ui_handlers/actions.js';

export function attachActionEventListeners() {
    // --- Main action buttons ---
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

    // --- Other action buttons ---
    document.querySelectorAll('.get-exclusion-prompt').forEach(button => {
        button.addEventListener('click', (e) => actionHandlers.handleGetExclusionSuggestionClick(e));
    });
    document.querySelectorAll('.update-app-button').forEach(button => {
        button.addEventListener('click', (e) => actionHandlers.handleUpdateAppClick(e));
    });
}