import { loadData, saveData } from '../../storage.js';
import { defaultCriticalInstructions } from '../../default_instructions.js';
import { forgetHandle } from '../../file_system_manager.js';

export function handleAddProfile(reRenderCallback) {
    loadData((profiles, activeProfileId, archivedProfiles) => {
        const newProfile = {
            id: Date.now(),
            name: `Profile ${profiles.length + 1}`,
            // Universal fields
            getContextTarget: 'ui',
            deployCodeSource: 'ui',
            contextAsFile: true,
            separateInstructions: 'file',
            excludePatterns: '.git/,venv/,.env,log/,*logs/,tmp/,node_modules/',
            includePatterns: '',
            contextSizeLimit: 3000000,
            isCriticalInstructionsEnabled: false,
            criticalInstructions: defaultCriticalInstructions,
            codeBlockDelimiter: '```',
            tolerateErrors: true,
            lastMessage: { text: '', type: 'info' },
            // Mode toggle
            useServerBackend: false,
            // Server-specific fields
            projectPaths: [''],
            serverUrl: 'http://127.0.0.1:5010',
            isAuthEnabled: false,
            username: '',
            password: '',
            runScriptOnDeploy: false,
            postDeployScript: 'set -x\necho Deploy completed',
        };
        profiles.push(newProfile);
        const newActiveProfileId = newProfile.id;
        saveData(profiles, newActiveProfileId, archivedProfiles);
        reRenderCallback(profiles, newActiveProfileId, archivedProfiles);
    });
}

export function handleProfileNameChange(event, reRenderCallback) {
    const id = parseInt(event.target.dataset.id);
    loadData((profiles, activeProfileId, archivedProfiles) => {
        const profile = profiles.find(p => p.id === id);
        profile.name = event.target.value.trim() || 'Unnamed';
        saveData(profiles, activeProfileId, archivedProfiles);
        reRenderCallback(profiles, activeProfileId, archivedProfiles);
    });
}

export function handleCopyProfile(event, reRenderCallback) {
    const id = parseInt(event.currentTarget.dataset.id);
    loadData((profiles, activeProfileId, archivedProfiles) => {
        const profileToCopy = profiles.find(p => p.id === id);
        if (!profileToCopy) return;

        const newProfile = JSON.parse(JSON.stringify(profileToCopy));
        
        newProfile.id = Date.now();
        newProfile.name = `${profileToCopy.name} (Copy)`;
        newProfile.lastMessage = { text: '', type: 'info' }; 
        
        // Don't copy the folder handle, user must select it again for the new profile
        forgetHandle(newProfile.id);

        const originalIndex = profiles.findIndex(p => p.id === id);
        profiles.splice(originalIndex !== -1 ? originalIndex + 1 : profiles.length, 0, newProfile);

        const newActiveProfileId = newProfile.id;
        saveData(profiles, newActiveProfileId, archivedProfiles);
        reRenderCallback(profiles, newActiveProfileId, archivedProfiles);
    });
}