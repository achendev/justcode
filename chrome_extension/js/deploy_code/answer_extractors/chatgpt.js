// This function is injected into the ChatGPT page.
export function extractChatGPTAnswer(shouldExtractFullAnswer) {
    const getLastAssistantTurn = () => {
        const turns = document.querySelectorAll('[data-message-author-role="assistant"]');
        return turns.length > 0 ? turns[turns.length - 1] : document.body;
    };

    const lastTurnElement = getLastAssistantTurn();

    if (shouldExtractFullAnswer) {
        const content = lastTurnElement.querySelector('.markdown');
        return content ? content.innerText : lastTurnElement.innerText;
    }

    // Default to finding the last code block within the last assistant message
    const codeBlocks = Array.from(lastTurnElement.querySelectorAll('pre code'));
    if (codeBlocks.length > 0) return codeBlocks[codeBlocks.length - 1].innerText;
    
    const pres = Array.from(lastTurnElement.querySelectorAll('pre'));
    if (pres.length > 0) return pres[pres.length - 1].innerText;

    const allCode = Array.from(lastTurnElement.querySelectorAll('code'));
    if (allCode.length > 0) return allCode[allCode.length - 1].innerText;

    return null;
}