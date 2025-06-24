import { initUI } from './js/ui.js';

document.addEventListener('DOMContentLoaded', () => {
    const profilesContainer = document.getElementById('profilesContainer');
    const profileTabs = document.getElementById('profileTabs');
    const addProfileButton = document.getElementById('addProfile');
    const errorDiv = document.getElementById('error');
    
    initUI(profilesContainer, profileTabs, addProfileButton, errorDiv);
});