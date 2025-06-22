export function loadProfiles(callback) {
    chrome.storage.local.get(['profiles', 'activeProfileId'], (data) => {
        const profiles = data.profiles || [{ id: Date.now(), name: 'Default', projectPath: '', copyToClipboard: true }];
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
