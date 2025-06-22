import { getCode } from './get_code.js';
import { deployCode } from './deploy_code.js';
import { loadProfiles } from './storage.js';

chrome.commands.onCommand.addListener((command) => {
    loadProfiles((profiles, activeProfileId) => {
        const profile = profiles.find(p => p.id === activeProfileId);
        const errorDiv = { textContent: '' }; // Mock errorDiv for background context
        if (command === 'get-code') {
            getCode(profile, errorDiv).then(() => {
                if (errorDiv.textContent) {
                    console.error('JustCode Error:', errorDiv.textContent);
                }
            });
        } else if (command === 'deploy-code') {
            deployCode(profile, errorDiv).then(() => {
                if (errorDiv.textContent) {
                    console.error('JustCode Error:', errorDiv.textContent);
                }
            });
        }
    });
});
