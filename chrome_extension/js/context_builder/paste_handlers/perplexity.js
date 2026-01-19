/**
 * Handles pasting text into Perplexity.ai's input field.
 * This function is designed to be injected into the page.
 * @param {string} textToPaste The text to paste.
 * @param {object} [options={}] Optional parameters.
 * @param {boolean} [options.isInstruction=false] True if pasting instructions for an existing file upload.
 * @param {boolean} [options.insertAtCursor=false] If true, inserts text at cursor instead of replacing.
 */
export function pastePerplexity(textToPaste, options = {}) {
    const editorDiv = document.querySelector('#ask-input[contenteditable="true"]');
    if (editorDiv) {
        editorDiv.focus();

        // Clear existing content first to prevent duplication only if we are NOT inserting at cursor
        if (!options.insertAtCursor) {
            editorDiv.innerHTML = '';
        }

        // Simulate a native 'paste' event. This is the most reliable way to
        // trigger Perplexity's custom paste handling.
        try {
            if (!options.insertAtCursor) {
                document.querySelectorAll('button[data-testid="remove-uploaded-file"]').forEach(button => button.click());
            }
            
            const pasteEvent = new ClipboardEvent('paste', {
                bubbles: true,
                cancelable: true,
                clipboardData: new DataTransfer()
            });
            pasteEvent.clipboardData.setData('text/plain', textToPaste);

            // Dispatch the event on the editor. Lexical's handler will see this
            // and replace the current selection with the pasted content/file.
            // If inserting at cursor, Perplexity's handler naturally inserts at selection.
            editorDiv.dispatchEvent(pasteEvent);
            
            // The cleanup logic is only for when a large paste is converted into a file by Perplexity.
            // If we are just pasting instructions (because the context is already in a file), we skip this.
            if (!options?.isInstruction && !options?.insertAtCursor) {
                // Wait for the upload to complete and then remove the extra file
                const waitForUploadAndCleanup = () => {
                    const checkUploadComplete = () => {
                        const uploadedFiles = document.querySelectorAll('button[data-testid="remove-uploaded-file"]');
                        if (uploadedFiles.length > 0) {
                            setTimeout(() => {
                                const currentFiles = document.querySelectorAll('button[data-testid="remove-uploaded-file"]');
                                if (currentFiles.length > 0) {
                                    const lastFile = currentFiles[currentFiles.length - 1];
                                    lastFile.click();
                                    console.log('JustCode: Removed duplicate uploaded file from Perplexity.');
                                }
                            }, 100);
                        } else {
                            setTimeout(checkUploadComplete, 100);
                        }
                    };
                    setTimeout(checkUploadComplete, 1000);
                };
                waitForUploadAndCleanup();
            }

            console.log('JustCode: Content pasted into Perplexity via simulated paste event.');

        } catch (e) {
             console.error('JustCode: Failed to simulate paste event.', e);
        }
        
        return;
    }
    console.error('JustCode Error: Could not find target editor div on Perplexity.ai.');
}