export async function getContext(profile, errorDiv, fromShortcut = false) {
    const path = profile.projectPath;
    const excludePatterns = profile.excludePatterns || '';
    const includePatterns = profile.includePatterns || '';
    const serverUrl = profile.serverUrl.endsWith('/') ? profile.serverUrl.slice(0, -1) : profile.serverUrl;
    const contextSizeLimit = profile.contextSizeLimit || 3000000;
    
    if (!path) {
        errorDiv.textContent = 'Error: Please enter a project path.';
        return;
    }
    
    let endpoint = `${serverUrl}/getcontext?path=${encodeURIComponent(path)}&exclude=${encodeURIComponent(excludePatterns)}&limit=${contextSizeLimit}`;
    if (includePatterns) {
        endpoint += `&include=${encodeURIComponent(includePatterns)}`;
    }
    console.log('JustCode: Fetching project state...');
    
    // Always show the "getting context" message, even for shortcuts.
    errorDiv.textContent = 'Getting context...';

    try {
        const headers = {};
        if (profile.isAuthEnabled && profile.username) {
            headers['Authorization'] = 'Basic ' + btoa(`${profile.username}:${profile.password}`);
        }

        const response = await fetch(endpoint, {
            method: 'GET',
            headers: headers
        });

        const responseText = await response.text();
        if (!response.ok) {
            throw new Error(`Server error: ${response.status} ${responseText}`);
        }
        
        if (profile.copyToClipboard) {
            await navigator.clipboard.writeText(responseText);
            console.log('JustCode: Project context copied to clipboard.');
            if (!fromShortcut) {
                errorDiv.textContent = 'Context copied to clipboard!';
            }
        } else {
            await chrome.scripting.executeScript({
                target: { tabId: (await chrome.tabs.query({ active: true, currentWindow: true }))[0].id },
                func: (text) => {
                    // Check if we're on chatgpt.com by inspecting the URL
                    if (window.location.hostname === 'chatgpt.com' || window.location.hostname === 'www.chatgpt.com') {
                        const promptContainer = document.querySelector("#prompt-textarea");
                        if (promptContainer) {
                            const pElement = promptContainer.querySelector('p');
                            if (pElement) {
                                // Use innerText to preserve newlines in <p> element
                                pElement.innerText = text;
                                pElement.dispatchEvent(new Event('input', { bubbles: true }));
                                pElement.dispatchEvent(new Event('change', { bubbles: true }));
                                pElement.focus();
                                console.log('JustCode: Project state loaded into ChatGPT p element with newlines preserved.');
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
                    textarea.value = text;
                    textarea.dispatchEvent(new Event('input', { bubbles: true }));
                    textarea.dispatchEvent(new Event('change', { bubbles: true }));
                    textarea.focus();
                    textarea.scrollTop = textarea.scrollHeight;
                    console.log('JustCode: Project state loaded into textarea.');
                },
                args: [responseText]
            });
            if (!fromShortcut) {
                errorDiv.textContent = 'Context loaded successfully!';
            }
        }

        if (fromShortcut) {
            // Simulate left arrow key press to ensure focus/UI update.
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: () => {
                    // This event needs to be dispatched to the element that has focus.
                    const activeEl = document.activeElement;
                    if (activeEl) {
                        const event = new KeyboardEvent('keydown', {
                            key: 'ArrowLeft',
                            code: 'ArrowLeft',
                            bubbles: true,
                            cancelable: true
                        });
                        activeEl.dispatchEvent(event);
                        console.log('JustCode: Dispatched ArrowLeft keydown to active element.');
                    }
                }
            });
            window.close();
        }

    } catch (error) {
        errorDiv.textContent = `Error: ${error.message}`;
        console.error('JustCode Error:', error);
    }
}