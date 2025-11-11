/**
 * Splits the content string into chunks based on size, respecting 'cat' blocks and splitting trailing content by line.
 * @param {string} contentString The string containing all 'cat' commands and other context.
 * @param {number} splitSizeKb The target size for each chunk in kilobytes.
 * @returns {string[]} An array of content chunks.
 */
export function splitContextPayload(contentString, splitSizeKb) {
    const splitSizeBytes = splitSizeKb * 1024;
    const overhead = 20 * 1024; // Increased overhead for safety with tree, headers, etc.
    const effectiveSplitSize = splitSizeBytes - overhead > 0 ? splitSizeBytes - overhead : 1024;

    const allChunks = [];
    let currentChunk = '';

    const fileBlocks = contentString.match(/cat > .*? << 'EOPROJECTFILE'[\\s\\S]*?EOPROJECTFILE\\n\\n/g) || [];
    let trailingContent = '';
    if (fileBlocks.length > 0) {
        const lastBlock = fileBlocks[fileBlocks.length - 1];
        const lastBlockIndex = contentString.lastIndexOf(lastBlock);
        trailingContent = contentString.substring(lastBlockIndex + lastBlock.length);
    } else {
        trailingContent = contentString;
    }

    for (const block of fileBlocks) {
        if (currentChunk && new Blob([currentChunk + block]).size > effectiveSplitSize) {
            allChunks.push(currentChunk);
            currentChunk = block;
        } else {
            currentChunk += block;
        }
    }

    if (trailingContent) {
        const trailingLines = trailingContent.split('\\n');
        for (const line of trailingLines) {
            const lineWithNewline = line + '\\n';
            if (currentChunk && new Blob([currentChunk + lineWithNewline]).size > effectiveSplitSize) {
                allChunks.push(currentChunk);
                currentChunk = lineWithNewline;
            } else {
                currentChunk += lineWithNewline;
            }
        }
    }

    if (currentChunk) {
        allChunks.push(currentChunk);
    }
    
    if (allChunks.length === 0 && contentString) {
        allChunks.push(contentString);
    }

    return allChunks;
}