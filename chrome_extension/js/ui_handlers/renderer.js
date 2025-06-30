function getProfileCardHTML(profile) {
    // Render the stack based on the cached rollbackCount
    const rollbackStackItems = [...Array(10)].map((_, i) => 
        `<div class="rollback-stack-item ${i < profile.rollbackCount ? 'available' : ''}"></div>`
    ).join('');
    
    const message = profile.lastMessage || { text: '', type: 'info' };

    return `
    <!-- Main View for the profile -->
    <div class="profile-main-view">
        <div class="profile-header">
            <div class="input-group flex-grow-1">
                <button class="btn btn-outline-secondary btn-sm settings-button" type="button" data-id="${profile.id}" title="Profile Settings"><i class="bi bi-gear-wide-connected"></i></button>
                <input type="text" class="form-control form-control-sm profile-name-input" value="${profile.name}" data-id="${profile.id}">
                <button class="btn btn-outline-secondary btn-sm update-app-button" type="button" data-id="${profile.id}" title="Update JustCode"><i class="bi bi-download"></i></button>
            </div>
            <div class="btn-group" role="group">
                <button class="btn btn-outline-secondary btn-sm move-profile-left" data-id="${profile.id}" title="Move Left"><i class="bi bi-arrow-bar-left"></i></button>
                <button class="btn btn-outline-secondary btn-sm move-profile-right" data-id="${profile.id}" title="Move Right"><i class="bi bi-arrow-bar-right"></i></button>
            </div>
            <button class="btn btn-outline-warning btn-sm archive-profile" data-id="${profile.id}" title="Archive Profile (Hold Shift to Delete)"><i class="bi bi-archive"></i></button>
            <button class="btn btn-outline-danger btn-sm permanent-delete-direct" data-id="${profile.id}" title="Delete Permanently" style="display: none;"><i class="bi bi-trash"></i></button>
        </div>
        <div class="d-flex align-items-end gap-2 mb-2">
            <div class="flex-grow-1">
                <label for="projectPath-${profile.id}" class="form-label">Project Path:</label>
                <div class="input-group">
                    <button class="btn btn-outline-secondary btn-sm copy-profile" type="button" data-id="${profile.id}" title="Copy Profile"><i class="bi bi-copy"></i></button>
                    <input type="text" class="form-control form-control-sm project-path" id="projectPath-${profile.id}" placeholder="/path/to/project" value="${profile.projectPath}">
                </div>
            </div>
            <button class="btn btn-outline-info btn-sm rollback-code" data-id="${profile.id}" title="Rollback the last deploy for this project"><i class="bi bi-arrow-counterclockwise"></i> Rollback</button>
        </div>
        <div class="rollback-stack-container mb-3" data-id="${profile.id}">
            ${rollbackStackItems}
        </div>
        <div class="mb-3">
            <label for="excludePatterns-${profile.id}" class="form-label">Exclude Patterns (comma-separated):</label>
            <div class="input-group">
                <input type="text" class="form-control form-control-sm exclude-patterns" id="excludePatterns-${profile.id}" placeholder=".git/,venv/,.env,log/,logs/,tmp/" value="${profile.excludePatterns}">
                <button class="btn btn-outline-secondary btn-sm get-exclusion-prompt" type="button" data-id="${profile.id}" title="Get AI-suggestion for exclude patterns"><i class="bi bi-funnel"></i></button>
            </div>
        </div>
        <div class="mb-3 include-patterns-container collapsed" id="includeContainer-${profile.id}">
            <label for="includePatterns-${profile.id}" class="form-label">Include Patterns (comma-separated):</label>
            <input type="text" class="form-control form-control-sm include-patterns" id="includePatterns-${profile.id}" placeholder="*.py,*.js,*.html" value="${profile.includePatterns}">
        </div>
        <div class="form-check mb-3">
            <input type="checkbox" class="form-check-input copy-to-clipboard" id="copyToClipboard-${profile.id}" ${profile.copyToClipboard ? 'checked' : ''}>
            <label class="form-check-label" for="copyToClipboard-${profile.id}">Get Context to clipboard</label>
        </div>
        <div class="form-check mb-3">
            <input type="checkbox" class="form-check-input deploy-from-clipboard" id="deployFromClipboard-${profile.id}" ${profile.deployFromClipboard ? 'checked' : ''}>
            <label class="form-check-label" for="deployFromClipboard-${profile.id}">Deploy Code from clipboard</label>
        </div>
        <div class="d-flex gap-2">
            <button class="btn btn-primary btn-sm flex-grow-1 get-context" data-id="${profile.id}"><i class="bi bi-box-arrow-up"></i> Get Context</button>
            <button class="btn btn-success btn-sm flex-grow-1 deploy-code" data-id="${profile.id}"><i class="bi bi-box-arrow-in-down"></i> Deploy Code</button>
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
        <div class="mb-3">
            <label for="contextSizeLimit-${profile.id}" class="form-label">Context Size Limit (chars):</label>
            <input type="number" class="form-control form-control-sm context-size-limit" id="contextSizeLimit-${profile.id}" value="${profile.contextSizeLimit}">
        </div>
        <div class="mb-3">
            <label for="serverUrl-${profile.id}" class="form-label">JustCode Server URL:</label>
            <input type="text" class="form-control form-control-sm server-url" id="serverUrl-${profile.id}" placeholder="http://127.0.0.1:5010" value="${profile.serverUrl}">
        </div>
        <hr>
        <div class="form-check mb-2">
            <input type="checkbox" class="form-check-input auth-enabled" id="authEnabled-${profile.id}" ${profile.isAuthEnabled ? 'checked' : ''}>
            <label class="form-check-label" for="authEnabled-${profile.id}">Enable Basic Authentication</label>
        </div>
        <div class="mb-2">
            <label for="username-${profile.id}" class="form-label">Username:</label>
            <input type="text" class="form-control form-control-sm username" id="username-${profile.id}" value="${profile.username}">
        </div>
        <div class="mb-3">
            <label for="password-${profile.id}" class="form-label">Password:</label>
            <input type="password" class="form-control form-control-sm password" id="password-${profile.id}" value="${profile.password}">
        </div>
    </div>
    `;
}

