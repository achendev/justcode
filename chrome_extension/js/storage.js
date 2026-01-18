import { defaultCriticalInstructions } from './default_instructions.js';

function migrateProfile(profile) {
    const defaultExcludePatterns = '.git/,venv/,.env,log/,*logs/,tmp/,node_modules/';
    const defaultServerUrl = 'http://127.0.0.1:5010';
    const defaultPostDeployScript = 'set -x\necho Deploy completed';
    const defaultAdditionalContextScript = 'echo "Example: Get current git branch"\ngit rev-parse --abbrev-ref HEAD';
    let changed = false;

    // Migration from old boolean flags to new radio button values
    if (profile.copyToClipboard !== undefined) {
        profile.getContextTarget = profile.copyToClipboard ? 'clipboard' : 'ui';
        delete profile.copyToClipboard;
        changed = true;
    }
    if (profile.deployFromClipboard !== undefined) {
        profile.deployCodeSource = profile.deployFromClipboard ? 'clipboard' : 'ui';
        delete profile.deployFromClipboard;
        changed = true;
    }
    if (profile.separateInstructionsAsFile !== undefined) {
        profile.separateInstructions = profile.separateInstructionsAsFile ? 'file' : 'include';
        delete profile.separateInstructionsAsFile;
        changed = true;
    }
    if (profile.projectPath !== undefined) {
        profile.projectPaths = Array.isArray(profile.projectPath) ? profile.projectPath : [profile.projectPath];
        delete profile.projectPath;
        changed = true;
    }
    if (profile.duplicateInstructions !== undefined) {
        delete profile.duplicateInstructions;
        changed = true;
    }

    // Standard field existence checks
    if (profile.getContextTarget === undefined) { profile.getContextTarget = 'ui'; changed = true; }
    if (profile.deployCodeSource === undefined) { profile.deployCodeSource = 'ui'; changed = true; }
    if (profile.deployFromFullAnswer === undefined) { profile.deployFromFullAnswer = false; changed = true; }
    if (profile.useServerBackend === undefined) { profile.useServerBackend = false; changed = true; }
    if (profile.jsProjectFolderNames === undefined) { profile.jsProjectFolderNames = []; changed = true; }
    if (profile.projectPaths === undefined) { profile.projectPaths = ['']; changed = true; }
    if (profile.serverUrl === undefined) { profile.serverUrl = defaultServerUrl; changed = true; }
    if (profile.isAuthEnabled === undefined) { profile.isAuthEnabled = false; changed = true; }
    if (profile.username === undefined) { profile.username = ''; changed = true; }
    if (profile.password === undefined) { profile.password = ''; changed = true; }
    if (profile.excludePatterns === undefined) { profile.excludePatterns = defaultExcludePatterns; changed = true; }
    if (profile.includePatterns === undefined) { profile.includePatterns = ''; changed = true; }
    if (profile.contextSizeLimit === undefined) { profile.contextSizeLimit = 3000000; changed = true; }
    if (profile.lastMessage === undefined) { profile.lastMessage = { text: '', type: 'info' }; changed = true; }
    if (profile.criticalInstructions === undefined) { profile.criticalInstructions = defaultCriticalInstructions; changed = true; }
    if (profile.isCriticalInstructionsEnabled === undefined) { profile.isCriticalInstructionsEnabled = false; changed = true; }
    if (profile.codeBlockDelimiter === undefined) { profile.codeBlockDelimiter = '```'; changed = true; }
    if (profile.tolerateErrors === undefined) { profile.tolerateErrors = true; changed = true; }
    if (profile.contextAsFile === undefined) { profile.contextAsFile = false; changed = true; }
    if (profile.separateInstructions === undefined) { profile.separateInstructions = 'file'; changed = true; }
    if (profile.runScriptOnDeploy === undefined) { profile.runScriptOnDeploy = false; changed = true; }
    if (profile.postDeployScript === undefined) { profile.postDeployScript = defaultPostDeployScript; changed = true; }
    if (profile.addEmptyLineOnDeploy === undefined) { profile.addEmptyLineOnDeploy = true; changed = true; }
    if (profile.gatherAdditionalContext === undefined) { profile.gatherAdditionalContext = false; changed = true; }
    if (profile.additionalContextScript === undefined) { profile.additionalContextScript = defaultAdditionalContextScript; changed = true; }
    if (profile.useNumericPrefixesForMultiProject === undefined) { profile.useNumericPrefixesForMultiProject = false; changed = true; }
    if (profile.isTwoWaySyncEnabled === undefined) { profile.isTwoWaySyncEnabled = false; changed = true; }
    if (profile.twoWaySyncRules === undefined) { profile.twoWaySyncRules = 'StroNgPasWord|password\nmydomain.com|example.com'; changed = true; }
    if (profile.autoMaskIPs === undefined) { profile.autoMaskIPs = false; changed = true; }
    if (profile.autoMaskEmails === undefined) { profile.autoMaskEmails = false; changed = true; }
    if (profile.autoMaskFQDNs === undefined) { profile.autoMaskFQDNs = false; changed = true; }
    if (profile.autoDeploy === undefined) { profile.autoDeploy = false; changed = true; }
    if (profile.isAgentModeEnabled === undefined) { profile.isAgentModeEnabled = false; changed = true; }
    if (profile.agentReviewPolicy === undefined) { profile.agentReviewPolicy = 'review'; changed = true; }
    
    return changed;
}

