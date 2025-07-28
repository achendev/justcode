// This function is injected into x.com/i/grok.
// It is ONLY intended for "full answer" extraction.
export function extractGrokAnswerX(shouldExtractFullAnswer, delimiter) {
    if (!shouldExtractFullAnswer) {
        // This function is only for full answer mode.
        // The dispatcher will use the fallback for code-block-only mode.
        return null;
    }

    // --- Final "Grandparent & Markdown Reconstruction" Logic ---

    // 1. Find the wrapper of the LAST code block on the page. This is our reliable anchor.
    const allCodeBlockWrappers = document.querySelectorAll('div[data-testid="markdown-code-block"]');
    if (allCodeBlockWrappers.length === 0) {
        return null; // No code blocks means no deploy script in the answer.
    }
    const lastCodeBlockWrapper = allCodeBlockWrappers[allCodeBlockWrappers.length - 1];

    // 2. The grandparent element is the TRUE container for all content parts.
    const contentContainer = lastCodeBlockWrapper.parentElement?.parentElement;
    if (!contentContainer) {
        return null; // Failed to find the container.
    }

    const parts = [];
    // 3. Iterate through all children of this correct container.
    for (const child of contentContainer.children) {
        // 4. Check if this child is a code block container or a simple text span.
        const codeBlock = child.querySelector('div[data-testid="markdown-code-block"]');

        if (codeBlock) {
            // It's a code block. We must reconstruct the markdown to preserve the fences.
            
            // Use a stable, structural selector to find the language identifier, avoiding dynamic class names.
            // This selects the first div (the header) inside the code block, then the first span inside that header.
            const langSpan = codeBlock.querySelector('div:first-child > span');
            const language = langSpan ? langSpan.innerText.trim() : '';
            
            const pre = codeBlock.querySelector('pre');
            const codeContent = pre ? pre.innerText : '';
            
            // Manually rebuild the markdown code fence using the delimiter passed from the profile settings.
            parts.push(`${delimiter}${language}\n${codeContent}\n${delimiter}`);
        } else {
            // It's a simple text span. .innerText is safe here.
            const text = child.innerText;
            if (text && text.trim()) {
                parts.push(text);
            }
        }
    }
    
    // 5. Join all reconstructed parts. Double newline creates the correct spacing between blocks.
    if (parts.length > 0) {
        return parts.join('\n\n');
    }

    return null;
}