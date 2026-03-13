import { isMatch, scanDirectory } from '../context_builder/file_scanner.js';
import { loadData, saveData } from '../storage.js';
import { getHandles, verifyPermission } from '../file_system_manager.js';
import { expandWindow } from '../popup/view.js';

let currentProfileId = null;
let currentContextSizeLimit = 3000000;
let isInitialized = false;

// Token calculation heuristics
// Gemini's tokenizer is highly efficient, averaging ~3.74 characters per token for typical codebases.
const CHARS_PER_TOKEN = 3.74; 
const FILE_WRAPPER_OVERHEAD = 50; // cat > file << EOF\n\n
const PROMPT_BASE_OVERHEAD = 1500; // Base instructions block size

function buildTreeData(stats) {
    const root = { name: '.', path: '', isDir: true, chars: 0, lines: 0, children: {} };
    for (const stat of stats) {
        const parts = stat.path.split('/');
        let current = root;
        current.chars += stat.chars;
        current.lines += stat.lines;

        let pathSoFar = '';
        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            const isFile = i === parts.length - 1;
            pathSoFar = pathSoFar ? `${pathSoFar}/${part}` : part;

            if (!current.children[part]) {
                current.children[part] = {
                    name: part, path: pathSoFar, isDir: !isFile, chars: 0, lines: 0, children: {}
                };
            }
            current = current.children[part];
            current.chars += stat.chars;
            current.lines += stat.lines;
        }
    }
    return root;
}

function renderTreeNode(node, depth = 0) {
    const childrenKeys = Object.keys(node.children);
    childrenKeys.sort((a, b) => {
        const childA = node.children[a];
        const childB = node.children[b];
        if (childA.isDir !== childB.isDir) return childA.isDir ? -1 : 1;
        return childB.chars - childA.chars;
    });

    const tokens = Math.ceil(node.chars / CHARS_PER_TOKEN);

    let html = '';
    if (depth !== 0) {
        const padding = (depth - 1) * 15;
        const chevronVisibility = node.isDir && childrenKeys.length > 0 ? 'visible' : 'hidden';
        html += `
        <div class="tree-item" data-path="${node.path}" data-chars="${node.chars}" data-lines="${node.lines}" style="padding-left: ${padding}px;">
            <i class="bi bi-chevron-right toggle-collapse" style="cursor: pointer; width: 16px; display: inline-block; text-align: center; visibility: ${chevronVisibility};"></i>
            <input type="checkbox" class="form-check-input node-check m-0 me-2" data-path="${node.path}" data-isdir="${node.isDir}">
            <span class="fw-bold me-2">${node.name}${node.isDir ? '/' : ''}</span>
            <span class="text-muted" style="font-size: 0.75rem;">(~${tokens.toLocaleString()} t, ${node.chars.toLocaleString()} c, ${node.lines.toLocaleString()} l)</span>
        </div>
        <div class="tree-children" style="display: none;">`;
    } else {
        html += `<div class="tree-children" style="display: block;">
        <div class="tree-item" style="padding-left: 0px; cursor: default;">
            <i class="bi bi-folder2-open" style="width: 16px; display: inline-block; text-align: center;"></i>
            <span class="fw-bold ms-2 me-2">.</span>
            <span class="text-muted" style="font-size: 0.75rem;">(~${tokens.toLocaleString()} t, ${node.chars.toLocaleString()} c, ${node.lines.toLocaleString()} l)</span>
        </div>`;
    }

    for (const key of childrenKeys) html += renderTreeNode(node.children[key], depth + 1);
    html += `</div>`;
    return html;
}

