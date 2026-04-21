const DB_NAME = 'reader';
const DB_VERSION = 2;

let dbPromise = null;

export function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = req.result;
      // v2 is a clean break — the old v1 data was client-side-TTS state
      // that doesn't translate to the new MP3-based model.
      if (e.oldVersion < 2) {
        for (const name of Array.from(db.objectStoreNames)) db.deleteObjectStore(name);
        db.createObjectStore('books', { keyPath: 'id' });
        db.createObjectStore('jobs', { keyPath: 'jobId' });
        db.createObjectStore('prefs', { keyPath: 'key' });
      }
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

export async function putJob(meta) { return wrap((await tx('jobs', 'readwrite')).put(meta)); }
export async function getJob(id) { return wrap((await tx('jobs')).get(id)); }
export async function listJobs() { return wrap((await tx('jobs')).getAll()); }
export async function deleteJobRow(id) { return wrap((await tx('jobs', 'readwrite')).delete(id)); }

export async function getPref(key, fallback = null) {
  const row = await wrap((await tx('prefs')).get(key));
  return row ? row.value : fallback;
}
export async function setPref(key, value) {
  return wrap((await tx('prefs', 'readwrite')).put({ key, value }));
}

/* --- OPFS (audio blobs live here) --- */
async function audioDir() {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle('audio', { create: true });
}

export async function saveAudio(bookId, blob) {
  const dir = await audioDir();
  const fh = await dir.getFileHandle(`${bookId}.mp3`, { create: true });
  const w = await fh.createWritable();
  await w.write(blob);
  await w.close();
}

export async function readAudioFile(bookId) {
  const dir = await audioDir();
  const fh = await dir.getFileHandle(`${bookId}.mp3`);
  return fh.getFile();
}

export async function audioSize(bookId) {
  try {
    const f = await readAudioFile(bookId);
    return f.size;
  } catch (_) { return null; }
}

export async function deleteAudio(bookId) {
  try {
    const dir = await audioDir();
    await dir.removeEntry(`${bookId}.mp3`);
  } catch (_) {}
}

export async function deleteBook(id) {
  await deleteBookMeta(id);
  await deleteAudio(id);
}

export async function requestPersist() {
  if (navigator.storage && navigator.storage.persist) {
    try { return await navigator.storage.persist(); } catch (_) { return false; }
  }
  return false;
}

export async function isPersisted() {
  try { return await (navigator.storage?.persisted?.() ?? Promise.resolve(false)); }
  catch (_) { return false; }
}

export async function storageEstimate() {
  try { return await navigator.storage.estimate(); } catch (_) { return { usage: 0, quota: 0 }; }
}
