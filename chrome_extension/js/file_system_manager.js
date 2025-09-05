import { get, set, del } from './db/idb.js';

/**
 * Saves a directory handle to IndexedDB for a given profile ID and index.
 * @param {number} profileId
 * @param {number} index
 * @param {FileSystemDirectoryHandle} handle
 */
export async function saveHandle(profileId, index, handle) {
    await set(`handle_${profileId}_${index}`, handle);
}

/**
 * Retrieves all stored directory handles for a profile.
 * @param {number} profileId
 * @param {number} count The number of handles to retrieve.
 * @returns {Promise<Array<FileSystemDirectoryHandle|null>>}
 */
export async function getHandles(profileId, count) {
    if (count === 0) return [];
    const promises = [];
    for (let i = 0; i < count; i++) {
        promises.push(get(`handle_${profileId}_${i}`));
    }
    return Promise.all(promises);
}

/**
 * Deletes a specific handle from IndexedDB.
 * @param {number} profileId
 * @param {number} index
 */
export async function forgetHandle(profileId, index) {
    await del(`handle_${profileId}_${index}`);
}

/**
 * Deletes all handles associated with a profile.
 * Used when a profile is deleted.
 * @param {number} profileId
 */
export async function forgetAllHandlesForProfile(profileId) {
    const promises = [];
    // Try to delete a reasonable number of handles, ignoring errors for non-existent ones.
    for (let i = 0; i < 20; i++) {
        promises.push(del(`handle_${profileId}_${i}`).catch(() => {}));
    }
    await Promise.all(promises);
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