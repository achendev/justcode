/**
 * Helper to get the content of a file if it exists.
 * @param {FileSystemDirectoryHandle} handle The root directory handle.
 * @param {string} path The relative path to the file.
 * @returns {Promise<string|null>} The file content or null if it doesn't exist.
 */
export async function getFileContent(handle, path) {
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
export async function entryExists(handle, path) {
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