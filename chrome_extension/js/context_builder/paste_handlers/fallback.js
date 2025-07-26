/**
 * Fallback handler for pasting text into unknown LLM input fields.
 * This function is designed to be injected into the page.
 * @param {string} textToPaste The text to paste.
 */
export function pasteFallback(textToPaste) {
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
}