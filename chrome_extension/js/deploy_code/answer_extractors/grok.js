// This function is injected into grok.com.
export function extractGrokAnswer(shouldExtractFullAnswer, delimiter = '```') {
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
            const codeElement = child.querySelector('code[style*="white-space: pre"]');
            
            if (codeElement) {
                // This 'child' element contains a code block.
                // Try to find the language identifier, assuming it's in a span within the child, but not inside the code element itself.
                const langSpans = Array.from(child.querySelectorAll('span'));
                const headerSpans = langSpans.filter(span => !codeElement.contains(span));
                const language = headerSpans.length > 0 ? headerSpans[0].innerText.trim().toLowerCase() : '';
                
                let codeContent;
                if (codeElement.children.length > 0) {
                    codeContent = Array.from(codeElement.children).map(line => line.textContent).join('\n');
                } else {
                    codeContent = codeElement.innerText;
                }

                // Reconstruct the markdown fence.
                const langPart = language ? `${language}\n` : '';
                extractedParts.push(`${delimiter}${langPart}${codeContent}\n${delimiter}`);
            } else {
                // This is a regular text element, like a <p>.
                if (child.innerText && child.innerText.trim()) {
                    extractedParts.push(child.innerText);
                }
            }
        }
        // Join with double newlines to simulate paragraphs between elements.
        return extractedParts.length > 0 ? extractedParts.join('\n\n') : null;
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