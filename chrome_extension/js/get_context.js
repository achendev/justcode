import { updateAndSaveMessage, updateTemporaryMessage } from './ui_handlers/message.js';
import { defaultCriticalInstructions, hereDocValue } from './default_instructions.js';

async function pasteIntoLLMInterface(text) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) {
        console.error('JustCode Error: No active tab found.');
        // Consider showing an error to the user here.
        return;
    }

    await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (textToPaste) => {
            const hostname = window.location.hostname;

            if (hostname.includes('chatgpt.com')) {
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
                console.error('JustCode Error: Could not find target p element on ChatGPT.');
            
            } else if (hostname.includes('gemini.google.com')) {
                const editorDiv = document.querySelector('div.ql-editor[contenteditable="true"]');
                if (editorDiv) {
                    const lines = textToPaste.split('\n');
                    // Escape HTML special characters to prevent them from being interpreted as tags,
                    // then wrap each line in a <p> tag. Quill uses <p><br></p> for empty lines.
                    const newHtml = lines.map(line => {
                        const escapedLine = line.replace(/&/g, '&').replace(/</g, '<').replace(/>/g, '>');
                        return `<p>${escapedLine || '<br>'}</p>`;
                    }).join('');
                    
                    editorDiv.innerHTML = newHtml;

                    if (editorDiv.classList.contains('ql-blank')) {
                        editorDiv.classList.remove('ql-blank');
                    }

                    editorDiv.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
                    editorDiv.focus();

                    // Move cursor to the end
                    const range = document.createRange();
                    const sel = window.getSelection();
                    if (sel) {
                        range.selectNodeContents(editorDiv);
                        range.collapse(false);
                        sel.removeAllRanges();
                        sel.addRange(range);
                    }
                    console.log('JustCode: Content loaded into Gemini editor div.');
                    return;
                }
                console.error('JustCode Error: Could not find target editor div on Gemini.');
            }

            // Fallback for other LLM sites
            const selectors = [
                'textarea[aria-label="Start typing a prompt"]',
                'textarea[aria-label="Ask Grok anything"]',
                'textarea[aria-label="Ask Gemini"]',
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
        
        // The response is now either an exclusion suggestion or the file context.
        // The suggestion prompt starts with a specific, unique string.
        if (responseText.startsWith("PROJECT FILE TREE")) {
             if (profile.copyToClipboard) {
                await navigator.clipboard.writeText(responseText);
                updateAndSaveMessage(profile.id, 'Context too large. Suggestion prompt copied!', 'success');
            } else {
                await pasteIntoLLMInterface(responseText);
                updateAndSaveMessage(profile.id, 'Context too large. Suggestion prompt loaded!', 'success');
            }
            return; // Stop here
        }

        // It's the file context. Build the full prompt in the frontend.
        const fileContext = responseText;
        
        const codeBlockDelimiter = profile.codeBlockDelimiter || '~~~';
        
        const baseInstructions = profile.isCriticalInstructionsEnabled 
            ? profile.criticalInstructions 
            : defaultCriticalInstructions;
        
        let fenceRule = '';
        if (codeBlockDelimiter === '```') {
            fenceRule = `6.  **NO NESTED CODE FENCES:** Inside a file's content (between \`${hereDocValue}\` delimiters), no line can begin with \`\`\` as it will break the script.`;
        }

        const instructionsBlock = baseInstructions
            .replace(/\{\{DELIMITER\}\}/g, codeBlockDelimiter)
            .replace(/\{\{FENCE_RULE\}\}/g, fenceRule);

        let finalPrompt;
        
        if (profile.duplicateInstructions) {
            finalPrompt = `${instructionsBlock}\n\nThis is current state of project files:\n${codeBlockDelimiter}bash\n${fileContext}${codeBlockDelimiter}\n\n\n${instructionsBlock}\n\n\n \n`;
        } else {
            finalPrompt = `This is current state of project files:\n${codeBlockDelimiter}bash\n${fileContext}${codeBlockDelimiter}\n\n\n${instructionsBlock}\n\n\n \n`;
        }

        if (profile.copyToClipboard) {
            await navigator.clipboard.writeText(finalPrompt);
            console.log('JustCode: Project context copied to clipboard.');
            updateAndSaveMessage(profile.id, 'Context copied to clipboard!', 'success');
        } else {
            await pasteIntoLLMInterface(finalPrompt);
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