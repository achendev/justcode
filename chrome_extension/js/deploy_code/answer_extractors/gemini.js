// This function is injected into the gemini.google.com page.
export function extractGeminiAnswer(shouldExtractFullAnswer, delimiter = '```') {
    const getModelResponses = () => document.querySelectorAll('model-response');
    const modelResponses = getModelResponses();
    const lastResponseElement = modelResponses.length > 0 ? modelResponses[modelResponses.length - 1] : document.body;

    if (shouldExtractFullAnswer) {
        // This is the container for the entire rendered markdown content.
        const contentContainer = lastResponseElement.querySelector('.markdown.markdown-main-panel');
        if (!contentContainer) return null;

        const parts = [];
        // Iterate through all direct children of the container.
        for (const child of contentContainer.children) {
            // Check for a code block within the child element.
            const codeBlock = child.querySelector('pre code');
            
            if (codeBlock) {
                // It's a code block. Reconstruct the markdown fence.
                const langSpan = child.querySelector('.code-block-decoration span');
                const language = langSpan ? langSpan.innerText.trim().toLowerCase() : '';
                
                const codeContent = codeBlock.innerText;
                
                // Only add the language if it exists.
                const langPart = language ? `${language}\n` : '';
                parts.push(`${delimiter}${langPart}${codeContent}\n${delimiter}`);
            } else {
                // It's a regular text element, like a <p>. .innerText is safe.
                if (child.innerText && child.innerText.trim()) {
                    parts.push(child.innerText);
                }
            }
        }
        // Join with double newlines to simulate paragraphs between elements.
        return parts.length > 0 ? parts.join('\n\n') : null;
    }

    // Default to finding the last code block within the last model response
    const codeBlocks = Array.from(lastResponseElement.querySelectorAll('pre code'));
    if (codeBlocks.length > 0) return codeBlocks[codeBlocks.length - 1].innerText;
    
    const pres = Array.from(lastResponseElement.querySelectorAll('pre'));
    if (pres.length > 0) return pres[pres.length - 1].innerText;

    const allCode = Array.from(lastResponseElement.querySelectorAll('code'));
    if (allCode.length > 0) return allCode[allCode.length - 1].innerText;

    return null;
}