export function evaluateTreeUI(excludeStr, includeStr) {
    const excludes = excludeStr.split(',').map(s=>s.trim()).filter(Boolean);
    const includes = includeStr.split(',').map(s=>s.trim()).filter(Boolean);

    let totalChars = 0;
    let totalLines = 0;
    let fileCount = 0;

    document.querySelectorAll('#cmTreeContainer .tree-item[data-path]').forEach(item => {
        const path = item.dataset.path;
        const checkbox = item.querySelector('.node-check');
        const isDir = checkbox.dataset.isdir === 'true';
        const chars = parseInt(item.dataset.chars, 10) || 0;
        const lines = parseInt(item.dataset.lines, 10) || 0;
        
        const pathWithSlash = isDir ? path + '/' : path;
        const isExcluded = isMatch(path, excludes) || (isDir && isMatch(pathWithSlash, excludes));
        let isIncluded = isMatch(path, includes) || (isDir && isMatch(pathWithSlash, includes));
        
        if (!isDir && !isIncluded) isIncluded = isMatch(path.split('/').pop(), includes);

        if (isExcluded && !isIncluded) {
            checkbox.checked = false;
            item.classList.add('excluded');
        } else {
            checkbox.checked = true;
            item.classList.remove('excluded');
            if (!isDir) {
                totalChars += chars;
                totalLines += lines;
                fileCount += 1;
            }
        }
    });

    const statsEl = document.getElementById('cmTotalStats');
    if (statsEl) {
        // Calculate estimated tokens incorporating heredoc and base prompt overhead
        const estimatedPromptChars = totalChars + (fileCount * FILE_WRAPPER_OVERHEAD) + PROMPT_BASE_OVERHEAD;
        const totalTokens = Math.ceil(estimatedPromptChars / CHARS_PER_TOKEN);
        
        statsEl.textContent = `Context: ~${totalTokens.toLocaleString()} t, ${totalChars.toLocaleString()} c, ${totalLines.toLocaleString()} l`;
        statsEl.style.display = 'inline-block';
        if (totalChars > currentContextSizeLimit) {
            statsEl.classList.remove('bg-secondary');
            statsEl.classList.add('bg-danger');
            statsEl.title = `Exceeds limit of ${currentContextSizeLimit.toLocaleString()} chars`;
        } else {
            statsEl.classList.remove('bg-danger');
            statsEl.classList.add('bg-secondary');
            statsEl.title = `Total context size (t = estimated tokens)`;
        }
    }
}

function initListeners() {
    if (isInitialized) return;
    isInitialized = true;

    const exInput = document.getElementById('cmExcludeInput');
    const inInput = document.getElementById('cmIncludeInput');

    const updateProfileInputs = () => {
        const mainEx = document.getElementById(`excludePatterns-${currentProfileId}`);
        const mainIn = document.getElementById(`includePatterns-${currentProfileId}`);
        if (mainEx) { mainEx.value = exInput.value; mainEx.dispatchEvent(new Event('change')); }
        if (mainIn) { mainIn.value = inInput.value; mainIn.dispatchEvent(new Event('change')); }
        evaluateTreeUI(exInput.value, inInput.value);
    };

    exInput.addEventListener('input', updateProfileInputs);
    inInput.addEventListener('input', updateProfileInputs);

    document.getElementById('cmTreeContainer').addEventListener('click', (e) => {
        if (e.target.classList.contains('toggle-collapse')) {
            const childrenDiv = e.target.closest('.tree-item').nextElementSibling;
            if (childrenDiv && childrenDiv.classList.contains('tree-children')) {
                const isHidden = childrenDiv.style.display === 'none';
                childrenDiv.style.display = isHidden ? 'block' : 'none';
                e.target.classList.replace(isHidden ? 'bi-chevron-right' : 'bi-chevron-down', isHidden ? 'bi-chevron-down' : 'bi-chevron-right');
            }
        }
    });

    document.getElementById('cmTreeContainer').addEventListener('change', (e) => {
        if (e.target.classList.contains('node-check')) {
            const isDir = e.target.dataset.isdir === 'true';
            const pathNoSlash = e.target.dataset.path;
            const pathToCheck = isDir ? `${pathNoSlash}/` : pathNoSlash;
            
            let excludes = exInput.value.split(',').map(s=>s.trim()).filter(Boolean);
            let includes = inInput.value.split(',').map(s=>s.trim()).filter(Boolean);

            if (!e.target.checked) {
                // User wants to EXCLUDE
                includes = includes.filter(p => p !== pathToCheck && p !== pathNoSlash);
                
                const inherentlyIncluded = isMatch(pathNoSlash, includes) || (isDir && isMatch(pathToCheck, includes));
                const inherentlyExcluded = isMatch(pathNoSlash, excludes) || (isDir && isMatch(pathToCheck, excludes));
                
                // Only add to exclude if it's not forced to be included by a parent, 
                // and not already excluded by a parent (prevents redundant entries)
                if (!inherentlyIncluded && !inherentlyExcluded) {
                    excludes.push(pathToCheck);
                }
            } else {
                // User wants to INCLUDE
                excludes = excludes.filter(p => p !== pathToCheck && p !== pathNoSlash);
                
                const inherentlyExcluded = isMatch(pathNoSlash, excludes) || (isDir && isMatch(pathToCheck, excludes));
                const inherentlyIncluded = isMatch(pathNoSlash, includes) || (isDir && isMatch(pathToCheck, includes));

                // Only add to include if a parent is actively excluding it,
                // and it's not already covered by another include rule
                if (inherentlyExcluded && !inherentlyIncluded) {
                    includes.push(pathToCheck);
                }
            }
            
            exInput.value = [...new Set(excludes)].join(',');
            inInput.value = [...new Set(includes)].join(',');
            updateProfileInputs();
        }
    });

    document.getElementById('cmRefresh').addEventListener('click', () => {
        loadData(profiles => {
            const profile = profiles.find(p => p.id === currentProfileId);
            if (profile) loadTree(profile);
        });
    });
}

