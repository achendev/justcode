import { hereDocValue } from '../default_instructions.js';
import { getFileContent, entryExists } from './fs_helpers.js';

/**
 * Generates an undo script by inspecting the filesystem before changes are made.
 * @param {Array<FileSystemDirectoryHandle>} handles The project's root handles.
 * @param {string} deployScript The deployment script to be executed.
 * @param {object} profile The active user profile.
 * @returns {Promise<string>} The generated undo script.
 */
export async function generateUndoScript(handles, deployScript, profile) {
    const lines = deployScript.replace(/\r\n/g, '\n').split('\n');
    const rollbackCmds = [];
    let i = 0;

    while (i < lines.length) {
        const line = lines[i].trim();
        i++;
        if (!line || line.startsWith('#')) continue;

        try {
            if (line.startsWith('cat >')) {
                const match = line.match(/^cat >\s+((?:'.*?'|".*?"|[^\s'"]+))\s+<<\s+'EOPROJECTFILE'/);
                if (!match) continue;

                let filePath = match[1].startsWith("'") ? match[1].slice(1, -1) : match[1];
                
                const originalContent = await getFileContent(handles, filePath, profile);
                if (originalContent !== null) {
                    rollbackCmds.unshift(`cat > ${filePath} << '${hereDocValue}'\n${originalContent}\n${hereDocValue}`);
                } else {
                    rollbackCmds.unshift(`rm -f ${filePath}`);
                }

                while (i < lines.length && !lines[i].startsWith(hereDocValue)) {
                    i++;
                }
                if (i < lines.length) i++;
                continue;
            }

            const parts = line.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || [];
            if (parts.length === 0) continue;
            
            const command = parts[0];
            const args = parts.slice(1);

            if (command === 'mkdir') {
                const dirPath = args.find(a => !a.startsWith('-'));
                if (!(await entryExists(handles, dirPath, profile))) {
                    rollbackCmds.unshift(`rmdir ${dirPath}`);
                }
            } else if (command === 'rm') {
                const filePath = args.find(a => !a.startsWith('-'));
                const originalContent = await getFileContent(handles, filePath, profile);
                if (originalContent !== null) {
                     rollbackCmds.unshift(`cat > ${filePath} << '${hereDocValue}'\n${originalContent}\n${hereDocValue}`);
                }
            } else if (command === 'rmdir') {
                 const dirPath = args[0];
                 rollbackCmds.unshift(`mkdir ${dirPath}`);
            } else if (command === 'mv') {
                if (args.length === 2) {
                    const src = args[0];
                    const dest = args[1];
                    rollbackCmds.unshift(`mv ${dest} ${src}`);
                }
            }
        } catch (e) {
            console.warn(`Could not generate undo command for line: "${line}"`, e);
        }
    }
    return rollbackCmds.join('\n');
}