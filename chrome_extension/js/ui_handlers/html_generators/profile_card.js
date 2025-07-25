export function getProfileCardHTML(profile) {
    const message = profile.lastMessage || { text: '', type: 'info' };
    const modeClass = profile.useServerBackend ? 'server-mode' : 'js-mode';

    return `
    <!-- Main View for the profile -->
    <div class="profile-main-view">
        <div class="profile-header">
            <div class="input-group flex-grow-1">
                <button class="btn btn-outline-secondary btn-sm settings-button" type="button" data-id="${profile.id}" title="Profile Settings"><i class="bi bi-gear-wide-connected"></i></button>
                <input type="text" class="form-control form-control-sm profile-name-input" value="${profile.name}" data-id="${profile.id}">
                <button class="btn btn-outline-secondary btn-sm update-app-button server-mode-item" type="button" data-id="${profile.id}" title="Update JustCode Server"><i class="bi bi-download"></i></button>
            </div>
            <div class="btn-group" role="group">
                <button class="btn btn-outline-secondary btn-sm move-profile-left" data-id="${profile.id}" title="Move Left"><i class="bi bi-arrow-bar-left"></i></button>
                <button class="btn btn-outline-secondary btn-sm move-profile-right" data-id="${profile.id}" title="Move Right"><i class="bi bi-arrow-bar-right"></i></button>
            </div>
            <button class="btn btn-outline-warning btn-sm archive-profile" data-id="${profile.id}" title="Archive Profile (Hold Shift to Delete)"><i class="bi bi-archive"></i></button>
            <button class="btn btn-outline-danger btn-sm permanent-delete-direct" data-id="${profile.id}" title="Delete Permanently" style="display: none;"><i class="bi bi-trash"></i></button>
        </div>

        <!-- Project Path/Folder Selection -->
        <div class="mb-2">
            <label class="form-label">Project Location:</label>
            <div class="d-flex gap-2">
                <!-- JS Mode -->
                <div class="input-group input-group-sm js-mode-item flex-grow-1">
                     <button class="btn btn-outline-secondary copy-profile" type="button" data-id="${profile.id}" title="Copy Profile"><i class="bi bi-copy"></i></button>
                     <button class="btn btn-outline-primary flex-grow-1 select-project-folder" id="selectProjectFolder-${profile.id}" data-id="${profile.id}" title="Select Project Folder">
                        <span class="folder-name" id="selectedProjectName-${profile.id}">No Folder Selected</span>
                    </button>
                    <button class="btn btn-outline-danger forget-project-folder" id="forgetProjectFolder-${profile.id}" data-id="${profile.id}" title="Forget this folder" style="display: none;"><i class="bi bi-x-lg"></i></button>
                </div>
                <!-- Server Mode -->
                <div class="input-group input-group-sm server-mode-item flex-grow-1">
                    <button class="btn btn-outline-secondary copy-profile" type="button" data-id="${profile.id}" title="Copy Profile"><i class="bi bi-copy"></i></button>
                    <input type="text" class="form-control project-path" id="projectPath-${profile.id}" placeholder="/path/to/project" value="${profile.projectPath}">
                </div>
                <!-- Backend Toggle Button -->
                <button class="btn btn-outline-secondary btn-sm backend-toggle-btn" type="button" data-id="${profile.id}" title="Switch to ${profile.useServerBackend ? 'Browser (JS) Backend' : 'Server Backend'}">
                    ${profile.useServerBackend 
                        ? '<i class="bi bi-hdd-stack"></i>' 
                        : '<i class="bi bi-browser-chrome"></i>'}
                </button>
            </div>
        </div>
        
        <div class="d-flex align-items-end gap-2 mb-2">
            <div class="flex-grow-1">
                 <label for="excludePatterns-${profile.id}" class="form-label">Exclude Patterns (comma-separated):</label>
                <div class="input-group input-group-sm">
                    <input type="text" class="form-control exclude-patterns" id="excludePatterns-${profile.id}" placeholder=".git/,venv/,.env,log/" value="${profile.excludePatterns || ''}">
                    <button class="btn btn-outline-secondary get-exclusion-prompt" type="button" data-id="${profile.id}" title="Get AI-suggestion for exclude patterns"><i class="bi bi-funnel"></i></button>
                </div>
            </div>
            <div class="btn-group btn-group-sm" role="group">
                <button class="btn btn-outline-secondary undo-code" data-id="${profile.id}" title="Undo the last deploy (Alt+R)" disabled><i class="bi bi-arrow-90deg-left"></i></button>
                <button class="btn btn-outline-secondary redo-code" data-id="${profile.id}" title="Redo the last undo" disabled><i class="bi bi-arrow-90deg-right"></i></button>
            </div>
        </div>
        
        <div class="mb-2 include-patterns-container collapsed" id="includeContainer-${profile.id}">
            <label for="includePatterns-${profile.id}" class="form-label">Include Patterns (comma-separated):</label>
            <input type="text" class="form-control form-control-sm include-patterns" id="includePatterns-${profile.id}" placeholder="*.py,*.js,*.html" value="${profile.includePatterns || ''}">
        </div>

        <!-- Input Controls Wrapper -->
        <div class="input-controls-wrapper mb-3">
            <!-- Get Context Row -->
            <div class="d-flex align-items-center justify-content-between">
                <div class="d-flex align-items-center flex-grow-1">
                    <label class="form-label mb-0 input-control-label">Context to:</label>
                    <div class="form-check form-check-inline mb-0">
                        <input class="form-check-input get-context-target" type="radio" name="getContextTarget-${profile.id}" id="getContextTargetUi-${profile.id}" value="ui" ${profile.getContextTarget === 'ui' ? 'checked' : ''}>
                        <label class="form-check-label" for="getContextTargetUi-${profile.id}">UI</label>
                    </div>
                    <div class="form-check form-check-inline mb-0">
                        <input class="form-check-input get-context-target" type="radio" name="getContextTarget-${profile.id}" id="getContextTargetClipboard-${profile.id}" value="clipboard" ${profile.getContextTarget === 'clipboard' ? 'checked' : ''}>
                        <label class="form-check-label" for="getContextTargetClipboard-${profile.id}">Clipboard</label>
                    </div>
                </div>
                <div class="form-check form-check-inline mb-0 context-as-file-container ${profile.getContextTarget === 'clipboard' ? 'd-none' : ''}">
                    <input type="checkbox" class="form-check-input context-as-file" id="contextAsFile-${profile.id}" data-id="${profile.id}" ${profile.contextAsFile ? 'checked' : ''}>
                    <label class="form-check-label" for="contextAsFile-${profile.id}">As file</label>
                </div>
            </div>

            <!-- Deploy Code Row -->
            <div class="d-flex align-items-center mt-2">
                <label class="form-label mb-0 input-control-label">Deploy from:</label>
                <div class="form-check form-check-inline mb-0">
                    <input class="form-check-input deploy-code-source" type="radio" name="deployCodeSource-${profile.id}" id="deployCodeSourceUi-${profile.id}" value="ui" ${profile.deployCodeSource === 'ui' ? 'checked' : ''}>
                    <label class="form-check-label" for="deployCodeSourceUi-${profile.id}">UI</label>
                </div>
                <div class="form-check form-check-inline mb-0">
                    <input class="form-check-input deploy-code-source" type="radio" name="deployCodeSource-${profile.id}" id="deployCodeSourceClipboard-${profile.id}" value="clipboard" ${profile.deployCodeSource === 'clipboard' ? 'checked' : ''}>
                    <label class="form-check-label" for="deployCodeSourceClipboard-${profile.id}">Clipboard</label>
                </div>
            </div>
        </div>
        
        <div class="d-flex gap-2 action-buttons-container">
            <button class="btn btn-primary btn-sm flex-grow-1 get-context action-btn-main" data-id="${profile.id}"><i class="bi bi-box-arrow-up"></i> Get Context</button>
            <button class="btn btn-success btn-sm flex-grow-1 deploy-code action-btn-main" data-id="${profile.id}"><i class="bi bi-box-arrow-in-down"></i> Deploy Code</button>
        </div>
        
        <div class="status-container mt-3 ${!message.text ? 'd-none' : ''}">
            <div class="status-message status-${message.type}">
                <span class="message-text">${message.text}</span>
                <button type="button" class="btn-close btn-sm close-message" data-id="${profile.id}" aria-label="Close"></button>
            </div>
        </div>
    </div>

    <!-- Settings View for the profile (hidden by default) -->
    <div class="profile-settings-view" style="display: none;">
        <div class="d-flex justify-content-between align-items-center mb-3">
            <h5 class="mb-0">Settings</h5>
            <button type="button" class="btn-close close-settings" data-id="${profile.id}" aria-label="Close"></button>
        </div>
        
        <!-- Server Mode Settings -->
        <div class="server-mode-item">
            <div class="input-group input-group-sm mb-2">
                <span class="input-group-text" style="width: 120px;">Server URL</span>
                <input type="text" class="form-control server-url" id="serverUrl-${profile.id}" placeholder="http://127.0.0.1:5010" value="${profile.serverUrl}">
            </div>
            <div class="form-check mb-2">
                <input type="checkbox" class="form-check-input auth-enabled" id="authEnabled-${profile.id}" data-id="${profile.id}" ${profile.isAuthEnabled ? 'checked' : ''}>
                <label class="form-check-label" for="authEnabled-${profile.id}">Enable Basic Authentication</label>
            </div>
            <div class="input-group input-group-sm mb-2">
                <span class="input-group-text" style="width: 120px;">Username</span>
                <input type="text" class="form-control username" id="username-${profile.id}" data-id="${profile.id}" value="${profile.username}">
            </div>
            <div class="input-group input-group-sm mb-3">
                <span class="input-group-text" style="width: 120px;">Password</span>
                <input type="password" class="form-control password" id="password-${profile.id}" data-id="${profile.id}" value="${profile.password}">
            </div>
            <hr>
        </div>
        
        <!-- Common Settings -->
        <div class="input-group input-group-sm mb-2">
            <span class="input-group-text" style="width: 120px;">Context Limit</span>
            <input type="number" class="form-control context-size-limit" id="contextSizeLimit-${profile.id}" value="${profile.contextSizeLimit}" title="Context Size Limit (characters)">
        </div>
        <div class="input-group input-group-sm mb-2">
            <span class="input-group-text" style="width: 120px;">Block Delimiter</span>
            <select class="form-select form-select-sm code-block-delimiter" id="codeBlockDelimiter-${profile.id}" data-id="${profile.id}">
                <option value="~~~" ${profile.codeBlockDelimiter === '~~~' ? 'selected' : ''}>~~~</option>
                <option value="\`\`\`" ${profile.codeBlockDelimiter === '```' ? 'selected' : ''}>\`\`\`</option>
            </select>
        </div>
        <div class="form-check mb-2">
            <input type="checkbox" class="form-check-input tolerate-errors" id="tolerateErrors-${profile.id}" data-id="${profile.id}" ${profile.tolerateErrors ? 'checked' : ''}>
            <label class="form-check-label" for="tolerateErrors-${profile.id}">Tolerate script execution errors</label>
        </div>
        <hr>
        
        <!-- Instructions Settings -->
        <div class="form-check mb-2">
            <input type="checkbox" class="form-check-input duplicate-instructions" id="duplicateInstructions-${profile.id}" data-id="${profile.id}" ${profile.duplicateInstructions ? 'checked' : ''}>
            <label class="form-check-label" for="duplicateInstructions-${profile.id}">Duplicate Critical Instructions</label>
        </div>
        <div class="form-check mb-2">
            <input type="checkbox" class="form-check-input separate-instructions-as-file" id="separateInstructionsAsFile-${profile.id}" data-id="${profile.id}" ${profile.separateInstructionsAsFile ? 'checked' : ''}>
            <label class="form-check-label" for="separateInstructionsAsFile-${profile.id}">Separate instructions using 'As file'</label>
        </div>
        <div class="form-check mb-2">
            <input type="checkbox" class="form-check-input custom-instructions-enabled" id="customInstructionsEnabled-${profile.id}" data-id="${profile.id}" ${profile.isCriticalInstructionsEnabled ? 'checked' : ''}>
            <label class="form-check-label" for="customInstructionsEnabled-${profile.id}">Enable Custom Critical Instructions</label>
        </div>
        <div class="mb-3">
            <label for="criticalInstructions-${profile.id}" class="form-label">Critical Instructions Prompt:</label>
            <textarea class="form-control form-control-sm critical-instructions" id="criticalInstructions-${profile.id}" rows="8" data-id="${profile.id}" ${!profile.isCriticalInstructionsEnabled ? 'disabled' : ''}>${profile.criticalInstructions}</textarea>
            <small class="form-text text-muted">Use <code>{{DELIMITER}}</code> for your chosen delimiter.</small>
        </div>
    </div>
    `;
}