// Cloudflare Pages Function — /api/notes
// Backed by D1 (SQLite) with gzip compression.
//
// Bindings:
//   DB — D1 database (required)
//
// D1 json_text column holds one of:
//   "gz:<base64>"        — gzip-compressed payload, base64-encoded
//   '{"items":[...]}'    — legacy uncompressed JSON (auto-migrates on next write)
//
// The client always sends gzip-compressed binary (Content-Type: application/octet-stream)
// and always receives gzip-compressed binary back.
//
// GET  /api/notes?user=<username>  → compressed gzip bytes
// POST /api/notes?user=<username>  → compressed gzip bytes body → { ok: true }
// OPTIONS                          → CORS preflight

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const USER_RE    = /^[a-z0-9_-]{2,30}$/;
const PROJECT    = 'fnote';
const MAX_SIZE   = 1.9 * 1024 * 1024;  // 1.9 MB compressed limit

const CREATE_TABLE = `CREATE TABLE IF NOT EXISTS notes (
  web_project TEXT    NOT NULL,
  username    TEXT    NOT NULL,
  json_text   TEXT    NOT NULL,
  updated_at  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (web_project, username)
)`;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function jsonResp(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

function binaryResp(bytes) {
  return new Response(bytes, {
    headers: { ...CORS, 'Content-Type': 'application/octet-stream' },
  });
}

function badUser() {
  return jsonResp({ error: 'Invalid or missing user parameter' }, 400);
}

async function gzCompress(text) {
  const cs = new CompressionStream('gzip');
  const writer = cs.writable.getWriter();
  writer.write(new TextEncoder().encode(text));
  writer.close();
  return new Uint8Array(await new Response(cs.readable).arrayBuffer());
}

async function gzDecompress(bytes) {
  const ds = new DecompressionStream('gzip');
  const writer = ds.writable.getWriter();
  writer.write(bytes);
  writer.close();
  return new Response(ds.readable).text();
}

function uint8ToBase64(bytes) {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + chunk, bytes.length)));
  }
  return btoa(binary);
}

function base64ToUint8(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// ─── CORS preflight ──────────────────────────────────────────────────────────

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}

// ─── GET — return compressed gzip bytes ──────────────────────────────────────

export async function onRequestGet({ request, env }) {
  const user = new URL(request.url).searchParams.get('user');
  if (!user || !USER_RE.test(user)) return badUser();

  await env.DB.prepare(CREATE_TABLE).run();

  const row = await env.DB
    .prepare('SELECT json_text FROM notes WHERE web_project = ? AND username = ?')
    .bind(PROJECT, user)
    .first();

  // No data yet — return compressed empty payload
  if (!row?.json_text) {
    return binaryResp(await gzCompress('{"items":[]}'));
  }

  const data = row.json_text;

  // ── gz:base64 (compressed, stored inline in D1) ──
  if (data.startsWith('gz:')) {
    return binaryResp(base64ToUint8(data.slice(3)));
  }

  // ── Legacy uncompressed JSON — compress on the fly ──
  if (data.startsWith('{') || data.startsWith('[')) {
    return binaryResp(await gzCompress(data));
  }

  // Unknown format — treat as empty
  return binaryResp(await gzCompress('{"items":[]}'));
}

// ─── POST — accept compressed gzip bytes (or legacy JSON) ────────────────────

export async function onRequestPost({ request, env }) {
  const user = new URL(request.url).searchParams.get('user');
  if (!user || !USER_RE.test(user)) return badUser();

  const ct = (request.headers.get('Content-Type') || '').toLowerCase();
  let compressed;

  if (ct.includes('octet-stream')) {
    // New path: client sent gzip-compressed binary
    compressed = new Uint8Array(await request.arrayBuffer());

    // Validate by decompressing
    try {
      const json = await gzDecompress(compressed);
      const parsed = JSON.parse(json);
      if (!Array.isArray(parsed.items)) throw new Error('items must be an array');
    } catch (err) {
      return jsonResp({ error: 'Invalid compressed payload: ' + err.message }, 400);
    }
  } else {
    // Legacy path: client sent plain JSON text — compress it
    const body = await request.text();
    try {
      const parsed = JSON.parse(body);
      if (!Array.isArray(parsed.items)) throw new Error('items must be an array');
    } catch (err) {
      return jsonResp({ error: 'Invalid JSON: ' + err.message }, 400);
    }
    compressed = await gzCompress(body);
  }

  // ── Enforce size limit ──
  if (compressed.length > MAX_SIZE) {
    const sizeMB = (compressed.length / (1024 * 1024)).toFixed(2);
    return jsonResp({
      error: `Payload too large: ${sizeMB} MB exceeds the 1.9 MB limit`,
    }, 413);
  }

  await env.DB.prepare(CREATE_TABLE).run();

  // Store compressed bytes as base64 in D1
  const encoded = 'gz:' + uint8ToBase64(compressed);

  await env.DB
    .prepare('INSERT OR REPLACE INTO notes (web_project, username, json_text, updated_at) VALUES (?, ?, ?, ?)')
    .bind(PROJECT, user, encoded, Date.now())
    .run();

  return jsonResp({ ok: true, compressedBytes: compressed.length });
}
