// This function is injected into the aistudio.google.com page.
export function extractAIStudioAnswer(shouldExtractFullAnswer) {
    const getLastModelResponse = () => {
        const modelResponses = document.querySelectorAll('.chat-turn-container.model');
        return modelResponses.length > 0 ? modelResponses[modelResponses.length - 1] : null;
    };

    const lastResponseElement = getLastModelResponse();
    if (!lastResponseElement) return null;

    if (shouldExtractFullAnswer) {
        // 1. Try finding the specific content container
        const content = lastResponseElement.querySelector('.turn-content');
        if (content && content.innerText.trim()) {
            return content.innerText;
        }
        
        // 2. Fallback: Try specific markdown container
        const markdown = lastResponseElement.querySelector('.markdown');
        if (markdown && markdown.innerText.trim()) {
            return markdown.innerText;
        }

        // 3. Ultimate Fallback: Get all text from the turn, cleaning up potential UI noise if possible
        // This ensures we return *something* rather than null if the selector changed.
        return lastResponseElement.innerText;
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