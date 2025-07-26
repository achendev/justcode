/**
 * This function is designed to be injected into the page to handle file uploads.
 * It creates a file in memory and simulates a user action to upload it.
 * @param {string} filename The name for the file.
 * @param {string} content The text content of the file.
 */
export function pasteAsFile(filename, content) {
    const file = new File([content], filename, { type: 'text/plain' });
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);

    // Strategy 1: Find a hidden file input and trigger it (works for Gemini, some versions of ChatGPT).
    // The input is often visually hidden but programmatically accessible.
    const fileInput = document.querySelector('input[type="file"]');
    if (fileInput) {
        try {
            // Some inputs are picky about being cleared first.
            fileInput.value = '';
            fileInput.files = dataTransfer.files;
            fileInput.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
            console.log('JustCode: Uploaded file via direct input assignment.');
            return;
        } catch (e) {
            console.warn('JustCode: Direct file input assignment failed, trying next method.', e);
        }
    }

    // Strategy 2: Simulate a paste event (works for Perplexity, sometimes ChatGPT).
    const targetElement = document.querySelector('textarea, [contenteditable="true"], [role="textbox"]');
    if (targetElement) {
        targetElement.focus();
        try {
            // Perplexity's special case: clear old files before pasting a new one.
            if (window.location.hostname.includes('perplexity.ai')) {
                document.querySelectorAll('button[data-testid="remove-uploaded-file"]').forEach(button => button.click());
            }

            const pasteEvent = new ClipboardEvent('paste', {
                bubbles: true,
                cancelable: true,
                clipboardData: dataTransfer
            });
            targetElement.dispatchEvent(pasteEvent);
            console.log('JustCode: Attempted to upload file via simulated paste event.');
            return;
        } catch (e) {
            console.error('JustCode: Failed to simulate paste event.', e);
        }
    }

    console.error('JustCode Error: Could not find a suitable method (input or paste target) to upload the context file.');
}