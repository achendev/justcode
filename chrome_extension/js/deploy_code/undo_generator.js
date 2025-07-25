import { hereDocValue } from '../default_instructions.js';
import { getFileContent, entryExists } from './fs_helpers.js';

/**
 * Generates an undo script by inspecting the filesystem before changes are made.
 * @param {FileSystemDirectoryHandle} rootHandle The project's root handle.
 * @param {string} deployScript The deployment script to be executed.
 * @returns {Promise<string>} The generated undo script.
 */
export async function generateUndoScript(rootHandle, deployScript) {
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