import { hereDocValue } from '../default_instructions.js';

/**
 * Parses and executes a bash-like script using the File System Access API.
 * Exported for use by undo_redo.js
 * @param {FileSystemDirectoryHandle} rootHandle The root directory handle for the project.
 * @param {string} script The script to execute.
 * @param {boolean} tolerateErrors If true, continues execution on error.
 */
export async function executeFileSystemScript(rootHandle, script, tolerateErrors) {
    // Normalize line endings to prevent issues on Windows
    const lines = script.replace(/\r\n/g, '\n').split('\n');
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