import { updateAndSaveMessage, updateTemporaryMessage } from './ui_handlers/message.js';

async function pasteIntoLLMInterface(text) {
    await chrome.scripting.executeScript({
        target: { tabId: (await chrome.tabs.query({ active: true, currentWindow: true }))[0].id },
        func: (textToPaste) => {
            // Check if we're on chatgpt.com by inspecting the URL
            if (window.location.hostname === 'chatgpt.com' || window.location.hostname === 'www.chatgpt.com') {
                const promptContainer = document.querySelector("#prompt-textarea");
                if (promptContainer) {
                    const pElement = promptContainer.querySelector('p');
                    if (pElement) {
                        pElement.innerText = textToPaste;
                        pElement.dispatchEvent(new Event('input', { bubbles: true }));
                        pElement.dispatchEvent(new Event('change', { bubbles: true }));
                        pElement.focus();
                        console.log('JustCode: Content loaded into ChatGPT p element.');
                        return;
                    }
                }
                console.error('JustCode Error: Could not find target p element within #prompt-textarea.');
            }
            // Fallback for other LLM sites
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
            textarea.value = textToPaste;
            textarea.dispatchEvent(new Event('input', { bubbles: true }));
            textarea.dispatchEvent(new Event('change', { bubbles: true }));
            textarea.focus();
            textarea.scrollTop = textarea.scrollHeight;
            console.log('JustCode: Content loaded into textarea.');
        },
        args: [text]
    });
}

export async function getExclusionSuggestion(profile) {
    const path = profile.projectPath;
    const excludePatterns = profile.excludePatterns || '';
    const includePatterns = profile.includePatterns || '';
    const serverUrl = profile.serverUrl.endsWith('/') ? profile.serverUrl.slice(0, -1) : profile.serverUrl;
    
    if (!path) {
        updateAndSaveMessage(profile.id, 'Error: Please enter a project path.', 'error');
        return;
    }
    
    let endpoint = `${serverUrl}/getcontext?path=${encodeURIComponent(path)}&exclude=${encodeURIComponent(excludePatterns)}&suggest_exclusions=true`;
    if (includePatterns) {
        endpoint += `&include=${encodeURIComponent(includePatterns)}`;
    }
    console.log('JustCode: Fetching exclusion suggestion...');
    
    updateTemporaryMessage(profile.id, 'Getting exclusion suggestion...');

    try {
        const headers = {};
        if (profile.isAuthEnabled && profile.username) {
            headers['Authorization'] = 'Basic ' + btoa(`${profile.username}:${profile.password}`);
        }

        const response = await fetch(endpoint, { method: 'GET', headers: headers });
        const responseText = await response.text();
        if (!response.ok) throw new Error(`Server error: ${response.status} ${responseText}`);
        
        if (profile.copyToClipboard) {
            await navigator.clipboard.writeText(responseText);
            console.log('JustCode: Exclusion suggestion prompt copied to clipboard.');
            updateAndSaveMessage(profile.id, 'Exclusion suggestion prompt copied!', 'success');
        } else {
            await pasteIntoLLMInterface(responseText);
            updateAndSaveMessage(profile.id, 'Exclusion suggestion prompt loaded!', 'success');
        }
    } catch (error) {
        updateAndSaveMessage(profile.id, `Error: ${error.message}`, 'error');
        console.error('JustCode Error:', error);
    }
}

export async function getContext(profile, fromShortcut = false) {
    const path = profile.projectPath;
    const excludePatterns = profile.excludePatterns || '';
    const includePatterns = profile.includePatterns || '';
    const serverUrl = profile.serverUrl.endsWith('/') ? profile.serverUrl.slice(0, -1) : profile.serverUrl;
    const contextSizeLimit = profile.contextSizeLimit || 3000000;
    
    if (!path) {
        updateAndSaveMessage(profile.id, 'Error: Please enter a project path.', 'error');
        return;
    }
    
    let endpoint = `${serverUrl}/getcontext?path=${encodeURIComponent(path)}&exclude=${encodeURIComponent(excludePatterns)}&limit=${contextSizeLimit}`;
    if (includePatterns) {
        endpoint += `&include=${encodeURIComponent(includePatterns)}`;
    }
    console.log('JustCode: Fetching project state...');
    
    updateTemporaryMessage(profile.id, 'Getting context...');

    try {
        const headers = {};
        if (profile.isAuthEnabled && profile.username) {
            headers['Authorization'] = 'Basic ' + btoa(`${profile.username}:${profile.password}`);
        }

        const response = await fetch(endpoint, { method: 'GET', headers: headers });
        const responseText = await response.text();
        if (!response.ok) throw new Error(`Server error: ${response.status} ${responseText}`);
        
        if (profile.copyToClipboard) {
            await navigator.clipboard.writeText(responseText);
            console.log('JustCode: Project context copied to clipboard.');
            updateAndSaveMessage(profile.id, 'Context copied to clipboard!', 'success');
        } else {
            await pasteIntoLLMInterface(responseText);
            updateAndSaveMessage(profile.id, 'Context loaded successfully!', 'success');
        }

        if (fromShortcut) {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: () => {
                    const activeEl = document.activeElement;
                    if (activeEl) {
                        const event = new KeyboardEvent('keydown', { key: 'ArrowLeft', code: 'ArrowLeft', bubbles: true, cancelable: true });
                        activeEl.dispatchEvent(event);
                    }
                }
            });
            window.close();
        }

    } catch (error) {
        updateAndSaveMessage(profile.id, `Error: ${error.message}`, 'error');
        console.error('JustCode Error:', error);
    }
}