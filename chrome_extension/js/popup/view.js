export function initializeViews() {
    const detachWindowButton = document.getElementById('detachWindow');
    const mainView = document.getElementById('mainView');
    const archiveView = document.getElementById('archiveView');
    const appSettingsView = document.getElementById('appSettingsView');
    const contextManagerView = document.getElementById('contextManagerView');
    const archiveButton = document.getElementById('archiveButton');
    const closeArchiveButton = document.getElementById('closeArchive');
    const appSettingsButton = document.getElementById('appSettingsButton');
    const closeAppSettingsButton = document.getElementById('closeAppSettings');
    const closeContextManagerButton = document.getElementById('closeContextManager');

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
        contextManagerView.style.display = 'none';

        const searchInput = document.getElementById('archiveSearchInput');
        if (searchInput) {
            // Use a small timeout to ensure the element is fully visible before focusing
            setTimeout(() => searchInput.focus(), 50);
        }
    });

    closeArchiveButton.addEventListener('click', () => {
        mainView.style.display = 'block';
        archiveView.style.display = 'none';
        appSettingsView.style.display = 'none';
        contextManagerView.style.display = 'none';
    });
    
    appSettingsButton.addEventListener('click', () => {
        mainView.style.display = 'none';
        archiveView.style.display = 'none';
        appSettingsView.style.display = 'block';
        contextManagerView.style.display = 'none';
    });

    closeAppSettingsButton.addEventListener('click', () => {
        mainView.style.display = 'block';
        archiveView.style.display = 'none';
        appSettingsView.style.display = 'none';
        contextManagerView.style.display = 'none';
    });

    closeContextManagerButton.addEventListener('click', () => {
        mainView.style.display = 'block';
        contextManagerView.style.display = 'none';
        restoreWindow();
    });
}

let originalWindowWidth = null;
let originalWindowHeight = null;

export async function expandWindow() {
    const isDetached = new URLSearchParams(window.location.search).get('view') === 'window';
    if (isDetached) {
        const win = await chrome.windows.getCurrent();
        originalWindowWidth = win.width;
        originalWindowHeight = win.height;
        await chrome.windows.update(win.id, {
            width: Math.max(win.width * 2, 750),
            height: Math.max(win.height, 800)
        });
    } else {
        // Expand the standard popup to near maximum allowed limits (800x600)
        document.body.style.width = '780px';
        document.body.style.height = '600px';
    }
}

export async function restoreWindow() {
    const isDetached = new URLSearchParams(window.location.search).get('view') === 'window';
    if (isDetached) {
        if (originalWindowWidth && originalWindowHeight) {
            const win = await chrome.windows.getCurrent();
            await chrome.windows.update(win.id, {
                width: originalWindowWidth,
                height: originalWindowHeight
            });
            originalWindowWidth = null;
            originalWindowHeight = null;
        }
    } else {
        // Revert to CSS defaults (auto-resizes back to standard dimensions)
        document.body.style.width = '';
        document.body.style.height = '';
    }
}