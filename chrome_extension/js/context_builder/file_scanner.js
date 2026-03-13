/**
 * A simple glob-to-regex matcher.
 * @param {string} str The string to test.
 * @param {string[]} patterns An array of glob patterns.
 * @returns {boolean} True if the string matches any pattern.
 */
export function isMatch(str, patterns) {
    if (!patterns || patterns.length === 0) return false;

    for (let pattern of patterns) {
        if (typeof pattern !== 'string' || !pattern) continue;
        
        if (pattern.endsWith('/')) {
            pattern += '*';
        }
        const regexPattern = '^' + pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$';
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
    const forceAll = options.forceAll === true;
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
        if (entry.name === '.git') continue; // Hard safety to prevent massive hangs
        
        const path = currentPath ? `${currentPath}/${entry.name}` : entry.name;

        if (entry.kind === 'directory') {
            if (!forceAll) {
                const pathWithSlash = path + '/';
                const isExcluded = isMatch(path, options.excludePatterns) || isMatch(pathWithSlash, options.excludePatterns);
                const isIncluded = isMatch(path, options.includePatterns) || isMatch(pathWithSlash, options.includePatterns);

                // If excluded, only dive in if there's an explicit include pattern that targets something inside
                if (isExcluded && !isIncluded) {
                    let hasIncludeInside = false;
                    for (const p of options.includePatterns) {
                        // Support standard prefixes like "folder/subfolder" overriding excluded "folder/"
                        if (p.startsWith(pathWithSlash) || p.startsWith('*' + pathWithSlash)) {
                            hasIncludeInside = true;
                            break;
                        }
                    }
                    if (!hasIncludeInside) {
                        continue;
                    }
                }
            }
            
            const subStats = await scanDirectory(entry, options, { ...internalState, currentPath: path });
            stats = stats.concat(subStats);
            
        } else if (entry.kind === 'file') {
            if (!forceAll) {
                const isExcluded = isMatch(path, options.excludePatterns);
                const isIncluded = isMatch(path, options.includePatterns) || isMatch(entry.name, options.includePatterns);

                // The file is ignored if it's excluded and NOT specifically included
                if (isExcluded && !isIncluded) {
                    continue;
                }
            }
            
            try {
                const file = await entry.getFile();
                
                // Fast path for UI tree generation (File size matches chars close enough)
                if (forceAll) {
                    stats.push({ path: path, chars: file.size, lines: Math.ceil(file.size / 35) });
                    continue;
                }

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