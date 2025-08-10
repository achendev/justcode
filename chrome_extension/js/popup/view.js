export function initializeViews() {
    const detachWindowButton = document.getElementById('detachWindow');
    const mainView = document.getElementById('mainView');
    const archiveView = document.getElementById('archiveView');
    const appSettingsView = document.getElementById('appSettingsView');
    const archiveButton = document.getElementById('archiveButton');
    const closeArchiveButton = document.getElementById('closeArchive');
    const appSettingsButton = document.getElementById('appSettingsButton');
    const closeAppSettingsButton = document.getElementById('closeAppSettings');

    // --- View Mode & Detach Logic ---
    const urlParams = new URLSearchParams(window.location.search);
    const isDetached = urlParams.get('view') === 'window';
    const initialHeight = urlParams.get('height');

    if (isDetached) {
        detachWindowButton.style.display = 'none';
        document.body.classList.add('detached');
        if (initialHeight) {
            const adjustedHeight = parseInt(initialHeight, 10) + 40;
            document.body.style.height = `${adjustedHeight}px`;
        }
    } else {
        detachWindowButton.addEventListener('click', () => {
            const currentHeight = mainView.offsetHeight;
            const popupUrl = chrome.runtime.getURL(`popup.html?view=window&height=${currentHeight}`);
            chrome.windows.create({
                url: popupUrl,
                type: 'popup',
                width: 350,
                height: currentHeight + 57
            });
            window.close();
        });
    }
    
    // --- View Switching Logic ---
    archiveButton.addEventListener('click', () => {
        mainView.style.display = 'none';
        archiveView.style.display = 'block';
        appSettingsView.style.display = 'none';
    });

    closeArchiveButton.addEventListener('click', () => {
        mainView.style.display = 'block';
        archiveView.style.display = 'none';
        appSettingsView.style.display = 'none';
    });
    
    appSettingsButton.addEventListener('click', () => {
        mainView.style.display = 'none';
        archiveView.style.display = 'none';
        appSettingsView.style.display = 'block';
    });

    closeAppSettingsButton.addEventListener('click', () => {
        mainView.style.display = 'block';
        archiveView.style.display = 'none';
        appSettingsView.style.display = 'none';
    });
}