export function loadData(callback) {
    chrome.storage.local.get(['profiles', 'activeProfileId', 'archivedProfiles'], (data) => {
        let profiles = data.profiles;
        let archivedProfiles = data.archivedProfiles || [];
        let needsSave = false;

        if (!profiles || profiles.length === 0) {
            profiles = [{
                id: Date.now(),
                name: 'Default',
                getContextTarget: 'ui',
                deployCodeSource: 'ui',
                deployFromFullAnswer: false,
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
                useServerBackend: false,
                jsProjectFolderNames: [],
                projectPaths: [''],
                serverUrl: 'http://127.0.0.1:5010',
                isAuthEnabled: false,
                username: '',
                password: '',
                gatherAdditionalContext: false,
                additionalContextScript: 'echo "Example: Get current git branch"\ngit rev-parse --abbrev-ref HEAD',
                runScriptOnDeploy: false,
                postDeployScript: 'set -x\necho Deploy completed',
                addEmptyLineOnDeploy: true,
                useNumericPrefixesForMultiProject: false,
                isTwoWaySyncEnabled: false,
                twoWaySyncRules: 'StroNgPasWord|password\nmydomain.com|example.com',
                autoMaskIPs: false,
                autoMaskEmails: false,
                autoMaskFQDNs: false,
                autoDeploy: false,
                isAgentModeEnabled: false,
                agentReviewPolicy: 'review'
            }];
            needsSave = true;
        }

        // Ensure all profiles, active and archived, have the latest fields
        profiles.forEach(profile => {
            if (migrateProfile(profile)) {
                needsSave = true;
            }
        });
        archivedProfiles.forEach(profile => {
            if (migrateProfile(profile)) {
                needsSave = true;
            }
        });

        let activeProfileId = data.activeProfileId;
        if (!activeProfileId || !profiles.some(p => p.id === activeProfileId)) {
            activeProfileId = profiles.length > 0 ? profiles[0].id : null;
            needsSave = true;
        }

        if (needsSave) {
            saveData(profiles, activeProfileId, archivedProfiles, () => callback(profiles, activeProfileId, archivedProfiles));
        } else {
            callback(profiles, activeProfileId, archivedProfiles);
        }
    });
}

export function saveData(profiles, activeProfileId, archivedProfiles, callback) {
    chrome.storage.local.set({ profiles, activeProfileId, archivedProfiles }, () => {
        console.log('JustCode: Data saved.');
        if (callback) {
            callback();
        }
    });
}