async function fetchStatsServer(profile) {
    const paths = profile.projectPaths;
    if (!paths || !paths.some(p => p && p.trim())) throw new Error("Project path is required.");
    
    const serverUrl = profile.serverUrl.endsWith('/') ? profile.serverUrl.slice(0, -1) : profile.serverUrl;
    const pathParams = paths.map(p => `path=${encodeURIComponent(p)}`).join('&');
    let endpoint = `${serverUrl}/getcontext?${pathParams}&action=get_all_file_stats`;
    if (profile.useNumericPrefixesForMultiProject) endpoint += `&useNumericPrefixes=true`;

    const headers = {};
    if (profile.isAuthEnabled && profile.username) headers['Authorization'] = 'Basic ' + btoa(`${profile.username}:${profile.password}`);

    const response = await fetch(endpoint, { headers });
    if (!response.ok) throw new Error(await response.text());
    return await response.json();
}

async function fetchStatsJS(profile) {
    const folderCount = (profile.jsProjectFolderNames || []).length || 1;
    const handles = await getHandles(profile.id, folderCount);
    const verified = [];
    for (const h of handles) if (h && await verifyPermission(h)) verified.push(h);
    if (verified.length === 0) throw new Error("Please grant folder permissions first.");

    const scanResults = await Promise.all(verified.map(h => scanDirectory(h, { forceAll: true })));
    return scanResults.flatMap((stats, idx) => {
        if (verified.length <= 1) return stats;
        const prefix = profile.useNumericPrefixesForMultiProject ? idx : verified[idx].name;
        return stats.map(s => ({ ...s, path: `${prefix}/${s.path}` }));
    });
}

async function loadTree(profile) {
    document.getElementById('cmLoading').style.display = 'block';
    document.getElementById('cmTreeContainer').style.display = 'none';
    document.getElementById('cmTreeContainer').innerHTML = '';

    try {
        const stats = profile.useServerBackend ? await fetchStatsServer(profile) : await fetchStatsJS(profile);
        const rootNode = buildTreeData(stats);
        document.getElementById('cmTreeContainer').innerHTML = renderTreeNode(rootNode);
        evaluateTreeUI(profile.excludePatterns || '', profile.includePatterns || '');
    } catch (e) {
        document.getElementById('cmTreeContainer').innerHTML = `<div class="text-danger p-2">Error: ${e.message}</div>`;
    } finally {
        document.getElementById('cmLoading').style.display = 'none';
        document.getElementById('cmTreeContainer').style.display = 'block';
    }
}

export function openContextManager(event) {
    initListeners();
    currentProfileId = parseInt(event.currentTarget.dataset.id);
    
    expandWindow();
    
    document.getElementById('mainView').style.display = 'none';
    document.getElementById('contextManagerView').style.display = 'flex';
    document.getElementById('archiveView').style.display = 'none';
    document.getElementById('appSettingsView').style.display = 'none';

    loadData(profiles => {
        const profile = profiles.find(p => p.id === currentProfileId);
        if (profile) {
            currentContextSizeLimit = profile.contextSizeLimit || 3000000;
            document.getElementById('cmExcludeInput').value = profile.excludePatterns || '';
            document.getElementById('cmIncludeInput').value = profile.includePatterns || '';
            loadTree(profile);
        }
    });
}