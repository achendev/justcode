// This function is injected into grok.com.
export function extractGrokAnswer(shouldExtractFullAnswer) {
    // Find all message bubbles on the page.
    const messageBubbles = document.querySelectorAll('.message-bubble');
    if (messageBubbles.length === 0) {
        return null;
    }

    // The last message bubble is the one we want.
    const lastMessage = messageBubbles[messageBubbles.length - 1];

    if (shouldExtractFullAnswer) {
        // The .response-content-markdown contains the entire rendered output.
        const fullContent = lastMessage.querySelector('.response-content-markdown');
        return fullContent ? fullContent.innerText : null;
    }

    // Default to finding only the code block within the last message.
    // Find all code blocks within the last message and return the last one.
    const codeBlocks = lastMessage.querySelectorAll('code[style*="white-space: pre"]');
    if (codeBlocks.length > 0) {
        return codeBlocks[codeBlocks.length - 1].innerText;
    }

    // Fallback for just a pre tag if the styled code element isn't found.
    const pres = lastMessage.querySelectorAll('pre');
    if (pres.length > 0) {
        return pres[pres.length - 1].innerText;
    }

    return null;
}