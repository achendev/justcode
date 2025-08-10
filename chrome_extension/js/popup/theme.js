export function initializeTheme() {
    const themeSwitcher = document.getElementById('theme-switcher');
    const themeSelector = document.getElementById('themeSelector');
    const sunIcon = '<i class="bi bi-brightness-high-fill"></i>';
    const cloudyIcon = '<i class="bi bi-cloud-sun-fill"></i>';

    const applyTheme = (theme) => {
        if (theme === 'dark') {
            document.body.classList.remove('light-theme');
            document.body.classList.add('dark-theme');
            themeSwitcher.innerHTML = cloudyIcon;
        } else {
            document.body.classList.remove('dark-theme');
            document.body.classList.add('light-theme');
            themeSwitcher.innerHTML = sunIcon;
        }
    };

    const updateThemeSelectorUI = (theme) => {
        if (themeSelector) {
            themeSelector.value = theme || 'system';
        }
    };

    const handleThemeChange = (newThemeValue) => {
        if (newThemeValue === 'system') {
            const currentSystemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
            applyTheme(currentSystemTheme);
            chrome.storage.local.remove('theme');
            updateThemeSelectorUI('system');
        } else {
            applyTheme(newThemeValue);
            chrome.storage.local.set({ theme: newThemeValue });
            updateThemeSelectorUI(newThemeValue);
        }
    };

    // Step 1: Apply system theme immediately to prevent flashing.
    const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    applyTheme(systemTheme);

    // Step 2: Load and apply user-saved theme, and update UI controls.
    chrome.storage.local.get('theme', (data) => {
        const savedTheme = data.theme;
        if (savedTheme) {
            applyTheme(savedTheme);
        }
        updateThemeSelectorUI(savedTheme || 'system');
    });

    // Theme switcher button event listener
    themeSwitcher.addEventListener('click', () => {
        const isDark = document.body.classList.contains('dark-theme');
        handleThemeChange(isDark ? 'light' : 'dark');
    });

    // Theme settings selector event listener
    if (themeSelector) {
        themeSelector.addEventListener('change', (event) => handleThemeChange(event.target.value));
    }

    // Listener for system theme changes, to update if 'system' is selected
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
        chrome.storage.local.get('theme', (data) => {
            if (!data.theme) { // Only change if we are in system mode
                applyTheme(e.matches ? "dark" : "light");
            }
        });
    });
}