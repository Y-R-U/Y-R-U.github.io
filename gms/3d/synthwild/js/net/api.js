// Client for the synthwild server (games.br8t.com) plus an IndexedDB world store
// with the same shape, so cloud and local worlds can be listed side by side.
// Contract: docs/notes/server.md.

const BASE = new URL('../../api/', import.meta.url).href;
const AUTH_CONFIG = '/lib/auth/config.js';

export class ApiError extends Error {
  constructor(status, code, message, extra) {
    super(message || code);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    Object.assign(this, extra);
  }
}

const CODE_BY_STATUS = { 400: 'bad_request', 401: 'unauthorized', 403: 'forbidden', 404: 'not_found',
  409: 'conflict', 413: 'too_large', 415: 'bad_request', 429: 'rate_limited', 507: 'quota' };

let availProbe = null;
let availKnown = false;

async function available(force = false) {
  if (!availProbe || force) {
    availProbe = (async () => {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 2500);
      try {
        const r = await fetch(BASE + 'health', { signal: ctl.signal, cache: 'no-store', credentials: 'same-origin' });
        if (!r.ok) return false;
        const j = await r.json();
        return j && j.name === 'synthwild';
      } catch {
        return false;
      } finally {
        clearTimeout(t);
      }
    })();
  }
  availKnown = await availProbe;
  return availKnown;
}

async function request(method, path, { json, body, type, raw } = {}) {
  if (!(await available())) throw new ApiError(0, 'offline', 'The world server is not reachable');
  const headers = {};
  if (json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(json);
  } else if (type) headers['Content-Type'] = type;
  let r;
  try {
    r = await fetch(BASE + path, { method, headers, body, credentials: 'same-origin', cache: 'no-store' });
  } catch (e) {
    throw new ApiError(0, 'offline', 'Network error: ' + (e && e.message || e));
  }
  if (raw && r.ok) return r;
  let data = null;
  if (r.status !== 204) {
    try { data = await r.json(); } catch { data = null; }
  }
  if (!r.ok) {
    const extra = data && data.world ? { current: cloudMeta(data.world) } : undefined;
    throw new ApiError(r.status, (data && data.code) || CODE_BY_STATUS[r.status] || 'server',
      (data && data.error) || `HTTP ${r.status}`, extra);
  }
  return data;
}

/* ------------------------------------------------------------ encoding */

const hasGzip = typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';

async function encodeData(data) {
  if (data instanceof Blob) return { bytes: new Uint8Array(await data.arrayBuffer()), type: 'application/octet-stream' };
  if (data instanceof ArrayBuffer) return { bytes: new Uint8Array(data), type: 'application/octet-stream' };
  if (ArrayBuffer.isView(data)) return { bytes: new Uint8Array(data.buffer, data.byteOffset, data.byteLength), type: 'application/octet-stream' };
  const text = new TextEncoder().encode(JSON.stringify(data));
  if (!hasGzip) return { bytes: text, type: 'application/json' };
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  return { bytes: new Uint8Array(await new Response(stream).arrayBuffer()), type: 'application/gzip' };
}

async function decodeData(bytes, type) {
  if (!bytes) return null;
  if (type === 'application/octet-stream') return bytes;
  if (type === 'application/gzip') {
    if (!hasGzip) throw new ApiError(0, 'bad_request', 'This browser cannot decompress the save');
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    return JSON.parse(await new Response(stream).text());
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}

async function thumbToBlob(thumb) {
  if (!thumb) return null;
  if (thumb instanceof Blob) return thumb;
  if (typeof thumb === 'string' && thumb.startsWith('data:')) return (await fetch(thumb)).blob();
  throw new ApiError(0, 'bad_request', 'thumb must be a JPEG Blob or data URL');
}

function blobToDataURL(blob) {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result);
    fr.onerror = () => rej(fr.error);
    fr.readAsDataURL(blob);
  });
}

/* --------------------------------------------------------------- cloud */

function cloudMeta(w) {
  return {
    id: w.id, source: 'cloud', owner: w.owner, ownerDisplay: w.ownerDisplay, mine: !!w.mine,
    name: w.name, seed: w.seed, mode: w.mode, public: !!w.public, version: w.version, size: w.size,
    thumbUrl: w.thumb ? `${BASE}worlds/${w.id}/thumb?v=${w.updatedAt}` : null,
    createdAt: w.createdAt, updatedAt: w.updatedAt,
  };
}

