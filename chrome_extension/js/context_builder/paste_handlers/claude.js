/**
 * Handles pasting text into Anthropic Claude's input field.
 * This function is designed to be injected into the page.
 * @param {string} textToPaste The text to paste.
 * @param {object} [options={}] Optional parameters.
 * @param {boolean} [options.insertAtCursor=false] If true, inserts text at cursor instead of replacing.
 */
export function pasteClaude(textToPaste, options = {}) {
    // Claude uses a ProseMirror editor, which is a contenteditable div.
    // The selector targets the specific contenteditable element.
    const editorDiv = document.querySelector('div.ProseMirror[role="textbox"]');

    if (editorDiv) {
        editorDiv.focus();

        if (options.insertAtCursor) {
            document.execCommand('insertText', false, textToPaste);
        } else {
            // ProseMirror editors often work best by constructing HTML to preserve line breaks.
            // We will wrap each line in a <p> tag, which is standard for this editor.
            const lines = textToPaste.split('\n');
            const newHtml = lines.map(line => {
                // Basic HTML escaping to prevent code from being interpreted as tags.
                const escapedLine = line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                // ProseMirror uses <p> for lines. An empty line becomes <p><br></p>.
                return `<p>${escapedLine || '<br>'}</p>`;
            }).join('');

            editorDiv.innerHTML = newHtml;
        }

        // Dispatch an 'input' event so the surrounding framework detects the change.
        editorDiv.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
        editorDiv.focus();

        if (!options.insertAtCursor) {
            // For a better user experience, move the cursor to the end of the pasted text.
            const range = document.createRange();
            const sel = window.getSelection();
            if (sel) {
                range.selectNodeContents(editorDiv);
                range.collapse(false); // Collapses the range to its end point.
                sel.removeAllRanges();
                sel.addRange(range);
            }
        }

        console.log('JustCode: Content loaded into Claude input div.');
        return;
    }
    
    console.error('JustCode Error: Could not find target input div on claude.ai.');
}