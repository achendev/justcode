import { saveHandle, requestPermission } from './file_system_manager.js';

// This script runs in the dedicated picker.html window.
// It now waits for a second user click before showing the picker.

document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const profileId = parseInt(urlParams.get('profileId'));
    
    const messageDiv = document.getElementById('message');
    const subMessageP = document.querySelector('.sub-message'); // Gets the first one
    const permissionTipP = document.getElementById('permission-tip');
    const selectFolderBtn = document.getElementById('selectFolderBtn');

    if (!profileId) {
        messageDiv.textContent = 'Error: No profile ID specified.';
        messageDiv.className = 'error';
        subMessageP.textContent = 'Please close this window and try again.';
        selectFolderBtn.style.display = 'none'; // Hide the button
        return;
    }

    // This is the key change: The picker logic is now inside a click listener.
    selectFolderBtn.addEventListener('click', async () => {
        // Update the UI to show we're in progress
        selectFolderBtn.style.display = 'none';
        messageDiv.textContent = 'Opening folder selection dialog...';
        subMessageP.textContent = 'Please choose a folder in the window that appeared.';

        try {
            // This call is now correctly triggered by a direct user gesture.
            const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
            const permissionGranted = await requestPermission(handle);
            
            if (permissionGranted) {
                await saveHandle(profileId, handle);
                
                messageDiv.textContent = `Folder '${handle.name}' selected successfully!`;
                messageDiv.className = 'success';
                
                chrome.runtime.sendMessage({
                    type: "folderSelected", 
                    profileId: profileId,
                    folderName: handle.name
                }).catch(e => console.log("Could not send message, probably because the popup closed. This is expected."));

                if (permissionTipP) {
                    permissionTipP.innerHTML = 'Note: You may have to select folder again and choose <strong class="highlight">"Allow on every visit"</strong> to bypass Chrome limitation.';
                    permissionTipP.style.display = 'block';
                }

                let countdown = 7;
                subMessageP.textContent = `This window will close automatically in ${countdown} seconds...`;

                const countdownInterval = setInterval(() => {
                    countdown--;
                    if (countdown > 0) {
                        subMessageP.textContent = `This window will close automatically in ${countdown} seconds...`;
                    } else {
                        clearInterval(countdownInterval);
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