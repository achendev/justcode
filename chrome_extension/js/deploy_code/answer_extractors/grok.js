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
        const fullContent = lastMessage.querySelector('.response-content-markdown');
        if (!fullContent) {
            return null;
        }
        const extractedParts = [];
        for (const child of fullContent.children) {
            const codeBlock = child.querySelector('code[style*="white-space: pre"]');
            if (codeBlock) {
                if (codeBlock.children.length > 0) {
                    extractedParts.push(Array.from(codeBlock.children).map(line => line.textContent).join('\n'));
                } else {
                    extractedParts.push(codeBlock.innerText);
                }
            } else {
                if (child.innerText && child.innerText.trim()) {
                    extractedParts.push(child.innerText);
                }
            }
        }
        return extractedParts.join('\n');
    }

    // Default to finding only the code block within the last message.
    const codeBlocks = lastMessage.querySelectorAll('code[style*="white-space: pre"]');
    if (codeBlocks.length > 0) {
        const codeBlock = codeBlocks[codeBlocks.length - 1];
        if (codeBlock.children.length > 0) {
            return Array.from(codeBlock.children).map(child => child.textContent).join('\n');
        }
        return codeBlock.innerText;
    }
    const pres = lastMessage.querySelectorAll('pre');
    if (pres.length > 0) {
        return pres[pres.length - 1].innerText;
    }
    return null;
}