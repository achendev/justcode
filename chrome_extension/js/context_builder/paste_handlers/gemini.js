/**
 * Handles pasting text into Google Gemini's input field.
 * This function is designed to be injected into the page.
 * @param {string} textToPaste The text to paste.
 * @param {object} [options={}] Optional parameters.
 * @param {boolean} [options.insertAtCursor=false] If true, inserts text at cursor instead of replacing.
 */
export function pasteGemini(textToPaste, options = {}) {
    const editorDiv = document.querySelector('div.ql-editor[contenteditable="true"]');
    if (editorDiv) {
        editorDiv.focus();

        if (options.insertAtCursor) {
            // Gemini (Quill editor) handles insertText correctly
            document.execCommand('insertText', false, textToPaste);
        } else {
            // Gemini's editor (Quill.js) uses <p> tags for lines.
            // Setting innerText results in double newlines.
            // Building the HTML directly is more reliable.
            const lines = textToPaste.split('\n');
            const newHtml = lines.map(line => {
                 // Basic HTML escaping to prevent code from being interpreted as tags.
                const escapedLine = line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                return `<p>${escapedLine || '<br>'}</p>`; // Use <br> for empty lines as Quill does.
            }).join('');
            
            editorDiv.innerHTML = newHtml;
        }

        // Remove the placeholder class if it exists
        if (editorDiv.classList.contains('ql-blank')) {
            editorDiv.classList.remove('ql-blank');
        }

        editorDiv.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
        editorDiv.focus();
        
        if (!options.insertAtCursor) {
            // Programmatically move the cursor to the end of the content
            const range = document.createRange();
            const sel = window.getSelection();
            if (sel) {
                range.selectNodeContents(editorDiv);
                range.collapse(false); // false collapses to the end
                sel.removeAllRanges();
                sel.addRange(range);
            }
        }
        console.log('JustCode: Content loaded into Gemini editor div.');
        return;
    }
    console.error('JustCode Error: Could not find target editor div on Gemini.');
}