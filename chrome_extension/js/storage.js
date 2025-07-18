import { defaultCriticalInstructions } from './default_instructions.js';

export function loadData(callback) {
    chrome.storage.local.get(['profiles', 'activeProfileId', 'archivedProfiles'], (data) => {
        const defaultExcludePatterns = '.git/,venv/,.env,log/,*logs/,tmp/';
        const defaultServerUrl = 'http://127.0.0.1:5010';
        const profiles = data.profiles || [{ 
            id: Date.now(), 
            name: 'Default', 
            projectPath: '', 
            copyToClipboard: false, 
            deployFromClipboard: false,
            excludePatterns: defaultExcludePatterns,
            includePatterns: '',
            serverUrl: defaultServerUrl,
            isAuthEnabled: false,
            username: '',
            password: '',
            contextSizeLimit: 3000000,
            isCriticalInstructionsEnabled: false,
            criticalInstructions: defaultCriticalInstructions,
            duplicateInstructions: false,
            codeBlockDelimiter: '```',
            tolerateErrors: true,
            lastMessage: { text: '', type: 'info' }
        }];
        
        let needsSave = !data.profiles;

        // Ensure all profiles have the latest fields
        profiles.forEach(profile => {
            if (profile.excludePatterns === undefined) { profile.excludePatterns = defaultExcludePatterns; needsSave = true; }
            if (profile.includePatterns === undefined) { profile.includePatterns = ''; needsSave = true; }
            if (profile.deployFromClipboard === undefined) { profile.deployFromClipboard = false; needsSave = true; }
            if (profile.serverUrl === undefined) { profile.serverUrl = defaultServerUrl; needsSave = true; }
            if (profile.isAuthEnabled === undefined) { profile.isAuthEnabled = false; needsSave = true; }
            if (profile.username === undefined) { profile.username = ''; needsSave = true; }
            if (profile.password === undefined) { profile.password = ''; needsSave = true; }
            if (profile.contextSizeLimit === undefined) { profile.contextSizeLimit = 3000000; needsSave = true; }
            if (profile.lastMessage === undefined) { profile.lastMessage = { text: '', type: 'info' }; needsSave = true; }
            if (profile.criticalInstructions === undefined) { profile.criticalInstructions = defaultCriticalInstructions; needsSave = true; }
            if (profile.isCriticalInstructionsEnabled === undefined) { profile.isCriticalInstructionsEnabled = false; needsSave = true; }
            if (profile.duplicateInstructions === undefined) { profile.duplicateInstructions = false; needsSave = true; }
            if (profile.codeBlockDelimiter === undefined) { profile.codeBlockDelimiter = '```'; needsSave = true; }
            if (profile.tolerateErrors === undefined) { profile.tolerateErrors = true; needsSave = true; }
            if (profile.rollbackCount !== undefined) { delete profile.rollbackCount; needsSave = true; } // Remove obsolete field
        });

        const activeProfileId = data.activeProfileId || (profiles.length > 0 ? profiles[0].id : null);
        const archivedProfiles = data.archivedProfiles || [];
        
        if (needsSave) {
            chrome.storage.local.set({ profiles, activeProfileId, archivedProfiles }, () => callback(profiles, activeProfileId, archivedProfiles));
        } else {
            callback(profiles, activeProfileId, archivedProfiles);
        }
    });
}

export function saveData(profiles, activeProfileId, archivedProfiles) {
    chrome.storage.local.set({ profiles, activeProfileId, archivedProfiles }, () => {
        console.log('JustCode: Data saved.');
    });
}