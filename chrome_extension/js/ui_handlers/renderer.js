import { getProfileCardHTML } from './html_generators/profile_card.js';
import { getArchivedProfileHTML } from './html_generators/archive_card.js';

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
        const modeClass = profile.useServerBackend ? 'server-mode' : 'js-mode';
        const profileCard = document.createElement('div');
        profileCard.className = `profile-card tab-content ${modeClass} ${profile.id === activeProfileId ? 'active' : ''}`;
        profileCard.id = `profile-${profile.id}`;
        profileCard.innerHTML = getProfileCardHTML(profile);
        profilesContainer.appendChild(profileCard);
    });
}

export function renderArchiveView(archivedProfiles, archiveListContainer) {
    archiveListContainer.innerHTML = '';
    const searchInput = document.getElementById('archiveSearchInput');
    if(searchInput) {
        searchInput.value = '';
    }
    const statusMessage = document.getElementById('archiveStatusMessage');
    if (statusMessage) {
        statusMessage.style.display = 'none';
    }

    if (archivedProfiles.length === 0) {
        if (statusMessage) {
            statusMessage.textContent = 'No archived profiles.';
            statusMessage.style.display = 'block';
        }
        return;
    }
    archivedProfiles.forEach(profile => {
        archiveListContainer.innerHTML += getArchivedProfileHTML(profile);
    });
}