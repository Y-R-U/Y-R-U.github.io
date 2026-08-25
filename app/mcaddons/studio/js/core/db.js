// Minimal IndexedDB key/value store. One object store, string keys.
const DB = 'addon-studio';
const STORE = 'kv';
let pdb = null;

function open() {
  if (pdb) return pdb;
  pdb = new Promise((res, rej) => {
    const rq = indexedDB.open(DB, 1);
    rq.onupgradeneeded = () => { const d = rq.result; if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE); };
    rq.onsuccess = () => res(rq.result);
    rq.onerror = () => rej(rq.error);
  });
  return pdb;
}

async function tx(mode, fn) {
  const d = await open();
  return new Promise((res, rej) => {
    const t = d.transaction(STORE, mode);
    const s = t.objectStore(STORE);
    let req;
    try { req = fn(s); } catch (e) { rej(e); return; }
    // Read .result off the request, never the request itself — an absent key gives undefined,
    // and returning the IDBRequest instead would look like a truthy value to every caller.
    t.oncomplete = () => res(req && 'result' in req ? req.result : undefined);
    t.onerror = () => rej(t.error);
    t.onabort = () => rej(t.error);
  });
}

export const idb = {
  get(k) { return tx('readonly', s => s.get(k)); },
  set(k, v) { return tx('readwrite', s => s.put(v, k)); },
  del(k) { return tx('readwrite', s => s.delete(k)); },
  keys() { return tx('readonly', s => s.getAllKeys()); },
  all() { return tx('readonly', s => s.getAll()); },
  async available() { try { await open(); return true; } catch (e) { return false; } }
};