const eid = (id) => encodeURIComponent(id);

async function putThumb(id, thumb) {
  const blob = await thumbToBlob(thumb);
  if (!blob) return null;
  return cloudMeta((await request('PUT', `worlds/${eid(id)}/thumb`, { body: blob, type: 'image/jpeg' })).world);
}

const worlds = {
  async listMine() {
    return (await request('GET', 'worlds?scope=mine')).worlds.map(cloudMeta);
  },
  async listPublic() {
    return (await request('GET', 'worlds?scope=public')).worlds.map(cloudMeta);
  },
  async get(id) {
    const meta = cloudMeta((await request('GET', `worlds/${eid(id)}`)).world);
    if (!meta.version) return { meta, data: null };
    const r = await request('GET', `worlds/${eid(id)}/blob`, { raw: true });
    if (r.status === 204) return { meta, data: null };
    const bytes = new Uint8Array(await r.arrayBuffer());
    meta.version = +r.headers.get('X-World-Version') || meta.version;
    return { meta, data: await decodeData(bytes, (r.headers.get('Content-Type') || '').split(';')[0]) };
  },
  async create({ name, seed = '', mode = 'survival', public: pub = false, data, thumb } = {}) {
    let meta = cloudMeta((await request('POST', 'worlds', { json: { name, seed: String(seed), mode, public: !!pub } })).world);
    if (data !== undefined && data !== null) meta = await worlds.save(meta.id, data, 0);
    if (thumb) meta = (await putThumb(meta.id, thumb)) || meta;
    return meta;
  },
  async save(id, data, version, { thumb } = {}) {
    const { bytes, type } = await encodeData(data);
    let meta = cloudMeta((await request('PUT', `worlds/${eid(id)}/blob?version=${version | 0}`, { body: bytes, type })).world);
    if (thumb) meta = (await putThumb(id, thumb)) || meta;
    return meta;
  },
  async patch(id, { name, public: pub } = {}) {
    const json = {};
    if (name !== undefined) json.name = name;
    if (pub !== undefined) json.public = !!pub;
    return cloudMeta((await request('PATCH', `worlds/${eid(id)}`, { json })).world);
  },
  async remove(id) {
    await request('DELETE', `worlds/${eid(id)}`);
  },
};

/* ------------------------------------------------------------- session */

async function me() {
  if (!(await available())) return null;
  try {
    return (await request('GET', 'me')).user || null;
  } catch {
    return null;
  }
}

async function login(username) {
  const name = String(username || '').trim().toLowerCase();
  return (await request('POST', 'login', { json: { username: name } })).user;
}

async function logout() {
  await request('POST', 'logout');
}

async function adminGoogleSignIn() {
  if (!(await available())) throw new ApiError(0, 'offline', 'The world server is not reachable');
  let idToken;
  try {
    const { firebaseConfig, SDK } = await import(AUTH_CONFIG);
    const [{ initializeApp, getApps }, fa] = await Promise.all([
      import(`${SDK}/firebase-app.js`), import(`${SDK}/firebase-auth.js`)]);
    // A named app with in-memory persistence: we only want one ID token and must
    // not disturb the hub's own Firebase session on this origin.
    const app = getApps().find((a) => a.name === 'synthwild-admin') || initializeApp(firebaseConfig, 'synthwild-admin');
    let auth;
    try {
      auth = fa.initializeAuth(app, { persistence: fa.inMemoryPersistence, popupRedirectResolver: fa.browserPopupRedirectResolver });
    } catch {
      auth = fa.getAuth(app);
    }
    const provider = new fa.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    const cred = await fa.signInWithPopup(auth, provider);
    idToken = await cred.user.getIdToken();
    fa.signOut(auth).catch(() => {});
  } catch (e) {
    if (e instanceof ApiError) throw e;
    const c = (e && e.code) || '';
    if (c.includes('popup-blocked')) throw new ApiError(0, 'popup', 'The sign-in popup was blocked');
    if (c.includes('popup-closed') || c.includes('cancelled-popup')) throw new ApiError(0, 'cancelled', 'Sign-in was cancelled');
    throw new ApiError(0, 'server', 'Google sign-in failed: ' + ((e && e.message) || e));
  }
  return (await request('POST', 'admin/google', { json: { idToken } })).user;
}

