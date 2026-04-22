const DB_NAME = 'reader';
const DB_VERSION = 3;

let dbPromise = null;

export function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of Array.from(db.objectStoreNames)) db.deleteObjectStore(name);
      db.createObjectStore('bookMeta', { keyPath: 'jobId' });
      db.createObjectStore('prefs', { keyPath: 'key' });
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

/* bookMeta: local per-book state keyed by server jobId.
   Holds title/author/voice/speed/size (mirrors of server meta, cached so the
   library still renders offline) + duration/position/lastPlayed (local only). */
export async function getBookMeta(jobId) { return wrap((await tx('bookMeta')).get(jobId)); }
export async function listBookMeta() { return wrap((await tx('bookMeta')).getAll()); }
export async function putBookMeta(meta) { return wrap((await tx('bookMeta', 'readwrite')).put(meta)); }
export async function deleteBookMeta(jobId) { return wrap((await tx('bookMeta', 'readwrite')).delete(jobId)); }

export async function updateBookMeta(jobId, patch) {
  const existing = (await getBookMeta(jobId)) || { jobId };
  const merged = { ...existing, ...patch, jobId };
  await putBookMeta(merged);
  return merged;
}

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

export async function saveAudio(jobId, blob) {
  const dir = await audioDir();
  const fh = await dir.getFileHandle(`${jobId}.mp3`, { create: true });
  const w = await fh.createWritable();
  await w.write(blob);
  await w.close();
}

export async function readAudioFile(jobId) {
  const dir = await audioDir();
  const fh = await dir.getFileHandle(`${jobId}.mp3`);
  return fh.getFile();
}

export async function audioExists(jobId) {
  try {
    const dir = await audioDir();
    await dir.getFileHandle(`${jobId}.mp3`);
    return true;
  } catch (_) { return false; }
}

export async function audioSize(jobId) {
  try {
    const f = await readAudioFile(jobId);
    return f.size;
  } catch (_) { return null; }
}

export async function deleteAudio(jobId) {
  try {
    const dir = await audioDir();
    await dir.removeEntry(`${jobId}.mp3`);
  } catch (_) {}
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
