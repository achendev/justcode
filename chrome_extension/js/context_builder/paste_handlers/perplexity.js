/**
 * Handles pasting text into Perplexity.ai's input field.
 * This function is designed to be injected into the page.
 * @param {string} textToPaste The text to paste.
 */
export function pastePerplexity(textToPaste) {
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
}