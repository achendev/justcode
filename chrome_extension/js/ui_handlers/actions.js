import { getContext } from '../get_context.js';
import { deployCode } from '../deploy_code.js';
import { rollbackCode } from '../rollback.js';
import { loadData } from '../storage.js';

async function performAction(event, errorDiv, actionFunc, ...extraArgs) {
    const id = parseInt(event.currentTarget.dataset.id);
    loadData(async (profiles, activeProfileId, archivedProfiles) => {
        const profile = profiles.find(p => p.id === id);
        await actionFunc(profile, errorDiv, ...extraArgs);
    });
}

export function handleGetContextClick(event, errorDiv, fromShortcut = false) {
    performAction(event, errorDiv, getContext, fromShortcut);
}

export function handleDeployCodeClick(event, errorDiv) {
    performAction(event, errorDiv, deployCode);
}

export function handleRollbackCodeClick(event, errorDiv) {
    performAction(event, errorDiv, rollbackCode);
}