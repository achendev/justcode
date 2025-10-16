import { loadData, saveData } from '../../storage.js';
import { defaultCriticalInstructions } from '../../default_instructions.js';
import { forgetAllHandlesForProfile } from '../../file_system_manager.js';
import { readFromClipboard } from '../../utils/clipboard.js';
import { writeToClipboard } from '../../utils/clipboard.js';
import { updateAndSaveMessage } from '../message.js';

// Helper function to validate the pasted object
function isProfileLike(obj) {
    if (!obj || typeof obj !== 'object') return false;
    // Check for a few key properties that all profiles should have
    return 'id' in obj && 'name' in obj && 'useServerBackend' in obj && 'excludePatterns' in obj;
}

export async function handleAddProfile(reRenderCallback) {
    // Try to paste from clipboard first
    try {
        const clipboardText = await readFromClipboard();
        if (clipboardText) {
            const potentialProfile = JSON.parse(clipboardText);

            if (isProfileLike(potentialProfile)) {
                loadData((profiles, activeProfileId, archivedProfiles) => {
                    const newProfile = potentialProfile; // Start with the pasted data
                    
                    // Sanitize and update the pasted profile
                    newProfile.id = Date.now();
                    newProfile.name = `${newProfile.name} (Pasted)`;
                    newProfile.lastMessage = { text: 'Pasted from clipboard.', type: 'info' }; 
                    
                    // IMPORTANT: For security and functionality, reset file system access.
                    // The user MUST re-select the folder for this new profile.
                    newProfile.jsProjectFolderNames = [];
                    forgetAllHandlesForProfile(newProfile.id);

                    profiles.push(newProfile);
                    const newActiveProfileId = newProfile.id;
                    saveData(profiles, newActiveProfileId, archivedProfiles);
                    reRenderCallback(profiles, newActiveProfileId, archivedProfiles);
                });
                return; // Exit after successful paste
            }
        }
    } catch (e) {
        // This is expected if clipboard doesn't contain valid JSON.
        // Silently fall through to the default behavior.
    }

    // Default behavior: create a new empty profile
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
            // JS-specific fields
            jsProjectFolderNames: [],
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

    // If shift is held, copy profile as JSON to clipboard
    if (event.shiftKey) {
        loadData(async (profiles) => {
            const profileToCopy = profiles.find(p => p.id === id);
            if (!profileToCopy) return;

            // Create a clean copy without runtime state
            const profileJson = { ...profileToCopy };
            delete profileJson.lastMessage; // Don't copy transient messages

            try {
                await writeToClipboard(JSON.stringify(profileJson));
                updateAndSaveMessage(id, 'Profile JSON copied to clipboard!', 'success');
            } catch (err) {
                console.error("Failed to copy profile JSON:", err);
                updateAndSaveMessage(id, 'Failed to copy profile JSON.', 'error');
            }
        });
        return; // Stop execution here
    }

    // Original functionality: duplicate the profile in the UI
    loadData((profiles, activeProfileId, archivedProfiles) => {
        const profileToCopy = profiles.find(p => p.id === id);
        if (!profileToCopy) return;

        const newProfile = JSON.parse(JSON.stringify(profileToCopy));
        
        newProfile.id = Date.now();
        newProfile.name = `${profileToCopy.name} (Copy)`;
        newProfile.lastMessage = { text: '', type: 'info' }; 
        
        // Don't copy the folder handle, user must select it again for the new profile
        newProfile.jsProjectFolderNames = [];
        forgetAllHandlesForProfile(newProfile.id);

        const originalIndex = profiles.findIndex(p => p.id === id);
        profiles.splice(originalIndex !== -1 ? originalIndex + 1 : profiles.length, 0, newProfile);

        const newActiveProfileId = newProfile.id;
        saveData(profiles, newActiveProfileId, archivedProfiles);
        reRenderCallback(profiles, newActiveProfileId, archivedProfiles);
    });
}