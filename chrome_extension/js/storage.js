export function loadProfiles(callback) {
    chrome.storage.local.get(['profiles', 'activeProfileId'], (data) => {
        const defaultExcludePatterns = '.git/,venv/,.env,log/,logs/,tmp/';
        const defaultServerUrl = 'http://127.0.0.1:5010';
        const profiles = data.profiles || [{ 
            id: Date.now(), 
            name: 'Default', 
            projectPath: '', 
            copyToClipboard: true, 
            deployFromClipboard: false,
            excludePatterns: defaultExcludePatterns,
            includePatterns: '',
            serverUrl: defaultServerUrl
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
        });
        const activeProfileId = data.activeProfileId || profiles[0].id;
        if (!data.profiles) {
            chrome.storage.local.set({ profiles, activeProfileId }, () => callback(profiles, activeProfileId));
        } else {
            callback(profiles, activeProfileId);
        }
    });
}

export function saveProfiles(profiles, activeProfileId) {
    chrome.storage.local.set({ profiles, activeProfileId }, () => {
        console.log('JustCode: Profiles saved:', profiles, 'Active Profile ID:', activeProfileId);
    });
}