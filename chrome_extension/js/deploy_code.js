import { refreshRollbackCount } from './ui.js';
import { updateAndSaveMessage, updateTemporaryMessage } from './ui_handlers/message.js';

const hereDocValue = 'EOPROJECTFILE';

export async function deployCode(profile) {
    updateTemporaryMessage(profile.id, '');
    const path = profile.projectPath;
    if (!path) {
        updateAndSaveMessage(profile.id, 'Error: Please enter a project path.', 'error');
        return;
    }
    try {
        let codeToDeploy;
        if (profile.deployFromClipboard) {
            // Read directly from clipboard if deployFromClipboard is enabled
            codeToDeploy = await navigator.clipboard.readText();
            if (!codeToDeploy || !codeToDeploy.includes(hereDocValue)) {
                updateAndSaveMessage(profile.id, 'Error: Clipboard content is not a valid deploy script.', 'error');
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
                updateAndSaveMessage(profile.id, `Error: ${results.result.error}`, 'error');
                return;
            }
            await new Promise(resolve => setTimeout(resolve, 100));
            codeToDeploy = await navigator.clipboard.readText();
            if (!codeToDeploy || !codeToDeploy.includes(hereDocValue)) {
                updateAndSaveMessage(profile.id, 'Error: Clipboard content is not a valid deploy script.', 'error');
                return;
            }
        }

        const serverUrl = profile.serverUrl.endsWith('/') ? profile.serverUrl.slice(0, -1) : profile.serverUrl;
        const endpoint = `${serverUrl}/deploycode?path=${encodeURIComponent(path)}`;

        const headers = { 'Content-Type': 'text/plain' };
        if (profile.isAuthEnabled && profile.username) {
            headers['Authorization'] = 'Basic ' + btoa(`${profile.username}:${profile.password}`);
        }

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: headers,
            body: codeToDeploy
        });

        const resultText = await response.text();
        if (!response.ok) {
            throw new Error(`Deploy failed: ${resultText}`);
        }
        
        refreshRollbackCount(profile);
        updateAndSaveMessage(profile.id, 'Code deployed successfully!', 'success');
        console.log('JustCode Deploy Result:', resultText);
    } catch (error) {
        updateAndSaveMessage(profile.id, `Error: ${error.message}`, 'error');
        console.error('JustCode Error:', error);
    }
}