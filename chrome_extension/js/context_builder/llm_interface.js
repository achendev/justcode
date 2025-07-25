/**
 * Pastes text into the most likely input field in the active tab.
 * This function contains specific logic for different LLM provider websites
 * to ensure robust pasting behavior.
 * @param {string} text The text to paste.
 */
export async function pasteIntoLLM(text) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) {
        console.error('JustCode Error: No active tab found.');
        return;
    }
    
    await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (textToPaste) => {
            const hostname = window.location.hostname;

            // --- ChatGPT ---
            if (hostname.includes('chatgpt.com')) {
                const textarea = document.querySelector("#prompt-textarea");
                if (textarea) {
                    textarea.value = textToPaste;
                    textarea.dispatchEvent(new Event('input', { bubbles: true }));
                    textarea.dispatchEvent(new Event('change', { bubbles: true }));
                    // ChatGPT often needs a height adjustment after pasting large text
                    textarea.style.height = 'auto';
                    textarea.style.height = (textarea.scrollHeight) + 'px';
                    textarea.focus();
                    console.log('JustCode: Content loaded into ChatGPT textarea.');
                    return;
                }
                console.error('JustCode Error: Could not find target textarea on ChatGPT.');
                return; // Stop if we're on ChatGPT and failed
            }
            
            // --- Google Gemini ---
            if (hostname.includes('gemini.google.com')) {
                const editorDiv = document.querySelector('div.ql-editor[contenteditable="true"]');
                if (editorDiv) {
                    // Gemini's editor (Quill.js) uses <p> tags for lines.
                    // Setting innerText results in double newlines.
                    // Building the HTML directly is more reliable.
                    const lines = textToPaste.split('\n');
                    const newHtml = lines.map(line => {
                         // Basic HTML escaping to prevent code from being interpreted as tags.
                        const escapedLine = line.replace(/&/g, '&').replace(/</g, '<').replace(/>/g, '>');
                        return `<p>${escapedLine || '<br>'}</p>`; // Use <br> for empty lines as Quill does.
                    }).join('');
                    
                    editorDiv.innerHTML = newHtml;

                    // Remove the placeholder class if it exists
                    if (editorDiv.classList.contains('ql-blank')) {
                        editorDiv.classList.remove('ql-blank');
                    }

                    editorDiv.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
                    editorDiv.focus();

                    // Programmatically move the cursor to the end of the content
                    const range = document.createRange();
                    const sel = window.getSelection();
                    if (sel) {
                        range.selectNodeContents(editorDiv);
                        range.collapse(false); // false collapses to the end
                        sel.removeAllRanges();
                        sel.addRange(range);
                    }
                    console.log('JustCode: Content loaded into Gemini editor div.');
                    return;
                }
                console.error('JustCode Error: Could not find target editor div on Gemini.');
                return; // Stop if we're on Gemini and failed
            }

            // --- Perplexity.ai ---
            if (hostname.includes('perplexity.ai')) {
                const editorDiv = document.querySelector('#ask-input[contenteditable="true"]');
                if (editorDiv) {
                    editorDiv.focus();
                    editorDiv.textContent = '';
                    
                    // Create a comprehensive input event for Lexical editor
                    const inputEvent = new InputEvent('beforeinput', {
                        bubbles: true,
                        cancelable: true,
                        inputType: 'insertText',
                        data: textToPaste
                    });
                    
                    editorDiv.dispatchEvent(inputEvent);
                    
                    // Set the content and trigger input event
                    editorDiv.textContent = textToPaste;
                    editorDiv.dispatchEvent(new InputEvent('input', {
                        bubbles: true,
                        cancelable: true,
                        inputType: 'insertText'
                    }));
                    
                    console.log('JustCode: Content loaded into Perplexity via simulated input.');
                    return;
                }
                console.error('JustCode Error: Could not find target editor div on Perplexity.ai.');
                return; // Stop if we're on Perplexity and failed
            }

            // --- Fallback for other sites (like Groq, etc.) ---
            // Find the most likely target element for pasting. This is more robust
            // than relying on `document.activeElement` which can be unreliable.
            const targetElement = document.querySelector('textarea, [contenteditable="true"], [role="textbox"]');
            
            if (targetElement) {
                targetElement.focus();
                
                if (targetElement.isContentEditable) {
                    // For contenteditable, innerText is generally safer than innerHTML
                    targetElement.innerText = textToPaste;
                } else { // Works for <textarea> and other input-like elements
                    targetElement.value = textToPaste;
                }
                
                // Dispatching an 'input' event helps frameworks like React recognize the change.
                targetElement.dispatchEvent(new Event('input', { bubbles: true }));
                 // Some frameworks also listen for 'change'
                targetElement.dispatchEvent(new Event('change', { bubbles: true }));
            } else {
                console.error("JustCode: Could not find a suitable textarea or contenteditable element to paste into.");
            }
        },
        args: [text]
    });
}