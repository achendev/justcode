import { getMainViewHTML } from './profile_card/main_view.js';
import { getSettingsViewHTML } from './profile_card/settings_view.js';

export function getProfileCardHTML(profile) {
    return `
        ${getMainViewHTML(profile)}
        ${getSettingsViewHTML(profile)}
    `;
}