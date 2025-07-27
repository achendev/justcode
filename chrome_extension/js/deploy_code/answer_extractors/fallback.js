// This function is injected into any page as a fallback.
// It ignores shouldExtractFullAnswer as it can only find code blocks.
export function extractFallbackAnswer(shouldExtractFullAnswer) {
    const codeBlocks = Array.from(document.querySelectorAll('pre code'));
    if (codeBlocks.length > 0) return codeBlocks[codeBlocks.length - 1].innerText;
    
    const pres = Array.from(document.querySelectorAll('pre'));
    if (pres.length > 0) return pres[pres.length - 1].innerText;

    const allCode = Array.from(document.querySelectorAll('code'));
    if (allCode.length > 0) return allCode[allCode.length - 1].innerText;

    return null;
}