function getArchivedProfileHTML(profile) {
    const projectPathDisplay = profile.projectPath || 'No path set';
    return `
    <div class="d-flex align-items-center p-2 mb-2" style="border: 1px solid #6c757d; border-radius: 0.25rem; gap: 10px;">
        <button class="btn btn-outline-success btn-sm restore-profile" data-id="${profile.id}" title="Restore Profile"><i class="bi bi-upload"></i></button>
        <div class="flex-grow-1" style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
            <strong title="${profile.name}">${profile.name}</strong><br>
            <small class="text-muted" title="${projectPathDisplay}">${projectPathDisplay}</small>
        </div>
        <button class="btn btn-outline-danger btn-sm permanent-delete-profile" data-id="${profile.id}" title="Delete Permanently"><i class="bi bi-trash"></i></button>
    </div>
    `;
}

export function renderDOM(profiles, activeProfileId, profilesContainer, profileTabs) {
    profileTabs.innerHTML = '';
    profiles.forEach(profile => {
        const tab = document.createElement('li');
        tab.className = 'nav-item';
        tab.innerHTML = `<a class="nav-link ${profile.id === activeProfileId ? 'active' : ''}" href="#" data-id="${profile.id}">${profile.name}</a>`;
        profileTabs.appendChild(tab);
    });
    
    profilesContainer.innerHTML = '';
    profiles.forEach(profile => {
        const profileCard = document.createElement('div');
        profileCard.className = `profile-card tab-content ${profile.id === activeProfileId ? 'active' : ''}`;
        profileCard.id = `profile-${profile.id}`;
        profileCard.innerHTML = getProfileCardHTML(profile);
        profilesContainer.appendChild(profileCard);
    });
}

export function renderArchiveView(archivedProfiles, archiveListContainer) {
    archiveListContainer.innerHTML = '';
    if (archivedProfiles.length === 0) {
        archiveListContainer.innerHTML = '<p class="text-center text-muted" style="margin-top: 20px;">No archived profiles.</p>';
        return;
    }
    archivedProfiles.forEach(profile => {
        archiveListContainer.innerHTML += getArchivedProfileHTML(profile);
    });
}