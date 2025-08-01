export function getSettingsViewHTML(profile) {
    return `
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