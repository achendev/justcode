// A simple IndexedDB promise-based wrapper
const DB_NAME = 'JustCodeDB';
const STORE_NAME = 'directoryHandles';
let db;

async function getDB() {
    if (db) return db;
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);

        request.onerror = (event) => {
            console.error('IndexedDB error:', event.target.error);
            reject('IndexedDB error');
        };

        request.onsuccess = (event) => {
            db = event.target.result;
            resolve(db);
        };

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            }
        };
    });
}

export async function get(key) {
    const db = await getDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(key);
        request.onsuccess = () => resolve(request.result ? request.result.handle : null);
        request.onerror = (event) => {
            console.error('IDB get error:', event.target.error);
            reject(event.target.error);
        };
    });
}

export async function set(key, handle) {
    const db = await getDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.put({ id: key, handle: handle });
        request.onsuccess = () => resolve();
        request.onerror = (event) => {
            console.error('IDB set error:', event.target.error);
            reject(event.target.error);
        };
    });
}

export async function del(key) {
    const db = await getDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.delete(key);
        request.onsuccess = () => resolve();
        request.onerror = (event) => {
            console.error('IDB delete error:', event.target.error);
            reject(event.target.error);
        };
    });
}