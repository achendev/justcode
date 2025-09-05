import { defaultCriticalInstructions } from './default_instructions.js';

export function loadData(callback) {
    chrome.storage.local.get(['profiles', 'activeProfileId', 'archivedProfiles'], (data) => {
        const defaultExcludePatterns = '.git/,venv/,.env,log/,*logs/,tmp/,node_modules/';
        const defaultServerUrl = 'http://127.0.0.1:5010';
        const defaultPostDeployScript = 'set -x\necho Deploy completed';
        const defaultAdditionalContextScript = 'echo "Example: Get current git branch"\ngit rev-parse --abbrev-ref HEAD';
        let profiles = data.profiles;
        let needsSave = false;

        if (!profiles || profiles.length === 0) {
            profiles = [{
                id: Date.now(),
                name: 'Default',
                // Universal fields
                getContextTarget: 'ui', // 'ui' or 'clipboard'
                deployCodeSource: 'ui', // 'ui' or 'clipboard'
                deployFromFullAnswer: false,
                contextAsFile: true,
                separateInstructions: 'file',
                excludePatterns: defaultExcludePatterns,
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
                serverUrl: defaultServerUrl,
                isAuthEnabled: false,
                username: '',
                password: '',
                gatherAdditionalContext: false,
                additionalContextScript: defaultAdditionalContextScript,
                runScriptOnDeploy: false,
                postDeployScript: defaultPostDeployScript,
            }];
            needsSave = true;
        }

        // Ensure all profiles have the latest fields
        profiles.forEach(profile => {
            // Migration from old boolean flags to new radio button values
            if (profile.copyToClipboard !== undefined) {
                profile.getContextTarget = profile.copyToClipboard ? 'clipboard' : 'ui';
                delete profile.copyToClipboard;
                needsSave = true;
            }
            if (profile.deployFromClipboard !== undefined) {
                profile.deployCodeSource = profile.deployFromClipboard ? 'clipboard' : 'ui';
                delete profile.deployFromClipboard;
                needsSave = true;
            }
            
            if (profile.separateInstructionsAsFile !== undefined) {
                profile.separateInstructions = profile.separateInstructionsAsFile ? 'file' : 'include';
                delete profile.separateInstructionsAsFile;
                needsSave = true;
            }

            // Migration from projectPath to projectPaths
            if (profile.projectPath !== undefined) {
                profile.projectPaths = Array.isArray(profile.projectPath) ? profile.projectPath : [profile.projectPath];
                delete profile.projectPath;
                needsSave = true;
            }

            // Remove obsolete fields
            if (profile.duplicateInstructions !== undefined) {
                delete profile.duplicateInstructions;
                needsSave = true;
            }

            // Standard field existence checks
            if (profile.getContextTarget === undefined) { profile.getContextTarget = 'ui'; needsSave = true; }
            if (profile.deployCodeSource === undefined) { profile.deployCodeSource = 'ui'; needsSave = true; }
            if (profile.deployFromFullAnswer === undefined) { profile.deployFromFullAnswer = false; needsSave = true; }
            if (profile.useServerBackend === undefined) { profile.useServerBackend = true; needsSave = true; }
            if (profile.projectPaths === undefined) { profile.projectPaths = ['']; needsSave = true; }
            if (profile.serverUrl === undefined) { profile.serverUrl = defaultServerUrl; needsSave = true; }
            if (profile.isAuthEnabled === undefined) { profile.isAuthEnabled = false; needsSave = true; }
            if (profile.username === undefined) { profile.username = ''; needsSave = true; }
            if (profile.password === undefined) { profile.password = ''; needsSave = true; }
            if (profile.excludePatterns === undefined) { profile.excludePatterns = defaultExcludePatterns; needsSave = true; }
            if (profile.includePatterns === undefined) { profile.includePatterns = ''; needsSave = true; }
            if (profile.contextSizeLimit === undefined) { profile.contextSizeLimit = 3000000; needsSave = true; }
            if (profile.lastMessage === undefined) { profile.lastMessage = { text: '', type: 'info' }; needsSave = true; }
            if (profile.criticalInstructions === undefined) { profile.criticalInstructions = defaultCriticalInstructions; needsSave = true; }
            if (profile.isCriticalInstructionsEnabled === undefined) { profile.isCriticalInstructionsEnabled = false; needsSave = true; }
            if (profile.codeBlockDelimiter === undefined) { profile.codeBlockDelimiter = '```'; needsSave = true; }
            if (profile.tolerateErrors === undefined) { profile.tolerateErrors = true; needsSave = true; }
            if (profile.contextAsFile === undefined) { profile.contextAsFile = false; needsSave = true; }
            if (profile.separateInstructions === undefined) { profile.separateInstructions = 'file'; needsSave = true; }
            if (profile.runScriptOnDeploy === undefined) { profile.runScriptOnDeploy = false; needsSave = true; }
            if (profile.postDeployScript === undefined) { profile.postDeployScript = defaultPostDeployScript; needsSave = true; }
            if (profile.gatherAdditionalContext === undefined) { profile.gatherAdditionalContext = false; needsSave = true; }
            if (profile.additionalContextScript === undefined) { profile.additionalContextScript = defaultAdditionalContextScript; needsSave = true; }
        });

        let activeProfileId = data.activeProfileId;
        const archivedProfiles = data.archivedProfiles || [];

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