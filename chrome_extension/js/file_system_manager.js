import { get, set, del } from './db/idb.js';

/**
 * Saves a directory handle to IndexedDB for a given profile ID.
 * @param {number} profileId
 * @param {FileSystemDirectoryHandle} handle
 */
export async function saveHandle(profileId, handle) {
    await set(profileId, handle);
}

/**
 * Retrieves a stored directory handle from IndexedDB.
 * @param {number} profileId
 * @returns {Promise<FileSystemDirectoryHandle|null>}
 */
export async function getHandle(profileId) {
    return await get(profileId);
}

/**
 * Checks if the extension still has permission for a given handle.
 * @param {FileSystemDirectoryHandle} handle
 * @returns {Promise<boolean>}
 */
export async function verifyPermission(handle) {
    if (!handle) return false;
    // The 'query' method returns 'granted' if permission is still valid.
    const options = { mode: 'readwrite' };
    return (await handle.queryPermission(options)) === 'granted';
}

/**
 * Requests permission for a given handle if it's not already granted.
 * @param {FileSystemDirectoryHandle} handle
 * @returns {Promise<boolean>}
 */
export async function requestPermission(handle) {
    if (!handle) return false;
    const options = { mode: 'readwrite' };
    if ((await handle.queryPermission(options)) === 'granted') {
        return true;
    }
    // Request permission. If granted, return true.
    return (await handle.requestPermission(options)) === 'granted';
}


/**
 * Deletes a handle from IndexedDB.
 * @param {number} profileId
 */
export async function forgetHandle(profileId) {
    await del(profileId);
}