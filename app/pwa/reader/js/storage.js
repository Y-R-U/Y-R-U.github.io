/* IndexedDB only. OPFS needs a secure context (HTTPS / localhost), and
   this PWA is served over plain HTTP on the LAN, so navigator.storage
   is undefined on most clients. IDB blob storage works everywhere. */

const DB_NAME = 'reader';
const DB_VERSION = 4;

let dbPromise = null;

export function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of Array.from(db.objectStoreNames)) db.deleteObjectStore(name);
      db.createObjectStore('bookMeta', { keyPath: 'jobId' });
      db.createObjectStore('audio', { keyPath: 'jobId' });
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

/* bookMeta: local per-book state keyed by server jobId. */
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

/* --- Audio blobs (IDB 'audio' store) --- */
export async function saveAudio(jobId, blob) {
  return wrap((await tx('audio', 'readwrite')).put({ jobId, blob, size: blob.size }));
}

export async function readAudioFile(jobId) {
  const row = await wrap((await tx('audio')).get(jobId));
  if (!row || !row.blob) throw new Error('audio not cached');
  return row.blob;
}

export async function audioExists(jobId) {
  try {
    const count = await wrap((await tx('audio')).count(jobId));
    return count > 0;
  } catch (_) { return false; }
}

export async function audioSize(jobId) {
  try {
    const row = await wrap((await tx('audio')).get(jobId));
    return row?.size ?? row?.blob?.size ?? null;
  } catch (_) { return null; }
}

export async function deleteAudio(jobId) {
  try { await wrap((await tx('audio', 'readwrite')).delete(jobId)); } catch (_) {}
}

/* --- Storage diagnostics (all guarded — navigator.storage is missing
       in non-secure contexts on some browsers) --- */
export async function requestPersist() {
  if (!navigator.storage?.persist) return false;
  try { return await navigator.storage.persist(); } catch (_) { return false; }
}

export async function isPersisted() {
  if (!navigator.storage?.persisted) return false;
  try { return await navigator.storage.persisted(); } catch (_) { return false; }
}

export async function storageEstimate() {
  if (!navigator.storage?.estimate) return { usage: 0, quota: 0 };
  try { return await navigator.storage.estimate(); } catch (_) { return { usage: 0, quota: 0 }; }
}
