/**
 * A simple glob-to-regex matcher.
 * @param {string} str The string to test.
 * @param {string[]} patterns An array of glob patterns.
 * @returns {boolean} True if the string matches any pattern.
 */
function isMatch(str, patterns) {
    if (!patterns || patterns.length === 0) return false;

    for (const pattern of patterns) {
        if (typeof pattern !== 'string' || !pattern) continue;
        const regexPattern = '^' + pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
        const regex = new RegExp(regexPattern);
        if (regex.test(str)) {
            return true;
        }
    }
    return false;
}

/**
 * Recursively walks a directory, returning stats for all valid files.
 * @param {FileSystemDirectoryHandle} directoryHandle
 * @param {object} options - Contains includePatterns and excludePatterns.
 * @param {object} [internalState={}] - Used for recursion.
 * @returns {Promise<Array<{path: string, chars: number, lines: number}>>}
 */
export async function scanDirectory(directoryHandle, options, internalState = {}) {
    const currentPath = internalState.currentPath || '';
    let stats = [];

    const entries = [];
    for await (const entry of directoryHandle.values()) {
        entries.push(entry);
    }
    entries.sort((a, b) => {
        if (a.kind === b.kind) return a.name.localeCompare(b.name);
        return a.kind === 'directory' ? -1 : 1;
    });

    for (const entry of entries) {
        const path = currentPath ? `${currentPath}/${entry.name}` : entry.name;
        
        if (isMatch(path, options.excludePatterns)) {
            continue;
        }

        if (entry.kind === 'directory') {
            const subStats = await scanDirectory(entry, options, { ...internalState, currentPath: path });
            stats = stats.concat(subStats);
        } else if (entry.kind === 'file') {
             if (options.includePatterns.length > 0) {
                if (!isMatch(entry.name, options.includePatterns)) {
                    continue;
                }
             }
            try {
                const file = await entry.getFile();
                const content = await file.text();
                if (content.includes('\u0000')) continue; // Skip binary files

                stats.push({
                    path: path,
                    chars: content.length,
                    lines: content.split('\n').length
                });
            } catch (e) {
                console.warn(`Could not read file for stats: ${path}`, e);
            }
        }
    }
    return stats;
}