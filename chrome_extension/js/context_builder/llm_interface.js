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
                // Modern ChatGPT uses a contenteditable div for input, which has the id 'prompt-textarea'.
                // A hidden textarea with the same ID may also be present, so we must specifically target the div.
                const inputDiv = document.querySelector('div#prompt-textarea');

                if (inputDiv) {
                    // This is the contenteditable div, so we set its innerText.
                    inputDiv.innerText = textToPaste;
                    
                    // Dispatch an 'input' event so the surrounding React app detects the change.
                    inputDiv.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
                    
                    // ChatGPT often needs a height adjustment after pasting large text.
                    inputDiv.style.height = 'auto';
                    inputDiv.style.height = (inputDiv.scrollHeight) + 'px';
                    inputDiv.focus();

                    // For a better user experience, move the cursor to the end of the pasted text.
                    const range = document.createRange();
                    const sel = window.getSelection();
                    if (sel) {
                        range.selectNodeContents(inputDiv);
                        range.collapse(false); // Collapses the range to its end point.
                        sel.removeAllRanges();
                        sel.addRange(range);
                    }

                    console.log('JustCode: Content loaded into ChatGPT input div.');
                    return;
                }
                
                console.error('JustCode Error: Could not find target input div on ChatGPT.');
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

                    // Clear existing content first to prevent duplication
                    editorDiv.innerHTML = '';

                    // Simulate a native 'paste' event. This is the most reliable way to
                    // trigger Perplexity's custom paste handling, which creates the 'paste.txt'
                    // file attachment for large inputs.
                    try {
                        document.querySelectorAll('button[data-testid="remove-uploaded-file"]').forEach(button => button.click());
                        const pasteEvent = new ClipboardEvent('paste', {
                            bubbles: true,
                            cancelable: true,
                            clipboardData: new DataTransfer()
                        });
                        pasteEvent.clipboardData.setData('text/plain', textToPaste);

                        // Dispatch the event on the editor. Lexical's handler will see this
                        // and replace the current selection with the pasted content/file.
                        editorDiv.dispatchEvent(pasteEvent);
                        
                        // Wait for the upload to complete and then remove the extra file
                        const waitForUploadAndCleanup = () => {
                            // Check for upload completion by looking for the file attachment
                            const checkUploadComplete = () => {
                                const uploadedFiles = document.querySelectorAll('button[data-testid="remove-uploaded-file"]');
                                
                                if (uploadedFiles.length > 0) {
                                    // File has been uploaded, now wait a bit more for processing to stabilize
                                    setTimeout(() => {
                                        // Find all uploaded files and remove the last one (which should be our duplicate)
                                        const currentFiles = document.querySelectorAll('button[data-testid="remove-uploaded-file"]');
                                        if (currentFiles.length > 0) {
                                            const lastFile = currentFiles[currentFiles.length - 1];
                                            lastFile.click();
                                            console.log('JustCode: Removed duplicate uploaded file from Perplexity.');
                                        }
                                    }, 100); // Small additional delay for UI stability
                                } else {
                                    // Upload not complete yet, check again
                                    setTimeout(checkUploadComplete, 100);
                                }
                            };
                            
                            // Start checking for upload completion
                            setTimeout(checkUploadComplete, 1000);
                        };
                        
                        waitForUploadAndCleanup();
                        console.log('JustCode: Content pasted into Perplexity via simulated paste event.');
                    } catch (e) {
                         console.error('JustCode: Failed to simulate paste event. Falling back to insertText.', e);
                    }
                    
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