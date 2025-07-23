import { updateAndSaveMessage, updateTemporaryMessage } from './ui_handlers/message.js';
import { getHandle, verifyPermission } from './file_system_manager.js';
import { refreshUndoRedoCounts } from './ui.js';

const hereDocValue = 'EOPROJECTFILE';

/**
 * Helper to get the content of a file if it exists.
 * @param {FileSystemDirectoryHandle} handle The root directory handle.
 * @param {string} path The relative path to the file.
 * @returns {Promise<string|null>} The file content or null if it doesn't exist.
 */
async function getFileContent(handle, path) {
    try {
        const pathParts = path.split('/');
        const fileName = pathParts.pop();
        let currentDir = handle;
        for (const part of pathParts) {
            if (part) currentDir = await currentDir.getDirectoryHandle(part, { create: false });
        }
        const fileHandle = await currentDir.getFileHandle(fileName, { create: false });
        const file = await fileHandle.getFile();
        const content = await file.text();
        if (content.includes('\u0000')) return null; // Treat binary files as non-existent for undo
        return content;
    } catch (e) {
        return null; // File or directory in path doesn't exist
    }
}

/**
 * Helper to check if a file or directory exists.
 * @param {FileSystemDirectoryHandle} handle The root directory handle.
 * @param {string} path The relative path.
 * @returns {Promise<boolean>} True if it exists.
 */
async function entryExists(handle, path) {
    try {
        const pathParts = path.split('/');
        const entryName = pathParts.pop();
        let currentDir = handle;
        for (const part of pathParts) {
            if (part) currentDir = await currentDir.getDirectoryHandle(part, { create: false });
        }
        // This will throw if the entry doesn't exist. We don't care if it's a file or directory.
        await currentDir.getDirectoryHandle(entryName, { create: false });
        return true;
    } catch (e) {
        try {
            // Maybe it's a file?
             const pathParts = path.split('/');
             const entryName = pathParts.pop();
             let currentDir = handle;
             for (const part of pathParts) {
                if(part) currentDir = await currentDir.getDirectoryHandle(part, { create: false });
             }
             await currentDir.getFileHandle(entryName, { create: false });
             return true;
        } catch (e2) {
             return false;
        }
    }
}


/**
 * Generates an undo script by inspecting the filesystem before changes are made.
 * @param {FileSystemDirectoryHandle} rootHandle The project's root handle.
 * @param {string} deployScript The deployment script to be executed.
 * @returns {Promise<string>} The generated undo script.
 */
