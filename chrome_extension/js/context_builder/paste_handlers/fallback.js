/**
 * Fallback handler for pasting text into unknown LLM input fields.
 * This function is designed to be injected into the page.
 * @param {string} textToPaste The text to paste.
 * @param {object} [options={}] Optional parameters.
 * @param {boolean} [options.insertAtCursor=false] If true, inserts text at cursor instead of replacing.
 */
export function pasteFallback(textToPaste, options = {}) {
    // Find the most likely target element for pasting.
    const targetElement = document.querySelector('textarea, [contenteditable="true"], [role="textbox"]');
    
    if (targetElement) {
        targetElement.focus();
        
        if (options.insertAtCursor) {
            if (targetElement.isContentEditable) {
                document.execCommand('insertText', false, textToPaste);
            } else { // Textarea
                const start = targetElement.selectionStart;
                const end = targetElement.selectionEnd;
                const val = targetElement.value;
                // Insert text between selection start and end
                targetElement.value = val.substring(0, start) + textToPaste + val.substring(end);
                // Move cursor to end of inserted text
                targetElement.selectionStart = targetElement.selectionEnd = start + textToPaste.length;
            }
        } else {
            if (targetElement.isContentEditable) {
                targetElement.innerText = textToPaste;
            } else { 
                targetElement.value = textToPaste;
            }
        }
        
        // Dispatching an 'input' event helps frameworks like React recognize the change.
        targetElement.dispatchEvent(new Event('input', { bubbles: true }));
        targetElement.dispatchEvent(new Event('change', { bubbles: true }));

        // After a short delay, scroll to the bottom of the input area.
        setTimeout(() => {
            targetElement.focus();
            if (!options.insertAtCursor) {
                // Move cursor to the end
                if (typeof targetElement.selectionStart === 'number') {
                    targetElement.selectionStart = targetElement.selectionEnd = targetElement.value.length;
                } else if (targetElement.isContentEditable) {
                    const range = document.createRange();
                    const sel = window.getSelection();
                    if (sel) {
                        range.selectNodeContents(targetElement);
                        range.collapse(false);
                        sel.removeAllRanges();
                        sel.addRange(range);
                    }
                }
            }
            targetElement.scrollIntoView({ block: 'end', behavior: 'smooth' });
        }, 100);
    } else {
        console.error("JustCode: Could not find a suitable textarea or contenteditable element to paste into.");
    }
}