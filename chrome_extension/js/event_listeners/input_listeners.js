import * as inputHandlers from '../ui_handlers/inputs.js';
import * as folderHandlers from '../ui_handlers/folder.js';

export function attachInputEventListeners() {
    // --- JS Mode ---
    document.querySelectorAll('.select-project-folder').forEach(button => {
        button.addEventListener('click', folderHandlers.handleSelectFolder);
    });
    document.querySelectorAll('.forget-project-folder').forEach(button => {
        button.addEventListener('click', folderHandlers.handleForgetFolder);
    });

    // --- Server Mode ---
     document.querySelectorAll('.project-path').forEach(input => {
        input.addEventListener('change', (e) => inputHandlers.handleInputChange(e, 'projectPath'));
    });

    // --- Common ---
    document.querySelectorAll('.exclude-patterns').forEach(input => {
        input.addEventListener('change', (e) => inputHandlers.handleInputChange(e, 'excludePatterns', '.git/,venv/,.env,log/,*logs/,tmp/'));
        input.addEventListener('focus', inputHandlers.handleExcludeFocus);
    });

    document.querySelectorAll('.include-patterns').forEach(input => {
        input.addEventListener('change', (e) => inputHandlers.handleInputChange(e, 'includePatterns'));
    });
    
    document.querySelectorAll('.get-context-target').forEach(radio => {
        radio.addEventListener('change', (e) => {
            const profileId = e.target.name.split('-')[1];
            const asFileContainer = document.querySelector(`#profile-${profileId} .context-as-file-container`);
            if (asFileContainer) {
                asFileContainer.classList.toggle('d-none', e.target.value === 'clipboard');
            }
    
            const mockEvent = { target: { id: `getContextTarget-${profileId}`, value: e.target.value }};
            inputHandlers.handleInputChange(mockEvent, 'getContextTarget');
        });
    });

    document.querySelectorAll('.deploy-code-source').forEach(radio => {
        radio.addEventListener('change', (e) => {
            const profileId = e.target.name.split('-')[1];
            const asAnswerContainer = document.querySelector(`#profile-${profileId} .deploy-as-answer-container`);
            if (asAnswerContainer) {
                asAnswerContainer.classList.toggle('d-none', e.target.value === 'clipboard');
            }

            const mockEvent = { target: { id: `deployCodeSource-${profileId}`, value: e.target.value }};
            inputHandlers.handleInputChange(mockEvent, 'deployCodeSource');
        });
    });

    document.querySelectorAll('.context-as-file').forEach(checkbox => {
        checkbox.addEventListener('change', (e) => {
            const profileId = e.target.dataset.id;
            const label = document.getElementById(`contextAsFileLabel-${profileId}`);
            if (label) {
                label.textContent = e.target.checked ? 'As file' : 'As text';
            }
            inputHandlers.handleCheckboxChange(e, 'contextAsFile');
        });
    });

    document.querySelectorAll('.deploy-as-answer').forEach(checkbox => {
        checkbox.addEventListener('change', (e) => {
            const profileId = e.target.dataset.id;
            const label = document.getElementById(`deployAsAnswerLabel-${profileId}`);
            if (label) {
                label.textContent = e.target.checked ? 'Answer' : 'Code';
            }
            inputHandlers.handleCheckboxChange(e, 'deployFromFullAnswer');
        });
    });
}