async function generateUndoScript(rootHandle, deployScript) {
    const lines = deployScript.split('\n');
    const rollbackCmds = [];
    let i = 0;

    while (i < lines.length) {
        const line = lines[i].trim();
        i++;
        if (!line || line.startsWith('#')) continue;

        try {
            if (line.startsWith('cat >')) {
                const match = line.match(/^cat >\s+((?:'.*?'|".*?"|[^\s'"]+))\s+<<\s+'EOPROJECTFILE'/);
                if (!match) continue; // Skip malformed lines

                let filePath = match[1].startsWith("'") ? match[1].slice(1, -1) : match[1];
                filePath = filePath.replace('./', '');
                
                const originalContent = await getFileContent(rootHandle, filePath);
                if (originalContent !== null) {
                    const escapedContent = originalContent;
                    rollbackCmds.unshift(`cat > ./${filePath} << '${hereDocValue}'\n${escapedContent}\n${hereDocValue}`);
                } else {
                    rollbackCmds.unshift(`rm -f ./${filePath}`);
                }

                while (i < lines.length && lines[i] !== hereDocValue) {
                    i++;
                }
                if (i < lines.length) i++; // Skip the delimiter line
                continue;
            }

            const parts = line.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || [];
            if (parts.length === 0) continue;
            
            const command = parts[0];
            const args = parts.slice(1).map(arg => arg.replace(/^['"]|['"]$/g, ''));

            if (command === 'mkdir') {
                const dirPath = args.find(a => !a.startsWith('-')).replace('./', '');
                if (!(await entryExists(rootHandle, dirPath))) {
                    rollbackCmds.unshift(`rmdir ./${dirPath}`);
                }
            } else if (command === 'rm') {
                const filePath = args.find(a => !a.startsWith('-')).replace('./', '');
                const originalContent = await getFileContent(rootHandle, filePath);
                if (originalContent !== null) {
                     rollbackCmds.unshift(`cat > ./${filePath} << '${hereDocValue}'\n${originalContent}\n${hereDocValue}`);
                }
            } else if (command === 'rmdir') {
                 const dirPath = args[0].replace('./', '');
                 rollbackCmds.unshift(`mkdir ./${dirPath}`);
            } else if (command === 'mv') {
                if (args.length === 2) {
                    const src = args[0].replace('./', '');
                    const dest = args[1].replace('./', '');
                    rollbackCmds.unshift(`mv ./${dest} ./${src}`);
                }
            }
        } catch (e) {
            console.warn(`Could not generate undo command for line: "${line}"`, e);
        }
    }
    return rollbackCmds.join('\n');
}


/**
 * Parses and executes a bash-like script using the File System Access API.
 * Exported for use by undo_redo.js
 * @param {FileSystemDirectoryHandle} rootHandle The root directory handle for the project.
 * @param {string} script The script to execute.
 * @param {boolean} tolerateErrors If true, continues execution on error.
 */
export async function executeFileSystemScript(rootHandle, script, tolerateErrors) {
    const lines = script.split('\n');
    let i = 0;

    while (i < lines.length) {
        const line = lines[i].trim();
        i++; // Move to the next line immediately

        if (!line || line.startsWith('#')) continue;
        
        try {
            if (line.startsWith('cat >')) {
                const match = line.match(/^cat >\s+((?:'.*?'|".*?"|[^\s'"]+))\s+<<\s+'EOPROJECTFILE'/);
                if (!match) throw new Error(`Invalid cat command format: ${line}`);
                
                let rawPath = match[1];
                let filePath = ((rawPath.startsWith("'") && rawPath.endsWith("'")) || (rawPath.startsWith('"') && rawPath.endsWith('"')))
                    ? rawPath.slice(1, -1)
                    : rawPath;
                filePath = filePath.replace('./', '');

                let content = '';
                let contentEnded = false;
                while (i < lines.length) {
                    if (lines[i] === hereDocValue) {
                        contentEnded = true;
                        i++;
                        break;
                    }
                    content += lines[i] + '\n';
                    i++;
                }

                if (!contentEnded) throw new Error(`Script parsing error: EOF while looking for '${hereDocValue}'`);
                if (content.endsWith('\n')) content = content.slice(0, -1);

                const pathParts = filePath.split('/');
                const fileName = pathParts.pop();
                let currentDir = rootHandle;
                for (const part of pathParts) {
                    if (part) currentDir = await currentDir.getDirectoryHandle(part, { create: true });
                }
                const fileHandle = await currentDir.getFileHandle(fileName, { create: true });
                const writable = await fileHandle.createWritable();
                await writable.write(content);
                await writable.close();
                continue;
            }

            const parts = line.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || [];
            if (parts.length === 0) continue;
            
            const command = parts[0];
            const args = parts.slice(1);

            if (command === 'mkdir') {
                const pFlag = args.includes('-p');
                const dirPaths = args.filter(arg => arg !== '-p');
                for (let dirPath of dirPaths) {
                    dirPath = dirPath.replace(/^['"]|['"]$/g, '').replace('./', '');
                    const pathParts = dirPath.split('/').filter(Boolean);
                    
                    if (pFlag) {
                        let currentDir = rootHandle;
                        for (const part of pathParts) {
                            currentDir = await currentDir.getDirectoryHandle(part, { create: true });
                        }
                    } else {
                        if (pathParts.length === 0) continue;
                        const dirNameToCreate = pathParts.pop();
                        let parentDir = rootHandle;
                        for (const part of pathParts) {
                            parentDir = await parentDir.getDirectoryHandle(part, { create: false });
                        }
                        await parentDir.getDirectoryHandle(dirNameToCreate, { create: true });
                    }
                }
            } else if (command === 'rm') {
                const filePaths = args.filter(p => !p.startsWith('-'));
                for (let filePath of filePaths) {
                    filePath = filePath.replace(/^['"]|['"]$/g, '').replace('./', '');
                    if (!filePath) continue;

                    const pathParts = filePath.split('/');
                    const fileName = pathParts.pop();
                    let parentDir = rootHandle;
                    for (const part of pathParts) {
                        if (part) parentDir = await parentDir.getDirectoryHandle(part);
                    }
                    await parentDir.removeEntry(fileName, { recursive: false });
                }
            } else if (command === 'rmdir') {
                 const dirPaths = args;
                 for (let dirPath of dirPaths) {
                    dirPath = dirPath.replace(/^['"]|['"]$/g, '').replace('./', '');
                    const pathParts = dirPath.split('/');
                    const dirName = pathParts.pop();
                    let parentDir = rootHandle;
                    for (const part of pathParts) {
                        if(part) parentDir = await parentDir.getDirectoryHandle(part);
                    }
                    await parentDir.removeEntry(dirName, { recursive: false });
                 }
            } else if (command === 'mv') {
                if (args.length !== 2) throw new Error("mv requires exactly two arguments.");
                const sourcePath = args[0].replace(/^['"]|['"]$/g, '').replace('./', '');
                const destPath = args[1].replace(/^['"]|['"]$/g, '').replace('./', '');

                const sourceParts = sourcePath.split('/');
                const sourceName = sourceParts.pop();
                let sourceParentHandle = rootHandle;
                 for (const part of sourceParts) {
                    if(part) sourceParentHandle = await sourceParentHandle.getDirectoryHandle(part);
                }
                const sourceHandle = await sourceParentHandle.getFileHandle(sourceName);
                const sourceContent = await (await sourceHandle.getFile()).arrayBuffer();

                const destParts = destPath.split('/');
                const destName = destParts.pop();
                let destParentHandle = rootHandle;
                for (const part of destParts) {
                    if (part) destParentHandle = await destParentHandle.getDirectoryHandle(part, { create: true });
                }
                const destFileHandle = await destParentHandle.getFileHandle(destName, { create: true });
                const writable = await destFileHandle.createWritable();
                await writable.write(sourceContent);
                await writable.close();

                await sourceParentHandle.removeEntry(sourceName);

            } else if (command === 'chmod' || command === 'touch') {
                console.log(`Ignoring safe command: ${line}`);
            } else {
                 throw new Error(`Unsupported command in deploy script: ${command}`);
            }
        } catch(error) {
            console.error(`Error executing line: '${line}'`, error);
            if (!tolerateErrors) throw error;
        }
    }
}

async function deployCodeJs(profile) {
    const isDetached = new URLSearchParams(window.location.search).get('view') === 'window';

    const handle = await getHandle(profile.id);
    if (!handle) {
        updateAndSaveMessage(profile.id, 'Error: Please select a project folder first to deploy code.', 'error');
        return;
    }
     if (!(await verifyPermission(handle))) {
        updateAndSaveMessage(profile.id, 'Error: Permission to folder lost. Please select it again.', 'error');
        return;
    }

    try {
        let codeToDeploy;
        if (profile.deployFromClipboard || isDetached) {
            codeToDeploy = await navigator.clipboard.readText();
        } else {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            const results = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: () => {
                    const allCodeBlocks = Array.from(document.querySelectorAll('code'));
                    if (allCodeBlocks.length > 0) {
                        return allCodeBlocks[allCodeBlocks.length - 1].innerText;
                    }
                    return null;
                }
            });
            codeToDeploy = results[0].result;
        }

        if (!codeToDeploy || !codeToDeploy.includes(hereDocValue)) {
            updateAndSaveMessage(profile.id, 'Error: Clipboard content is not a valid deploy script.', 'error');
            return;
        }
        
        updateTemporaryMessage(profile.id, 'Generating undo script...');
        const undoScript = await generateUndoScript(handle, codeToDeploy);

        updateTemporaryMessage(profile.id, 'Deploying code locally...');
        await executeFileSystemScript(handle, codeToDeploy, profile.tolerateErrors !== false);
        
        // On success, update history
        const undoKey = `undo_stack_${profile.id}`;
        const redoKey = `redo_stack_${profile.id}`;

        const undoData = await chrome.storage.local.get(undoKey);
        const undoStack = undoData[undoKey] || [];
        
        undoStack.push({ undoScript: undoScript, redoScript: codeToDeploy });
        
        // Save the updated undo stack and clear the redo stack
        await chrome.storage.local.set({ [undoKey]: undoStack.slice(-20) }); // Limit stack size
        await chrome.storage.local.remove(redoKey);
        
        updateAndSaveMessage(profile.id, 'Code deployed successfully!', 'success');
        console.log('JustCode Deploy Result: Local file system updated.');

    } catch (error) {
        updateAndSaveMessage(profile.id, `Error: ${error.message}`, 'error');
        console.error('JustCode Error:', error);
    }
}

async function deployCodeServer(profile) {
    const isDetached = new URLSearchParams(window.location.search).get('view') === 'window';
    const path = profile.projectPath;
    if (!path) {
        updateAndSaveMessage(profile.id, 'Error: Please enter a project path.', 'error');
        return;
    }
    try {
        let codeToDeploy;
        if (profile.deployFromClipboard || isDetached) {
            codeToDeploy = await navigator.clipboard.readText();
        } else {
            // Try to find a copy button and click it
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: () => {
                    const allCodeBlocks = Array.from(document.querySelectorAll('code'));
                    if (allCodeBlocks.length > 0) {
                        const lastCodeBlock = allCodeBlocks[allCodeBlocks.length - 1].innerText;
                        navigator.clipboard.writeText(lastCodeBlock);
                    }
                }
            });
            await new Promise(resolve => setTimeout(resolve, 100)); // Give clipboard time
            codeToDeploy = await navigator.clipboard.readText();
        }

        if (!codeToDeploy || !codeToDeploy.includes(hereDocValue)) {
            updateAndSaveMessage(profile.id, 'Error: No valid deploy script found in clipboard.', 'error');
            return;
        }

        const serverUrl = profile.serverUrl.endsWith('/') ? profile.serverUrl.slice(0, -1) : profile.serverUrl;
        const tolerateErrors = profile.tolerateErrors !== false;
        const endpoint = `${serverUrl}/deploycode?path=${encodeURIComponent(path)}&tolerateErrors=${tolerateErrors}`;

        const headers = { 'Content-Type': 'text/plain' };
        if (profile.isAuthEnabled && profile.username) {
            headers['Authorization'] = 'Basic ' + btoa(`${profile.username}:${profile.password}`);
        }

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: headers,
            body: codeToDeploy
        });

        const resultText = await response.text();
        if (!response.ok) {
            throw new Error(`Deploy failed: ${resultText}`);
        }
        
        updateAndSaveMessage(profile.id, 'Code deployed successfully!', 'success');
        console.log('JustCode Deploy Result:', resultText);

    } catch (error) {
        updateAndSaveMessage(profile.id, `Error: ${error.message}`, 'error');
        console.error('JustCode Error:', error);
    }
}


export async function deployCode(profile) {
    updateTemporaryMessage(profile.id, '');

    if (profile.useServerBackend) {
        await deployCodeServer(profile);
    } else {
        await deployCodeJs(profile);
    }
    
    // Always refresh counts at the end
    refreshUndoRedoCounts(profile);
}