document.addEventListener('DOMContentLoaded', () => {
    const projectPathInput = document.getElementById('projectPath');
    const getCodeButton = document.getElementById('getCode');
    const deployCodeButton = document.getElementById('deployCode');
    const errorDiv = document.getElementById('error');
    // Load saved project path
    chrome.storage.local.get('projectPath', (data) => {
        if (data.projectPath) {
            projectPathInput.value = data.projectPath;
        }
    });
    // Save project path on input
    projectPathInput.addEventListener('change', () => {
        const path = projectPathInput.value.trim();
        chrome.storage.local.set({ projectPath: path }, () => {
            console.log('JustCode: Project path saved:', path);
        });
    });
    getCodeButton.addEventListener('click', async () => {
        const path = projectPathInput.value.trim();
        if (!path) {
            errorDiv.textContent = 'Error: Please enter a project path.';
            return;
        }
        const endpoint = `http://127.0.0.1:5010/getcode?path=${encodeURIComponent(path)}`;
        console.log('JustCode: Fetching project state...');
        try {
            const response = await fetch(endpoint);
            const responseText = await response.text();
            if (!response.ok) {
                throw new Error(`Server error: ${response.status} ${responseText}`);
            }
            // Inject script to set textarea content
            chrome.scripting.executeScript({
                target: { tabId: (await chrome.tabs.query({ active: true, currentWindow: true }))[0].id },
                func: (text) => {
                    const selectors = [
                        'textarea[aria-label="Start typing a prompt"]',
                        'textarea[aria-label="Ask Grok anything"]',
                        'textarea[aria-label="Type something or tab to choose an example prompt"]',
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
            errorDiv.textContent = 'Code loaded successfully!';
        } catch (error) {
            errorDiv.textContent = `Error: ${error.message}`;
            console.error('JustCode Error:', error);
        }
    });
    deployCodeButton.addEventListener('click', async () => {
        errorDiv.textContent = '';
        const path = projectPathInput.value.trim();
        if (!path) {
            errorDiv.textContent = 'Error: Please enter a project path.';
            return;
        }
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            const results = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: () => {
                    // Try ms-code-block approach first
                    const allCodeBlocks = document.querySelectorAll('ms-code-block');
                    let copyButton = null;
                    if (allCodeBlocks.length > 0) {
                        const lastCodeBlock = allCodeBlocks[allCodeBlocks.length - 1];
                        copyButton = lastCodeBlock.querySelector('button[mattooltip="Copy to clipboard"]') ||
                            Array.from(lastCodeBlock.querySelectorAll('button')).find(btn => btn.innerText.trim() === 'content_copy') ||
                            lastCodeBlock.querySelector('button[aria-label="Copy"]') ||
                            lastCodeBlock.querySelector('button[aria-label="Copy to clipboard"]');
                    }
                    // If no copy button found in ms-code-block, try document-wide search
                    if (!copyButton) {
                        copyButton = Array.from(document.querySelectorAll('button[aria-label="Copy"]')).slice(-1)[0] ||
                            Array.from(document.querySelectorAll('button[aria-label="Copy to clipboard"]')).slice(-1)[0];
                    }
                    // Fallback to XPath approach
                    if (!copyButton) {
                        copyButton = document.evaluate("(//button[contains(., 'Copy')])[last()]", document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
                        if (copyButton) {
                            const codeElement = copyButton.closest('.relative')?.querySelector('code');
                            if (codeElement) {
                                const t = document.createElement('textarea');
                                t.value = codeElement.textContent;
                                document.body.appendChild(t);
                                t.select();
                                document.execCommand('copy');
                                t.remove();
                                return { success: true };
                            }
                            return { error: 'Could not find code element near the last Copy button.' };
                        }
                    }
                    if (copyButton) {
                        copyButton.click();
                        return { success: true };
                    }
                    return { error: 'No code blocks or Copy buttons found on the page.' };
                }
            });
            if (results[0].result.error) {
                errorDiv.textContent = `Error: ${results[0].result.error}`;
                return;
            }
            // Wait for clipboard to update
            await new Promise(resolve => setTimeout(resolve, 100));
            const codeToDeploy = await navigator.clipboard.readText();
            if (!codeToDeploy || (!codeToDeploy.includes("EOCHANGEDFILE") && !codeToDeploy.includes("EOPROJECTFILE"))) {
                errorDiv.textContent = 'Error: Clipboard content is not a valid deploy script.';
                return;
            }
            const response = await fetch(`http://127.0.0.1:5010/deploycode?path=${encodeURIComponent(path)}`, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain' },
                body: codeToDeploy
            });
            const resultText = await response.text();
            if (!response.ok) {
                throw new Error(`Deploy failed: ${resultText}`);
            }
            errorDiv.textContent = 'Code deployed successfully!';
            console.log('JustCode Deploy Result:', resultText);
        } catch (error) {
            errorDiv.textContent = `Error: ${error.message}`;
            console.error('JustCode Error:', error);
        }
    });
});
