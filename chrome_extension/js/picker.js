import { saveHandle, requestPermission } from './file_system_manager.js';

// This script runs in the dedicated picker.html window.
document.addEventListener('DOMContentLoaded', () => {
    // --- THEME LOGIC ---
    const applyPickerTheme = (theme) => {
        if (theme === 'dark') {
            document.body.classList.remove('light-theme');
            document.body.classList.add('dark-theme');
        } else {
            document.body.classList.remove('dark-theme');
            document.body.classList.add('light-theme');
        }
    };

    const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    applyPickerTheme(systemTheme);

    chrome.storage.local.get('theme', (data) => {
        if (data.theme) {
            applyPickerTheme(data.theme);
        }
    });
    // --- END THEME LOGIC ---

    const urlParams = new URLSearchParams(window.location.search);
    const profileId = parseInt(urlParams.get('profileId'));
    const index = parseInt(urlParams.get('index'));
    
    const messageDiv = document.getElementById('message');
    const subMessageP = document.querySelector('.sub-message');
    const permissionTipP = document.getElementById('permission-tip');
    const selectFolderBtn = document.getElementById('selectFolderBtn');

    if (isNaN(profileId) || isNaN(index)) {
        messageDiv.textContent = 'Error: Missing profile or index information.';
        messageDiv.className = 'error';
        subMessageP.textContent = 'Please close this window and try again.';
        selectFolderBtn.style.display = 'none';
        return;
    }

    selectFolderBtn.addEventListener('click', async () => {
        selectFolderBtn.style.display = 'none';
        messageDiv.textContent = 'Opening folder selection dialog...';
        subMessageP.textContent = 'Please choose a folder in the window that appeared.';

        try {
            const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
            const permissionGranted = await requestPermission(handle);
            
            if (permissionGranted) {
                await saveHandle(profileId, index, handle);
                
                messageDiv.textContent = `Folder '${handle.name}' selected successfully!`;
                messageDiv.className = 'success';
                
                chrome.runtime.sendMessage({
                    type: "folderSelected", 
                    profileId: profileId,
                    index: index,
                    folderName: handle.name
                }).catch(e => console.log("Could not send message, probably because the popup closed. This is expected."));

                if (permissionTipP) {
                    permissionTipP.innerHTML = 'Note: You may have to select folder again and choose <strong class="highlight">"Allow on every visit"</strong> to bypass Chrome limitation.';
                    permissionTipP.style.display = 'block';
                }

                let countdown = 7;
                subMessageP.textContent = `This window will close automatically in ${countdown} seconds...`;
                const interval = setInterval(() => {
                    countdown--;
                    subMessageP.textContent = `This window will close automatically in ${countdown} seconds...`;
                    if (countdown <= 0) {
                        clearInterval(interval);
                        window.close();
                    }
                }, 1000);

            } else {
                messageDiv.textContent = 'Permission to access folder was denied.';
                messageDiv.className = 'error';
                subMessageP.textContent = 'Please close this window and try again, allowing access when prompted.';
            }
        } catch (error) {
            if (error.name === 'AbortError') {
                messageDiv.textContent = 'Folder selection was cancelled.';
                messageDiv.className = '';
                subMessageP.textContent = 'You can close this window.';
            } else {
                console.error('[JustCode Picker] An unexpected error occurred:', error);
                messageDiv.textContent = 'An unexpected error occurred.';
                messageDiv.className = 'error';
                subMessageP.textContent = error.message;
            }
        }
    });
});