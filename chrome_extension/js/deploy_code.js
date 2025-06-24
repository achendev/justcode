export async function deployCode(profile, errorDiv) {
    errorDiv.textContent = '';
    const path = profile.projectPath;
    if (!path) {
        errorDiv.textContent = 'Error: Please enter a project path.';
        return;
    }
    try {
        let codeToDeploy;
        if (profile.deployFromClipboard) {
            // Read directly from clipboard if deployFromClipboard is enabled
            codeToDeploy = await navigator.clipboard.readText();
            if (!codeToDeploy || !codeToDeploy.includes("EOPROJECTFILE")) {
                errorDiv.textContent = 'Error: Clipboard content is not a valid deploy script.';
                return;
            }
        } else {
            // Existing logic: parse page for code block and copy button
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            const results = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: () => {
                    const allCodeBlocks = document.querySelectorAll('ms-code-block');
                    let copyButton = null;
                    if (allCodeBlocks.length > 0) {
                        const lastCodeBlock = allCodeBlocks[allCodeBlocks.length - 1];
                        copyButton = lastCodeBlock.querySelector('button[mattooltip="Copy to clipboard"]') ||
                            Array.from(lastCodeBlock.querySelectorAll('button')).find(btn => btn.innerText.trim() === 'content_copy') ||
                            lastCodeBlock.querySelector('button[aria-label="Copy to clipboard"]');
                    }
                    if (!copyButton) {
                        copyButton = Array.from(document.querySelectorAll('button[aria-label="Copy to clipboard"]')).slice(-1)[0];
                    }
                    if (!copyButton) {
                        copyButton = document.evaluate("(//button[contains(., 'Copy')])[last()]", document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
                        if (copyButton) {
                            setTimeout(() => {
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
                            }, 0);
                            return { success: true };
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
            await new Promise(resolve => setTimeout(resolve, 100));
            codeToDeploy = await navigator.clipboard.readText();
            if (!codeToDeploy || !codeToDeploy.includes("EOPROJECTFILE")) {
                errorDiv.textContent = 'Error: Clipboard content is not a valid deploy script.';
                return;
            }
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
}