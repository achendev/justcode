/**
 * Escapes special characters for regex.
 */
function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Parses the rules string from the textarea into a structured array.
 */
function parseRules(rulesString) {
    if (!rulesString) return [];
    return rulesString
        .split('\n')
        .map(line => line.trim())
        .filter(line => line && line.includes('|'))
        .map(line => {
            const parts = line.split('|');
            return {
                local: parts[0].trim(),
                placeholder: parts.slice(1).join('|').trim()
            };
        })
        .filter(rule => rule.local && rule.placeholder);
}

/**
 * Transfers casing from the matched string to the target string.
 */
function transferCasing(match, target) {
    if (match === match.toUpperCase() && match !== match.toLowerCase()) {
        return target.toUpperCase();
    }
    let result = '';
    for (let i = 0; i < target.length; i++) {
        const char = target[i];
        if (i < match.length) {
            const matchChar = match[i];
            if (matchChar === matchChar.toUpperCase() && matchChar !== matchChar.toLowerCase()) {
                result += char.toUpperCase();
            } else {
                result += char.toLowerCase();
            }
        } else {
            result += char;
        }
    }
    return result;
}

export function applyOneWayReplacements(text, rulesInput) {
    let rules = [];
    if (typeof rulesInput === 'string') {
        rules = parseRules(rulesInput);
    } else if (Array.isArray(rulesInput)) {
        rules = rulesInput;
    }
    if (rules.length === 0) return text;

    let processedText = text;
    const sortedRules = [...rules].sort((a, b) => b.local.length - a.local.length);

    for (const rule of sortedRules) {
        const from = rule.local;
        const to = rule.placeholder;
        const isStrictRule = (from !== from.toLowerCase()) || (to !== to.toLowerCase());

        if (isStrictRule) {
            const regex = new RegExp(escapeRegExp(from), 'g');
            processedText = processedText.replace(regex, to);
        } else {
            const regex = new RegExp(escapeRegExp(from), 'gi');
            processedText = processedText.replace(regex, (match) => {
                return transferCasing(match, to);
            });
        }
    }
    return processedText;
}

export function applyReplacements(text, rulesInput, direction) {
    let rules = [];
    if (typeof rulesInput === 'string') {
        rules = parseRules(rulesInput);
    } else if (Array.isArray(rulesInput)) {
        rules = rulesInput;
    }
    if (rules.length === 0) return text;

    let processedText = text;
    const sortedRules = [...rules].sort((a, b) => {
        const fromA = direction === 'outgoing' ? a.local : a.placeholder;
        const fromB = direction === 'outgoing' ? b.local : b.placeholder;
        return fromB.length - fromA.length;
    });

    for (const rule of sortedRules) {
        const from = direction === 'outgoing' ? rule.local : rule.placeholder;
        const to = direction === 'outgoing' ? rule.placeholder : rule.local;
        
        const isStrictRule = (rule.local !== rule.local.toLowerCase()) || 
                             (rule.placeholder !== rule.placeholder.toLowerCase());

        if (isStrictRule) {
            const regex = new RegExp(escapeRegExp(from), 'g');
            processedText = processedText.replace(regex, to);
        } else {
            const regex = new RegExp(escapeRegExp(from), 'gi');
            processedText = processedText.replace(regex, (match) => {
                return transferCasing(match, to);
            });
        }
    }
    return processedText;
}

/**
 * Dynamically builds Two-Way Sync rules to alias project directories in the output tree and headers.
 * Returns an array of objects to bypass string-parsing trim() logic, preserving crucial spacing.
 */
export function getProjectAliasRules(profile, isJsMode) {
    const paths = isJsMode ? profile.jsProjectFolderNames : profile.projectPaths;
    const aliases = isJsMode ? profile.jsProjectAliases : profile.projectAliases;

    if (!paths || paths.length <= 1) return null;
    if (!aliases || aliases.length === 0) return null;

    let rules = [];
    for (let i = 0; i < paths.length; i++) {
        const pathStr = paths[i];
        if (!pathStr) continue;

        let originalPrefix;
        if (profile.useNumericPrefixesForMultiProject) {
            originalPrefix = String(i);
        } else {
            if (isJsMode) {
                originalPrefix = pathStr;
            } else {
                const cleanPath = pathStr.replace(/[/\\]$/, '');
                const parts = cleanPath.split(/[/\\]/);
                originalPrefix = parts[parts.length - 1];
            }
        }

        const alias = aliases[i];
        if (alias && typeof alias === 'string') {
            const cleanAlias = alias.replace(/[/\\]$/, '').trim();
            if (cleanAlias !== '' && cleanAlias !== originalPrefix) {
                rules.push({ local: `├── ${originalPrefix}/`, placeholder: `├── ${cleanAlias}/` });
                rules.push({ local: `└── ${originalPrefix}/`, placeholder: `└── ${cleanAlias}/` });
                rules.push({ local: `./${originalPrefix} `, placeholder: `./${cleanAlias} ` });
                rules.push({ local: `./${originalPrefix}/`, placeholder: `./${cleanAlias}/` });
                rules.push({ local: ` ${originalPrefix}/`, placeholder: ` ${cleanAlias}/` });
                rules.push({ local: `'${originalPrefix}/`, placeholder: `'${cleanAlias}/` });
                rules.push({ local: `"${originalPrefix}/`, placeholder: `"${cleanAlias}/` });
                rules.push({ local: `\n${originalPrefix}/`, placeholder: `\n${cleanAlias}/` });
                rules.push({ local: `>${originalPrefix}/`, placeholder: `>${cleanAlias}/` });
                rules.push({ local: `> ${originalPrefix}/`, placeholder: `> ${cleanAlias}/` });
            }
        }
    }
    return rules.length > 0 ? rules : null;
}

/**
 * Translates Exclude/Include patterns from aliased names back to the real filesystem prefixes.
 */
export function translatePatternsToOriginal(patternsStr, profile, isJsMode) {
    if (!patternsStr) return '';
    const paths = isJsMode ? profile.jsProjectFolderNames : profile.projectPaths;
    const aliases = isJsMode ? profile.jsProjectAliases : profile.projectAliases;

    if (!paths || paths.length <= 1 || !aliases || aliases.length === 0) return patternsStr;

    const aliasToOriginal = {};
    for (let i = 0; i < paths.length; i++) {
        const alias = aliases[i];
        if (!alias || typeof alias !== 'string') continue;
        
        const cleanAlias = alias.replace(/[/\\]$/, '').trim();
        if (cleanAlias === '') continue;

        let originalPrefix;
        if (profile.useNumericPrefixesForMultiProject) {
            originalPrefix = String(i);
        } else {
            if (isJsMode) {
                originalPrefix = paths[i];
            } else {
                const cleanPath = paths[i].replace(/[/\\]$/, '');
                const parts = cleanPath.split(/[/\\]/);
                originalPrefix = parts[parts.length - 1];
            }
        }
        aliasToOriginal[cleanAlias] = originalPrefix;
    }

    return patternsStr.split(',').map(p => {
        let modified = p;
        for (const [alias, original] of Object.entries(aliasToOriginal)) {
            const regex = new RegExp(`(^|\\*)\\s*${escapeRegExp(alias)}(/|$)`, 'g');
            modified = modified.replace(regex, `$1${original}$2`);
        }
        return modified;
    }).join(',');
}