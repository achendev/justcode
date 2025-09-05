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
                <span class="input-group-text" style="width: 130px;">Server URL</span>
                <input type="text" class="form-control server-url" id="serverUrl-${profile.id}" placeholder="http://127.0.0.1:5010" value="${profile.serverUrl}">
            </div>
            <div class="form-check mb-2">
                <input type="checkbox" class="form-check-input auth-enabled" id="authEnabled-${profile.id}" data-id="${profile.id}" ${profile.isAuthEnabled ? 'checked' : ''}>
                <label class="form-check-label" for="authEnabled-${profile.id}">Enable Basic Authentication</label>
            </div>
            <div class="input-group input-group-sm mb-2">
                <span class="input-group-text" style="width: 130px;">Username</span>
                <input type="text" class="form-control username" id="username-${profile.id}" data-id="${profile.id}" value="${profile.username}">
            </div>
            <div class="input-group input-group-sm mb-3">
                <span class="input-group-text" style="width: 130px;">Password</span>
                <input type="password" class="form-control password" id="password-${profile.id}" data-id="${profile.id}" value="${profile.password}">
            </div>
            <hr>
            <div class="form-check mb-2">
                <input type="checkbox" class="form-check-input gather-additional-context" id="gatherAdditionalContext-${profile.id}" data-id="${profile.id}" ${profile.gatherAdditionalContext ? 'checked' : ''}>
                <label class="form-check-label" for="gatherAdditionalContext-${profile.id}">Gather additional context script</label>
            </div>
            <div class="mb-3">
                <label for="additionalContextScript-${profile.id}" class="form-label">Additional context script:</label>
                <textarea class="form-control form-control-sm additional-context-script" id="additionalContextScript-${profile.id}" rows="4" data-id="${profile.id}" ${!profile.gatherAdditionalContext ? 'disabled' : ''}>${profile.additionalContextScript}</textarea>
                <small class="form-text text-muted">Runs in project root. Output is appended to context.</small>
            </div>
            <hr>
            <div class="form-check mb-2">
                <input type="checkbox" class="form-check-input run-script-on-deploy" id="runScriptOnDeploy-${profile.id}" data-id="${profile.id}" ${profile.runScriptOnDeploy ? 'checked' : ''}>
                <label class="form-check-label" for="runScriptOnDeploy-${profile.id}">Run script after deploying code</label>
            </div>
            <div class="mb-3">
                <label for="postDeployScript-${profile.id}" class="form-label">Post-deploy script:</label>
                <textarea class="form-control form-control-sm post-deploy-script" id="postDeployScript-${profile.id}" rows="4" data-id="${profile.id}" ${!profile.runScriptOnDeploy ? 'disabled' : ''}>${profile.postDeployScript}</textarea>
                <small class="form-text text-muted">Runs in project root. Use absolute paths for commands if needed.</small>
            </div>
            <hr>
        </div>
        
        <!-- Common Settings -->
        <div class="input-group input-group-sm mb-2">
            <span class="input-group-text" style="width: 130px;">Context Limit</span>
            <input type="number" class="form-control context-size-limit" id="contextSizeLimit-${profile.id}" value="${profile.contextSizeLimit}" title="Context Size Limit (characters)">
        </div>
        <div class="input-group input-group-sm mb-2">
            <span class="input-group-text" style="width: 130px;">Block Delimiter</span>
            <select class="form-select form-select-sm code-block-delimiter" id="codeBlockDelimiter-${profile.id}" data-id="${profile.id}">
                <option value="~~~" ${profile.codeBlockDelimiter === '~~~' ? 'selected' : ''}>~~~</option>
                <option value="\`\`\`" ${profile.codeBlockDelimiter === '```' ? 'selected' : ''}>\`\`\`</option>
            </select>
        </div>
        <div class="form-check mb-2">
            <input type="checkbox" class="form-check-input tolerate-errors" id="tolerateErrors-${profile.id}" data-id="${profile.id}" ${profile.tolerateErrors ? 'checked' : ''}>
            <label class="form-check-label" for="tolerateErrors-${profile.id}">Tolerate script execution errors</label>
        </div>
        <div class="form-check mb-2">
            <input type="checkbox" class="form-check-input use-numeric-prefixes-for-multi-project" id="useNumericPrefixesForMultiProject-${profile.id}" data-id="${profile.id}" ${profile.useNumericPrefixesForMultiProject ? 'checked' : ''}>
            <label class="form-check-label" for="useNumericPrefixesForMultiProject-${profile.id}">Name multiproject directories by order number</label>
        </div>
        <hr>
        
        <!-- Instructions Settings -->
        <div class="input-group input-group-sm mb-2">
            <span class="input-group-text" style="width: 130px;">Send Instructions</span>
            <select class="form-select form-select-sm separate-instructions" id="separateInstructions-${profile.id}" data-id="${profile.id}">
                <option value="include" ${profile.separateInstructions === 'include' ? 'selected' : ''}>Include in context</option>
                <option value="file" ${profile.separateInstructions === 'file' ? 'selected' : ''}>As file</option>
                <option value="text" ${profile.separateInstructions === 'text' ? 'selected' : ''}>As text</option>
            </select>
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

        <!-- Two-Way Sync Settings -->
        <hr>
        <div class="form-check mb-2">
            <input type="checkbox" class="form-check-input two-way-sync-enabled" id="twoWaySyncEnabled-${profile.id}" data-id="${profile.id}" ${profile.isTwoWaySyncEnabled ? 'checked' : ''}>
            <label class="form-check-label" for="twoWaySyncEnabled-${profile.id}">Enable Two-Way Replacements</label>
        </div>
        <div class="mb-3">
            <label for="twoWaySyncRules-${profile.id}" class="form-label">Replacement Rules (local_value|placeholder):</label>
            <textarea class="form-control form-control-sm two-way-sync-rules" id="twoWaySyncRules-${profile.id}" rows="4" data-id="${profile.id}" ${!profile.isTwoWaySyncEnabled ? 'disabled' : ''}>${profile.twoWaySyncRules}</textarea>
            <small class="form-text text-muted">Replaces local values with placeholders before "Get Context", and vice-versa before "Deploy Code".</small>
        </div>
    </div>
    `;
}