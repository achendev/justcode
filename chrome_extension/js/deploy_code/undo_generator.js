import { getFileContent, entryExists } from './fs_helpers.js';

export async function generateUndoScript(handles, deployScript, profile, delimiter = 'EOPROJECTFILE') {
    const lines = deployScript.replace(/\r\n/g, '\n').split('\n');
    const rollbackCmds = [];
    let i = 0;

    const delimiterPattern = delimiter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const catRegex = new RegExp(`^cat >\\s+((?:'.*?'|".*?"|[^\\s'"]+))\\s+<<\\s+'${delimiterPattern}'`);

    while (i < lines.length) {
        const line = lines[i].trim();
        i++;
        if (!line || line.startsWith('#')) continue;

        try {
            if (line.startsWith('cat >')) {
                const match = line.match(catRegex);
                if (!match) continue; // Skip if delimiter mismatch

                let filePath = match[1].startsWith("'") ? match[1].slice(1, -1) : match[1];
                
                const originalContent = await getFileContent(handles, filePath, profile);
                if (originalContent !== null) {
                    rollbackCmds.unshift(`cat > ${filePath} << '${delimiter}'\n${originalContent}\n${delimiter}`);
                } else {
                    rollbackCmds.unshift(`rm -f ${filePath}`);
                }

                while (i < lines.length && !lines[i].startsWith(delimiter)) {
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
                     rollbackCmds.unshift(`cat > ${filePath} << '${delimiter}'\n${originalContent}\n${delimiter}`);
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