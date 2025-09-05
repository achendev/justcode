/**
 * Resolves a potentially prefixed path to the correct file system handle and relative path.
 * @param {Array<FileSystemDirectoryHandle>} handles - Array of root handles.
 * @param {string} rawPath - The path from the script (e.g., './file.txt' or './0/file.txt').
 * @param {object} profile - The active user profile.
 * @returns {{handle: FileSystemDirectoryHandle, relativePath: string}}
 */
export function resolveHandleAndPath(handles, rawPath, profile) {
    const path = rawPath.replace(/^\.\//, '');
    if (handles.length > 1) {
        const useNumericPrefixes = profile?.useNumericPrefixesForMultiProject;
        const separatorIndex = path.indexOf('/');
        if (separatorIndex === -1) throw new Error(`Invalid path for multi-project JS mode: '${rawPath}'.`);
        
        const prefix = path.substring(0, separatorIndex);
        const relativePath = path.substring(separatorIndex + 1);

        let handle;
        if (useNumericPrefixes) {
            const index = parseInt(prefix, 10);
            if (isNaN(index) || index >= handles.length || !handles[index]) throw new Error(`Path index ${index} is invalid or handle not found.`);
            handle = handles[index];
        } else {
            handle = handles.find(h => h.name === prefix);
            if (!handle) throw new Error(`Project handle with name '${prefix}' not found.`);
        }
        return { handle, relativePath };
    } else {
        return { handle: handles[0], relativePath: path };
    }
}


/**
 * Helper to get the content of a file if it exists.
 * @param {Array<FileSystemDirectoryHandle>} handles The root directory handles.
 * @param {string} path The relative path to the file.
 * @param {object} profile The active user profile.
 * @returns {Promise<string|null>} The file content or null if it doesn't exist.
 */
export async function getFileContent(handles, path, profile) {
    try {
        const { handle, relativePath } = resolveHandleAndPath(handles, path, profile);
        const pathParts = relativePath.split('/');
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
 * @param {Array<FileSystemDirectoryHandle>} handles The root directory handles.
 * @param {string} path The relative path.
 * @param {object} profile The active user profile.
 * @returns {Promise<boolean>} True if it exists.
 */
export async function entryExists(handles, path, profile) {
    try {
        const { handle, relativePath } = resolveHandleAndPath(handles, path, profile);
        const pathParts = relativePath.split('/');
        const entryName = pathParts.pop();
        let currentDir = handle;
        for (const part of pathParts) {
            if (part) currentDir = await currentDir.getDirectoryHandle(part, { create: false });
        }
        await currentDir.getDirectoryHandle(entryName, { create: false });
        return true;
    } catch (e) {
        try {
            const { handle, relativePath } = resolveHandleAndPath(handles, path, profile);
            const pathParts = relativePath.split('/');
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