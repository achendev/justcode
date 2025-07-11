export function loadData(callback) {
    chrome.storage.local.get(['profiles', 'activeProfileId', 'archivedProfiles'], (data) => {
        const defaultExcludePatterns = '.git/,venv/,.env,log/,logs/,tmp/';
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
            rollbackCount: 0,
            contextSizeLimit: 3000000,
            duplicateInstructions: true,
            lastMessage: { text: '', type: 'info' }
        }];
        profiles.forEach(profile => {
            if (!profile.excludePatterns) {
                profile.excludePatterns = defaultExcludePatterns;
            }
            if (!profile.includePatterns) {
                profile.includePatterns = '';
            }
            if (profile.deployFromClipboard === undefined) {
                profile.deployFromClipboard = false;
            }
            if (!profile.serverUrl) {
                profile.serverUrl = defaultServerUrl;
            }
            if (profile.isAuthEnabled === undefined) {
                profile.isAuthEnabled = false;
            }
            if (profile.username === undefined) {
                profile.username = '';
            }
            if (profile.password === undefined) {
                profile.password = '';
            }
            if (profile.rollbackCount === undefined) {
                profile.rollbackCount = 0;
            }
            if (profile.contextSizeLimit === undefined) {
                profile.contextSizeLimit = 3000000;
            }
            if (profile.duplicateInstructions === undefined) {
                profile.duplicateInstructions = true;
            }
            if (!profile.lastMessage) {
                profile.lastMessage = { text: '', type: 'info' };
            }
        });
        const activeProfileId = data.activeProfileId || profiles[0].id;
        const archivedProfiles = data.archivedProfiles || [];
        
        if (!data.profiles) {
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