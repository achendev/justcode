import { getCode } from './get_code.js';
import { deployCode } from './deploy_code.js';
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
            <div class="profile-header">
                <input type="text" class="profile-name-input" value="${profile.name}" data-id="${profile.id}">
                <button class="btn btn-outline-danger btn-sm delete-profile" data-id="${profile.id}">Delete</button>
            </div>
            <div class="mb-3">
                <label for="projectPath-${profile.id}" class="form-label">Project Path:</label>
                <input type="text" class="form-control form-control-sm project-path" id="projectPath-${profile.id}" placeholder="/path/to/project" value="${profile.projectPath}">
            </div>
            <div class="mb-3">
                <label for="excludePatterns-${profile.id}" class="form-label">Exclude Patterns (comma-separated):</label>
                <input type="text" class="form-control form-control-sm exclude-patterns" id="excludePatterns-${profile.id}" placeholder="*/.git/*,*/venv/*,*.env" value="${profile.excludePatterns}">
            </div>
            <div class="mb-3">
                <label for="includePatterns-${profile.id}" class="form-label">Include Patterns (comma-separated, optional):</label>
                <input type="text" class="form-control form-control-sm include-patterns" id="includePatterns-${profile.id}" placeholder="*.py,*.js,*.html" value="${profile.includePatterns}">
            </div>
            <div class="form-check mb-3">
                <input type="checkbox" class="form-check-input copy-to-clipboard" id="copyToClipboard-${profile.id}" ${profile.copyToClipboard ? 'checked' : ''}>
                <label class="form-check-label" for="copyToClipboard-${profile.id}">Copy to clipboard on Get Code</label>
            </div>
            <div class="d-flex gap-2 mb-3">
                <button class="btn btn-primary btn-sm flex-grow-1 get-code" data-id="${profile.id}">Get Code</button>
                <button class="btn btn-success btn-sm flex-grow-1 deploy-code" data-id="${profile.id}">Deploy Code</button>
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
                profile.excludePatterns = e.target.value.trim() || '*/.git/*,*/venv/*,*.env';
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
    document.querySelectorAll('.get-code').forEach(button => {
        button.addEventListener('click', async (e) => {
            const id = parseInt(e.target.dataset.id);
            loadProfiles(async (profiles, activeProfileId) => {
                const profile = profiles.find(p => p.id === id);
                await getCode(profile, errorDiv);
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
    document.querySelectorAll('.delete-profile').forEach(button => {
        button.addEventListener('click', (e) => {
            const id = parseInt(e.target.dataset.id);
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
}

export function initUI(profilesContainer, profileTabs, addProfileButton, errorDiv) {
    addProfileButton.addEventListener('click', () => {
        loadProfiles((profiles, activeProfileId) => {
            const newProfile = {
                id: Date.now(),
                name: `Profile ${profiles.length + 1}`,
                projectPath: '',
                copyToClipboard: true,
                excludePatterns: '*/.git/*,*/venv/*,*.env',
                includePatterns: ''
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
