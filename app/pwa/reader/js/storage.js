const DB_NAME = 'reader';
const DB_VERSION = 1;

let dbPromise = null;

export function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('books')) db.createObjectStore('books', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('prefs')) db.createObjectStore('prefs', { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(store, mode = 'readonly') {
  return openDB().then((db) => db.transaction(store, mode).objectStore(store));
}

function wrap(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function putBook(meta) { return wrap((await tx('books', 'readwrite')).put(meta)); }
export async function getBook(id) { return wrap((await tx('books')).get(id)); }
export async function listBooks() { return wrap((await tx('books')).getAll()); }
export async function deleteBookMeta(id) { return wrap((await tx('books', 'readwrite')).delete(id)); }

export async function getPref(key, fallback = null) {
  const row = await wrap((await tx('prefs')).get(key));
  return row ? row.value : fallback;
}
export async function setPref(key, value) {
  return wrap((await tx('prefs', 'readwrite')).put({ key, value }));
}

// --- OPFS ---
async function booksDir() {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle('books', { create: true });
}

export async function saveBookFile(bookId, filename, blob) {
  const dir = await (await booksDir()).getDirectoryHandle(bookId, { create: true });
  const fh = await dir.getFileHandle(filename, { create: true });
  const w = await fh.createWritable();
  await w.write(blob);
  await w.close();
}

export async function readBookFile(bookId, filename) {
  const dir = await (await booksDir()).getDirectoryHandle(bookId);
  const fh = await dir.getFileHandle(filename);
  const f = await fh.getFile();
  return f.arrayBuffer();
}

export async function deleteBookFiles(bookId) {
  const dir = await booksDir();
  try { await dir.removeEntry(bookId, { recursive: true }); } catch (_) {}
}

export async function deleteBook(id) {
  await deleteBookMeta(id);
  await deleteBookFiles(id);
}

export async function requestPersist() {
  if (navigator.storage && navigator.storage.persist) {
    try { return await navigator.storage.persist(); } catch (_) { return false; }
  }
  return false;
}
