// This function is injected into the Gemini/AI Studio page.
export function extractGeminiAnswer(shouldExtractFullAnswer) {
    const getLastModelResponse = () => {
        const modelResponses = document.querySelectorAll('.chat-turn-container.model');
        return modelResponses.length > 0 ? modelResponses[modelResponses.length - 1] : document.body;
    };

    const lastResponseElement = getLastModelResponse();

    if (shouldExtractFullAnswer) {
        const content = lastResponseElement.querySelector('.turn-content');
        return content ? content.innerText : null;
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