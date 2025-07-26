/**
 * Handles pasting text into ChatGPT's input field.
 * This function is designed to be injected into the page.
 * @param {string} textToPaste The text to paste.
 */
export function pasteChatGPT(textToPaste) {
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
}


/**
 * Handles "uploading" a file to ChatGPT by simulating a paste event with file data.
 * This function is designed to be injected into the page.
 * @param {string} filename The name for the file.
 * @param {string} content The text content of the file.
 */
export function pasteAsFileChatGPT(filename, content) {
    const file = new File([content], filename, { type: 'text/plain' });
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);

    // Strategy 1: Simulate a paste event on the main input area. This is the most reliable method
    // as it triggers ChatGPT's own file handling logic.
    const targetElement = document.querySelector('div#prompt-textarea');
    
    if (targetElement) {
        targetElement.focus();
        try {
            const pasteEvent = new ClipboardEvent('paste', {
                bubbles: true,
                cancelable: true,
                clipboardData: dataTransfer
            });
            targetElement.dispatchEvent(pasteEvent);
            console.log('JustCode: Attempted to upload file to ChatGPT via simulated paste event.');
            return; // Success
        } catch (e) {
            console.error('JustCode: Failed to simulate paste event on ChatGPT.', e);
        }
    } else {
        console.warn('JustCode: Could not find target input div on ChatGPT for file paste. Trying fallback.');
    }

    // Strategy 2: Fallback to the generic file input method if the paste event fails.
    // This is less reliable as the input's role in the UI might be complex.
    const fileInput = document.querySelector('input[type="file"]');
    if (fileInput) {
        try {
            fileInput.files = dataTransfer.files;
            fileInput.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
            console.log('JustCode: Uploaded file to ChatGPT via direct input assignment fallback.');
            return; // Success
        } catch (e) {
            console.error('JustCode: ChatGPT direct file input assignment failed.', e);
        }
    }

    console.error('JustCode Error: All file upload methods for ChatGPT failed.');
}