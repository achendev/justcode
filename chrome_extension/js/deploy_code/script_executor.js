import { resolveHandleAndPath } from './fs_helpers.js';

/**
 * Parses and executes a bash-like script using the File System Access API.
 * @param {Array<FileSystemDirectoryHandle>} handles The root directory handles.
 * @param {string} script The script to execute.
 * @param {object} profile The active user profile.
 * @param {string} delimiter The heredoc delimiter to use.
 * @returns {Promise<{log: string[], errors: string[]}>}
 */
export async function executeFileSystemScript(handles, script, profile, delimiter = 'EOPROJECTFILE') {
    const tolerateErrors = profile.tolerateErrors !== false;
    const addEmptyLine = profile.addEmptyLineOnDeploy !== false; 
    const lines = script.replace(/\r\n/g, '\n').split('\n');
    let i = 0;
    const errors = [];
    const log = [];

    // Regex to match "cat > path << 'EOFILE123'"
    // We escape the delimiter to be safe in regex
    const delimiterPattern = delimiter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const catRegex = new RegExp(`^cat >\\s+((?:'.*?'|".*?"|[^\\s'"]+))\\s+<<\\s+'${delimiterPattern}'`);

    while (i < lines.length) {
        const line = lines[i].trim();
        const originalLineForError = lines[i];
        const lineNumForError = i + 1;
        i++;

        if (!line || line.startsWith('#')) continue;
        
        try {
            if (line.startsWith('cat >')) {
                const match = line.match(catRegex);
                if (!match) {
                    // Check if it's a cat command with a WRONG delimiter to give better error?
                    // Or check if it's just malformed?
                    // If strict matching is required, we just say invalid format or ignore.
                    // For robustness, if it matches generic cat but not our delimiter, we might log it.
                    if (line.match(/^cat >.*<<\s+'(EO.*?)'/)) {
                         // Found a different delimiter -> ignore or error? 
                         // "it should parse and execute... only if 123 is initially stored"
                         // So we treat this as not matching our command set. 
                         // However, if the line looks like a command but fails strict parse, user might want to know.
                         // For now, standard error "Invalid cat command format".
                         throw new Error(`Invalid cat command format or delimiter mismatch (Expected '${delimiter}'): ${line}`);
                    }
                    throw new Error(`Invalid cat command format: ${line}`);
                }
                
                let rawPath = match[1].replace(/^['"]|['"]$/g, '');
                
                let content = '';
                let contentEnded = false;
                while (i < lines.length) {
                    if (lines[i].startsWith(delimiter)) {
                        contentEnded = true;
                        i++;
                        break;
                    }
                    content += lines[i] + '\n';
                    i++;
                }

                if (!contentEnded) throw new Error(`Script parsing error: EOF while looking for '${delimiter}'`);
                
                if (!addEmptyLine && content.endsWith('\n')) {
                    content = content.slice(0, -1);
                }
                
                const { handle, relativePath } = resolveHandleAndPath(handles, rawPath, profile);
                const pathParts = relativePath.split('/');
                const fileName = pathParts.pop();
                let currentDir = handle;
                for (const part of pathParts) {
                    if (part) currentDir = await currentDir.getDirectoryHandle(part, { create: true });
                }
                const fileHandle = await currentDir.getFileHandle(fileName, { create: true });
                const writable = await fileHandle.createWritable();
                await writable.write(content);
                await writable.close();
                log.push(`Wrote file: ${rawPath}`);
                continue;
            }

            const parts = line.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || [];
            if (parts.length === 0) continue;
            
            const command = parts[0];
            const args = parts.slice(1);

            // ... (Rest of commands mkdir, rm, etc. remain unchanged) ...
            if (command === 'mkdir') {
                const pFlag = args.includes('-p');
                const dirPaths = args.filter(arg => arg !== '-p');
                for (let rawPath of dirPaths) {
                    rawPath = rawPath.replace(/^['"]|['"]$/g, '');
                    const { handle, relativePath } = resolveHandleAndPath(handles, rawPath, profile);
                    const pathParts = relativePath.split('/').filter(Boolean);
                    
                    if (pFlag) {
                        let currentDir = handle;
                        for (const part of pathParts) {
                            currentDir = await currentDir.getDirectoryHandle(part, { create: true });
                        }
                    } else {
                        if (pathParts.length === 0) continue;
                        const dirNameToCreate = pathParts.pop();
                        let parentDir = handle;
                        for (const part of pathParts) {
                            parentDir = await parentDir.getDirectoryHandle(part, { create: false });
                        }
                        await parentDir.getDirectoryHandle(dirNameToCreate, { create: true });
                    }
                    log.push(`Created directory: ${rawPath}`);
                }
            } else if (command === 'rm') {
                const fFlag = args.includes('-f');
                const filePaths = args.filter(p => !p.startsWith('-'));
                for (let rawPath of filePaths) {
                    rawPath = rawPath.replace(/^['"]|['"]$/g, '');
                    if (!rawPath) continue;

                    const { handle, relativePath } = resolveHandleAndPath(handles, rawPath, profile);
                    const pathParts = relativePath.split('/');
                    const fileName = pathParts.pop();
                    let parentDir = handle;
                    for (const part of pathParts) {
                        if (part) parentDir = await parentDir.getDirectoryHandle(part);
                    }
                    try {
                        await parentDir.removeEntry(fileName, { recursive: false });
                        log.push(`Removed file: ${rawPath}`);
                    } catch (e) {
                        if ((fFlag || tolerateErrors) && e.name === 'NotFoundError') {
                            log.push(`Skipped removal (not found): ${rawPath}`);
                        } else { throw e; }
                    }
                }
            } else if (command === 'rmdir') {
                 for (let rawPath of args) {
                    rawPath = rawPath.replace(/^['"]|['"]$/g, '');
                    const { handle, relativePath } = resolveHandleAndPath(handles, rawPath, profile);
                    const pathParts = relativePath.split('/');
                    const dirName = pathParts.pop();
                    let parentDir = handle;
                    for (const part of pathParts) {
                        if(part) parentDir = await parentDir.getDirectoryHandle(part);
                    }
                    try {
                        await parentDir.removeEntry(dirName, { recursive: false });
                        log.push(`Removed directory: ${rawPath}`);
                    } catch (e) {
                        if (tolerateErrors && (e.name === 'NotFoundError' || e.name === 'InvalidModificationError')) {
                             log.push(`Skipped rmdir for '${rawPath}', ignoring error: ${e.message}`);
                        } else { throw e; }
                    }
                 }
            } else if (command === 'mv') {
                if (args.length !== 2) throw new Error("mv requires exactly two arguments.");
                const sourceRawPath = args[0].replace(/^['"]|['"]$/g, '');
                const destRawPath = args[1].replace(/^['"]|['"]$/g, '');

                const { handle: sourceHandle, relativePath: sourceRelativePath } = resolveHandleAndPath(handles, sourceRawPath, profile);
                const sourceParts = sourceRelativePath.split('/');
                const sourceName = sourceParts.pop();
                let sourceParentHandle = sourceHandle;
                for (const part of sourceParts) {
                    if(part) sourceParentHandle = await sourceParentHandle.getDirectoryHandle(part);
                }

                const fileToMoveHandle = await sourceParentHandle.getFileHandle(sourceName);
                const sourceContent = await (await fileToMoveHandle.getFile()).arrayBuffer();

                const { handle: destHandle, relativePath: destRelativePath } = resolveHandleAndPath(handles, destRawPath, profile);
                const destParts = destRelativePath.split('/');
                const destName = destParts.pop();
                let destParentHandle = destHandle;
                for (const part of destParts) {
                    if (part) destParentHandle = await destParentHandle.getDirectoryHandle(part, { create: true });
                }
                const destFileHandle = await destParentHandle.getFileHandle(destName, { create: true });
                const writable = await destFileHandle.createWritable();
                await writable.write(sourceContent);
                await writable.close();

                await sourceParentHandle.removeEntry(sourceName);
                log.push(`Moved: ${sourceRawPath} to ${destRawPath}`);
            } else if (command === 'chmod' || command === 'touch') {
                log.push(`Ignoring safe command: ${line}`);
            } else {
                 throw new Error(`Unsupported command in deploy script: ${command}`);
            }
        } catch(error) {
            const errorMessage = `Error on line ${lineNumForError}: '${originalLineForError.trim()}'\n  -> ${error.message}`;
            console.error(errorMessage, error);
            if (tolerateErrors) {
                errors.push(errorMessage);
            } else {
                throw error;
            }
        }
    }
    return { log, errors };
}