document.addEventListener('DOMContentLoaded', () => {
    const applyTheme = (theme) => {
        if (theme === 'dark') {
            document.body.classList.remove('light-theme');
            document.body.classList.add('dark-theme');
        } else {
            document.body.classList.remove('dark-theme');
            document.body.classList.add('light-theme');
        }
    };

    // 1. Apply system theme immediately to prevent flashing
    const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    applyTheme(systemTheme);

    // 2. Load and apply user-saved theme from extension storage
    try {
        chrome.storage.local.get('theme', (data) => {
            const savedTheme = data.theme;
            if (savedTheme) {
                applyTheme(savedTheme);
            }
        });
    } catch (e) {
        console.warn("Could not access chrome.storage. This is expected if the page is opened as a file.");
    }
    

    // 3. Listen for theme changes in other parts of the extension
    try {
        chrome.storage.onChanged.addListener((changes, namespace) => {
            if (namespace === 'local' && changes.theme) {
                const newTheme = changes.theme.newValue;
                if (newTheme === 'system' || !newTheme) {
                     applyTheme(window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
                } else {
                    applyTheme(newTheme);
                }
            }
        });
    } catch (e) {
        console.warn("Could not add chrome.storage.onChanged listener.");
    }
});