const admin = {
  async listUsers() {
    return (await request('GET', 'admin/users')).users;
  },
  async addUser(username, display) {
    const name = String(username || '').trim().toLowerCase();
    return (await request('POST', 'admin/users', { json: { username: name, display: display || name } })).user;
  },
  async removeUser(username) {
    await request('DELETE', `admin/users/${encodeURIComponent(String(username).toLowerCase())}`);
  },
};

/* --------------------------------------------------------------- local */

const IDB_NAME = 'synthwild';
let idbP = null;

function idb() {
  if (!idbP) {
    idbP = new Promise((res, rej) => {
      if (typeof indexedDB === 'undefined') return rej(new ApiError(0, 'offline', 'No local storage in this browser'));
      const q = indexedDB.open(IDB_NAME, 1);
      q.onupgradeneeded = () => {
        const d = q.result;
        if (!d.objectStoreNames.contains('worlds')) d.createObjectStore('worlds', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('blobs')) d.createObjectStore('blobs', { keyPath: 'id' });
      };
      q.onsuccess = () => res(q.result);
      q.onerror = () => rej(q.error);
    });
    idbP.catch(() => { idbP = null; });
  }
  return idbP;
}

async function tx(stores, mode, fn) {
  const d = await idb();
  return new Promise((res, rej) => {
    const t = d.transaction(stores, mode);
    let out;
    Promise.resolve(fn(...stores.map((s) => t.objectStore(s)))).then((v) => { out = v; }, rej);
    t.oncomplete = () => res(out);
    t.onerror = () => rej(t.error);
    t.onabort = () => rej(t.error || new Error('aborted'));
  });
}

const reqP = (q) => new Promise((res, rej) => { q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });

function localMeta(rec) {
  const { blobType, thumb, ...m } = rec;
  return { ...m, source: 'local', owner: '', ownerDisplay: 'This device', mine: true, public: false, thumbUrl: thumb || null };
}

function newLocalId() {
  const r = crypto.getRandomValues(new Uint8Array(8));
  return 'l_' + Array.from(r, (b) => b.toString(16).padStart(2, '0')).join('');
}

const local = {
  async list() {
    const recs = await tx(['worlds'], 'readonly', (s) => reqP(s.getAll()));
    return recs.map(localMeta).sort((a, b) => b.updatedAt - a.updatedAt);
  },
  async get(id) {
    const [rec, blob] = await tx(['worlds', 'blobs'], 'readonly', (w, b) => Promise.all([reqP(w.get(id)), reqP(b.get(id))]));
    if (!rec) throw new ApiError(404, 'not_found', 'No such local world');
    return { meta: localMeta(rec), data: blob ? await decodeData(blob.bytes, rec.blobType) : null };
  },
  async put({ id, name, seed = '', mode, data, thumb } = {}) {
    const enc = data !== undefined && data !== null ? await encodeData(data) : null;
    const thumbUrl = thumb ? (typeof thumb === 'string' ? thumb : await blobToDataURL(thumb)) : undefined;
    const now = Date.now();
    return tx(['worlds', 'blobs'], 'readwrite', async (w, b) => {
      const old = id ? await reqP(w.get(id)) : null;
      const rec = old ? { ...old } : { id: id || newLocalId(), name: name || 'New world', seed: String(seed), mode: mode || 'survival',
        version: 0, size: 0, blobType: null, thumb: null, createdAt: now };
      if (name !== undefined && old) rec.name = name;
      if (mode && old) rec.mode = mode;
      if (enc) {
        b.put({ id: rec.id, bytes: enc.bytes });
        rec.blobType = enc.type;
        rec.size = enc.bytes.byteLength;
      }
      if (thumbUrl !== undefined) rec.thumb = thumbUrl;
      rec.version = (rec.version || 0) + 1;
      rec.updatedAt = now;
      w.put(rec);
      return localMeta(rec);
    });
  },
  async remove(id) {
    await tx(['worlds', 'blobs'], 'readwrite', (w, b) => { w.delete(id); b.delete(id); });
  },
};

export const api = {
  available,
  get online() { return availKnown; },
  me, login, logout, adminGoogleSignIn,
  admin, worlds, local,
  isCloud: (meta) => !!meta && meta.source === 'cloud',
  base: BASE,
};

export default api;
