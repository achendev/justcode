function getProfileCardHTML(profile) {
    return `
    <!-- Main View for the profile -->
    <div class="profile-main-view">
        <div class="profile-header">
            <button class="btn btn-outline-secondary btn-sm settings-button" data-id="${profile.id}" title="Profile Settings"><i class="bi bi-gear-wide-connected"></i></button>
            <input type="text" class="form-control form-control-sm profile-name-input" value="${profile.name}" data-id="${profile.id}">
            <button class="btn btn-outline-danger btn-sm delete-profile" data-id="${profile.id}" title="Delete Profile"><i class="bi bi-trash"></i></button>
        </div>
        <div class="d-flex align-items-end gap-2 mb-3">
            <div class="flex-grow-1">
                <label for="projectPath-${profile.id}" class="form-label">Project Path:</label>
                <input type="text" class="form-control form-control-sm project-path" id="projectPath-${profile.id}" placeholder="/path/to/project" value="${profile.projectPath}">
            </div>
            <button class="btn btn-outline-info btn-sm rollback-code" data-id="${profile.id}" title="Rollback the last deploy for this project"><i class="bi bi-arrow-counterclockwise"></i> Rollback</button>
        </div>
        <div class="mb-3">
            <label for="excludePatterns-${profile.id}" class="form-label">Exclude Patterns (comma-separated):</label>
            <input type="text" class="form-control form-control-sm exclude-patterns" id="excludePatterns-${profile.id}" placeholder=".git/,venv/,.env,log/,logs/,tmp/" value="${profile.excludePatterns}">
        </div>
        <div class="mb-3">
            <label for="includePatterns-${profile.id}" class="form-label">Include Patterns (comma-separated):</label>
            <input type="text" class="form-control form-control-sm include-patterns" id="includePatterns-${profile.id}" placeholder="*.py,*.js,*.html" value="${profile.includePatterns}">
        </div>
        <div class="form-check mb-3">
            <input type="checkbox" class="form-check-input copy-to-clipboard" id="copyToClipboard-${profile.id}" ${profile.copyToClipboard ? 'checked' : ''}>
            <label class="form-check-label" for="copyToClipboard-${profile.id}">Copy to clipboard on Get Context</label>
        </div>
        <div class="form-check mb-3">
            <input type="checkbox" class="form-check-input deploy-from-clipboard" id="deployFromClipboard-${profile.id}" ${profile.deployFromClipboard ? 'checked' : ''}>
            <label class="form-check-label" for="deployFromClipboard-${profile.id}">Deploy from clipboard</label>
        </div>
        <div class="d-flex gap-2 mb-3">
            <button class="btn btn-primary btn-sm flex-grow-1 get-context" data-id="${profile.id}"><i class="bi bi-box-arrow-in-down"></i> Get Context</button>
            <button class="btn btn-success btn-sm flex-grow-1 deploy-code" data-id="${profile.id}"><i class="bi bi-box-arrow-up"></i> Deploy Code</button>
        </div>
    </div>

    <!-- Settings View for the profile (hidden by default) -->
    <div class="profile-settings-view" style="display: none;">
        <div class="d-flex justify-content-between align-items-center mb-3">
            <h5 class="mb-0">Settings</h5>
            <button type="button" class="btn-close close-settings" data-id="${profile.id}" aria-label="Close"></button>
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