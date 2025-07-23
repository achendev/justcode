/**
 * Creates a visual tree structure from a list of file paths.
 * @param {string[]} paths Array of file paths.
 * @returns {string} A string representing the file tree.
 */
export function buildTree(paths) {
    const tree = {};
    paths.forEach(path => {
        let currentLevel = tree;
        path.split('/').forEach(part => {
            if (!currentLevel[part]) {
                currentLevel[part] = {};
            }
            currentLevel = currentLevel[part];
        });
    });

    function generateLines(node, prefix = '') {
        let lines = [];
        const entries = Object.keys(node).sort((a, b) => {
            const aIsDir = Object.keys(node[a] || {}).length > 0;
            const bIsDir = Object.keys(node[b] || {}).length > 0;
            if (aIsDir === bIsDir) return a.localeCompare(b);
            return aIsDir ? -1 : 1;
        });

        entries.forEach((entry, index) => {
            const isLast = index === entries.length - 1;
            const connector = isLast ? '└── ' : '├── ';
            const isDirectory = Object.keys(node[entry] || {}).length > 0;
            lines.push(prefix + connector + entry + (isDirectory ? '/' : ''));
            if (isDirectory) {
                const newPrefix = prefix + (isLast ? '    ' : '│   ');
                lines = lines.concat(generateLines(node[entry], newPrefix));
            }
        });
        return lines;
    }
    return '.\n' + generateLines(tree).join('\n');
}


/**
 * Builds a visual tree structure with character/line counts from file stats.
 * @param {Array<{path: string, chars: number, lines: number}>} fileStats
 * @returns {{treeString: string, totalChars: number}}
 */
export function buildTreeWithCounts(fileStats) {
    const fileStatsMap = new Map(fileStats.map(f => [f.path, { chars: f.chars, lines: f.lines }]));
    const totalStats = fileStats.reduce((acc, f) => {
        acc.chars += f.chars;
        acc.lines += f.lines;
        return acc;
    }, { chars: 0, lines: 0 });

    const tree = {};
    const dirStats = new Map();

    for (const fileStat of fileStats) {
        const parts = fileStat.path.split('/');
        let currentPath = '';
        for (let i = 0; i < parts.length - 1; i++) {
            currentPath = currentPath ? `${currentPath}/${parts[i]}` : parts[i];
            const stats = dirStats.get(currentPath) || { chars: 0, lines: 0 };
            stats.chars += fileStat.chars;
            stats.lines += fileStat.lines;
            dirStats.set(currentPath, stats);
        }
    }

    fileStats.forEach(f => {
        const parts = f.path.split('/');
        let currentLevel = tree;
        parts.forEach((part, index) => {
            if (index === parts.length - 1) {
                currentLevel[part] = null;
            } else {
                if (!currentLevel[part]) currentLevel[part] = {};
                currentLevel = currentLevel[part];
            }
        });
    });

    function formatStats(chars, lines) {
        return `(${chars.toLocaleString()} chars, ${lines.toLocaleString()} lines)`;
    }

    const treeLines = [`. ${formatStats(totalStats.chars, totalStats.lines)}`];

    function generateLines(node, currentPath = '', prefix = '') {
        const entries = Object.keys(node).sort((a, b) => {
            const aIsDir = node[a] !== null;
            const bIsDir = node[b] !== null;
            if (aIsDir === bIsDir) return a.localeCompare(b);
            return aIsDir ? -1 : 1;
        });

        entries.forEach((entry, index) => {
            const isLast = index === entries.length - 1;
            const connector = isLast ? '└── ' : '├── ';
            const isDirectory = node[entry] !== null;
            const newPath = currentPath ? `${currentPath}/${entry}` : entry;

            let statsStr = '';
            if (isDirectory) {
                const stats = dirStats.get(newPath) || { chars: 0, lines: 0 };
                statsStr = formatStats(stats.chars, stats.lines);
                treeLines.push(`${prefix}${connector}${entry}/ ${statsStr}`);
                const newPrefix = prefix + (isLast ? '    ' : '│   ');
                generateLines(node[entry], newPath, newPrefix);
            } else {
                const stats = fileStatsMap.get(newPath) || { chars: 0, lines: 0 };
                statsStr = formatStats(stats.chars, stats.lines);
                treeLines.push(`${prefix}${connector}${entry} ${statsStr}`);
            }
        });
    }

    generateLines(tree);
    return { treeString: treeLines.join('\n'), totalChars: totalStats.chars };
}