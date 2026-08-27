import * as actionHandlers from '../ui_handlers/actions.js';
import { openContextManager } from '../ui_handlers/context_manager.js';

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
    document.querySelectorAll('.apply-replacements').forEach(button => {
        button.addEventListener('click', (e) => actionHandlers.handleApplyReplacementsClick(e));
    });

    document.querySelectorAll('.open-context-manager').forEach(button => {
        button.addEventListener('click', (e) => openContextManager(e));
    });

    // --- Top Menu Dictation Worker Button ---
    const dictationBtn = document.getElementById('dictationTabButton');
    if (dictationBtn) {
        dictationBtn.addEventListener('click', async () => {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tab && tab.id) {
                chrome.runtime.sendMessage({ type: 'set_dictation_tab', tabId: tab.id });
                dictationBtn.classList.remove('btn-outline-secondary');
                dictationBtn.classList.add('btn-success');
                setTimeout(() => {
                    dictationBtn.classList.remove('btn-success');
                    dictationBtn.classList.add('btn-outline-secondary');
                }, 1200);
            }
        });
    }
}