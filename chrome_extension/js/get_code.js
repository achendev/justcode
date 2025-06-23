export async function getCode(profile, errorDiv) {
    const path = profile.projectPath;
    const excludePatterns = profile.excludePatterns || '';
    const includePatterns = profile.includePatterns || '';
    if (!path) {
        errorDiv.textContent = 'Error: Please enter a project path.';
        return;
    }
    let endpoint = `http://127.0.0.1:5010/getcode?path=${encodeURIComponent(path)}&exclude=${encodeURIComponent(excludePatterns)}`;
    if (includePatterns) {
        endpoint += `&include=${encodeURIComponent(includePatterns)}`;
    }
    console.log('JustCode: Fetching project state...');
    try {
        const response = await fetch(endpoint);
        const responseText = await response.text();
        if (!response.ok) {
            throw new Error(`Server error: ${response.status} ${responseText}`);
        }
        if (profile.copyToClipboard) {
            await navigator.clipboard.writeText(responseText);
            console.log('JustCode: Project state copied to clipboard.');
        }
        chrome.scripting.executeScript({
            target: { tabId: (await chrome.tabs.query({ active: true, currentWindow: true }))[0].id },
            func: (text) => {
                const selectors = [
                    'textarea[aria-label="Start typing a prompt"]',
                    'textarea[aria-label="Ask Grok anything"]',
                    'textarea[aria-label^="Type something"]',
                    'p[placeholder="data-placeholder"]',
                    'textarea[placeholder="Ask anything"]'
                ];
                let textarea;
                for (const selector of selectors) {
                    textarea = document.querySelector(selector);
                    if (textarea) break;
                }
                if (!textarea) {
                    console.error('JustCode Error: Could not find target textarea.');
                    return;
                }
                textarea.value = text;
                textarea.dispatchEvent(new Event('input', { bubbles: true }));
                textarea.dispatchEvent(new Event('change', { bubbles: true }));
                textarea.focus();
                textarea.scrollTop = textarea.scrollHeight;
                console.log('JustCode: Project state loaded into textarea.');
            },
            args: [responseText]
        });
        errorDiv.textContent = profile.copyToClipboard ? 'Code loaded and copied to clipboard!' : 'Code loaded successfully!';
    } catch (error) {
        errorDiv.textContent = `Error: ${error.message}`;
        console.error('JustCode Error:', error);
    }
}
