import { getContext } from './get_context.js';
import { deployCode } from './deploy_code.js';
import { rollbackCode } from './rollback.js';
import { loadProfiles, saveProfiles } from './storage.js';

export function renderProfiles(profiles, activeProfileId, profilesContainer, profileTabs, errorDiv) {
    profileTabs.innerHTML = '';
    profiles.forEach(profile => {
        const tab = document.createElement('li');
        tab.className = 'nav-item';
        tab.innerHTML = `
            <a class="nav-link ${profile.id === activeProfileId ? 'active' : ''}" href="#" data-id="${profile.id}">${profile.name}</a>
        `;
        profileTabs.appendChild(tab);
    });
    profilesContainer.innerHTML = '';
    profiles.forEach(profile => {
        const profileCard = document.createElement('div');
        profileCard.className = `profile-card tab-content ${profile.id === activeProfileId ? 'active' : ''}`;
        profileCard.id = `profile-${profile.id}`;
        profileCard.innerHTML = `
            <!-- Main View for the profile -->
            <div class="profile-main-view">
                <div class="profile-header">
                    <button class="btn btn-outline-secondary btn-sm settings-button" data-id="${profile.id}" title="Profile Settings"><i class="bi bi-gear-wide-connected"></i></button>
                    <input type="text" class="profile-name-input" value="${profile.name}" data-id="${profile.id}">
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
            </div>
        `;
        profilesContainer.appendChild(profileCard);
    });
    document.querySelectorAll('.nav-link').forEach(tab => {
        tab.addEventListener('click', (e) => {
            e.preventDefault();
            const id = parseInt(e.target.dataset.id);
            loadProfiles((profiles) => {
                saveProfiles(profiles, id);
                renderProfiles(profiles, id, profilesContainer, profileTabs, errorDiv);
            });
        });
    });
    document.querySelectorAll('.profile-name-input').forEach(input => {
        input.addEventListener('change', (e) => {
            const id = parseInt(e.target.dataset.id);
            loadProfiles((profiles, activeProfileId) => {
                const profile = profiles.find(p => p.id === id);
                profile.name = e.target.value.trim() || 'Unnamed';
                saveProfiles(profiles, activeProfileId);
                renderProfiles(profiles, activeProfileId, profilesContainer, profileTabs, errorDiv);
            });
        });
    });
    document.querySelectorAll('.project-path').forEach(input => {
        input.addEventListener('change', (e) => {
            const id = parseInt(e.target.id.split('-')[1]);
            loadProfiles((profiles, activeProfileId) => {
                const profile = profiles.find(p => p.id === id);
                profile.projectPath = e.target.value.trim();
                saveProfiles(profiles, activeProfileId);
            });
        });
    });
    document.querySelectorAll('.exclude-patterns').forEach(input => {
        input.addEventListener('change', (e) => {
            const id = parseInt(e.target.id.split('-')[1]);
            loadProfiles((profiles, activeProfileId) => {
                const profile = profiles.find(p => p.id === id);
                profile.excludePatterns = e.target.value.trim() || '.git/,venv/,.env,log/,logs/,tmp/';
                saveProfiles(profiles, activeProfileId);
            });
        });
    });
    document.querySelectorAll('.include-patterns').forEach(input => {
        input.addEventListener('change', (e) => {
            const id = parseInt(e.target.id.split('-')[1]);
            loadProfiles((profiles, activeProfileId) => {
                const profile = profiles.find(p => p.id === id);
                profile.includePatterns = e.target.value.trim();
                saveProfiles(profiles, activeProfileId);
            });
        });
    });
    document.querySelectorAll('.copy-to-clipboard').forEach(checkbox => {
        checkbox.addEventListener('change', (e) => {
            const id = parseInt(e.target.id.split('-')[1]);
            loadProfiles((profiles, activeProfileId) => {
                const profile = profiles.find(p => p.id === id);
                profile.copyToClipboard = e.target.checked;
                saveProfiles(profiles, activeProfileId);
            });
        });
    });
    document.querySelectorAll('.deploy-from-clipboard').forEach(checkbox => {
        checkbox.addEventListener('change', (e) => {
            const id = parseInt(e.target.id.split('-')[1]);
            loadProfiles((profiles, activeProfileId) => {
                const profile = profiles.find(p => p.id === id);
                profile.deployFromClipboard = e.target.checked;
                saveProfiles(profiles, activeProfileId);
            });
        });
    });
    document.querySelectorAll('.get-context').forEach(button => {
        button.addEventListener('click', async (e) => {
            const id = parseInt(e.target.dataset.id);
            loadProfiles(async (profiles, activeProfileId) => {
                const profile = profiles.find(p => p.id === id);
                await getContext(profile, errorDiv);
            });
        });
    });
    document.querySelectorAll('.deploy-code').forEach(button => {
        button.addEventListener('click', async (e) => {
            const id = parseInt(e.target.dataset.id);
            loadProfiles(async (profiles, activeProfileId) => {
                const profile = profiles.find(p => p.id === id);
                await deployCode(profile, errorDiv);
            });
        });
    });
    document.querySelectorAll('.rollback-code').forEach(button => {
        button.addEventListener('click', async (e) => {
            const id = parseInt(e.target.dataset.id);
            loadProfiles(async (profiles) => {
                const profile = profiles.find(p => p.id === id);
                await rollbackCode(profile, errorDiv);
            });
        });
    });
    document.querySelectorAll('.delete-profile').forEach(button => {
        button.addEventListener('click', (e) => {
            const id = parseInt(e.currentTarget.closest('.profile-header').querySelector('.delete-profile').dataset.id);
            loadProfiles((profiles, activeProfileId) => {
                if (profiles.length > 1) {
                    const updatedProfiles = profiles.filter(p => p.id !== id);
                    const newActiveProfileId = activeProfileId === id ? updatedProfiles[0].id : activeProfileId;
                    saveProfiles(updatedProfiles, newActiveProfileId);
                    renderProfiles(updatedProfiles, newActiveProfileId, profilesContainer, profileTabs, errorDiv);
                } else {
                    errorDiv.textContent = 'Cannot delete the last profile.';
                }
            });
        });
    });

    // --- Settings Listeners ---
    document.querySelectorAll('.server-url').forEach(input => {
        input.addEventListener('change', (e) => {
            const id = parseInt(e.target.id.split('-')[1]);
            loadProfiles((profiles, activeProfileId) => {
                const profile = profiles.find(p => p.id === id);
                let newUrl = e.target.value.trim();
                if (newUrl.endsWith('/')) {
                    newUrl = newUrl.slice(0, -1);
                }
                profile.serverUrl = newUrl || 'http://127.0.0.1:5010'; // Default if empty
                saveProfiles(profiles, activeProfileId);
            });
        });
    });

    document.querySelectorAll('.settings-button').forEach(button => {
        button.addEventListener('click', (e) => {
            const id = parseInt(e.currentTarget.dataset.id);
            const profileCard = document.getElementById(`profile-${id}`);
            if (profileCard) {
                profileCard.querySelector('.profile-main-view').style.display = 'none';
                profileCard.querySelector('.profile-settings-view').style.display = 'block';
            }
        });
    });

    document.querySelectorAll('.close-settings').forEach(button => {
        button.addEventListener('click', (e) => {
            const id = parseInt(e.currentTarget.dataset.id);
            const profileCard = document.getElementById(`profile-${id}`);
            if (profileCard) {
                profileCard.querySelector('.profile-main-view').style.display = 'block';
                profileCard.querySelector('.profile-settings-view').style.display = 'none';
            }
        });
    });
}

export function initUI(profilesContainer, profileTabs, addProfileButton, errorDiv) {
    addProfileButton.addEventListener('click', () => {
        loadProfiles((profiles, activeProfileId) => {
            const newProfile = {
                id: Date.now(),
                name: `Profile ${profiles.length + 1}`,
                projectPath: '',
                copyToClipboard: true,
                deployFromClipboard: false,
                excludePatterns: '.git/,venv/,.env,log/,logs/,tmp/',
                includePatterns: '',
                serverUrl: 'http://127.0.0.1:5010'
            };
            profiles.push(newProfile);
            saveProfiles(profiles, newProfile.id);
            renderProfiles(profiles, newProfile.id, profilesContainer, profileTabs, errorDiv);
        });
    });
    loadProfiles((profiles, activeProfileId) => {
        renderProfiles(profiles, activeProfileId, profilesContainer, profileTabs, errorDiv);
    });
}