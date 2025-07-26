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