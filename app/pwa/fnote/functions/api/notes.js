// Cloudflare Pages Function — /api/notes
// Backed by D1 (SQLite).  Binding name: DB
//
// Table schema (auto-created on first request):
//   notes(web_project TEXT, username TEXT, json_text TEXT, updated_at INTEGER)
//   PRIMARY KEY (web_project, username)
//
// Re-use this endpoint for any web project — just change PROJECT below
// or pass ?project= to make it dynamic in future.
//
// GET  /api/notes?user=<username>  → { items: [...] }
// POST /api/notes?user=<username>  → body: { items: [...] }  → { ok: true }
// OPTIONS                          → CORS preflight

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const USER_RE = /^[a-z0-9_-]{2,30}$/;
const PROJECT = 'fnote';

// Auto-create table if it doesn't exist yet (idempotent)
const CREATE_TABLE = `CREATE TABLE IF NOT EXISTS notes (
  web_project TEXT    NOT NULL,
  username    TEXT    NOT NULL,
  json_text   TEXT    NOT NULL,
  updated_at  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (web_project, username)
)`;

function jsonResp(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

function badUser() {
  return jsonResp({ error: 'Invalid or missing user parameter' }, 400);
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function onRequestGet({ request, env }) {
  const user = new URL(request.url).searchParams.get('user');
  if (!user || !USER_RE.test(user)) return badUser();

  await env.DB.prepare(CREATE_TABLE).run();

  const row = await env.DB
    .prepare('SELECT json_text FROM notes WHERE web_project = ? AND username = ?')
    .bind(PROJECT, user)
    .first();

  return new Response(row?.json_text ?? '{"items":[]}', {
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

export async function onRequestPost({ request, env }) {
  const user = new URL(request.url).searchParams.get('user');
  if (!user || !USER_RE.test(user)) return badUser();

  const body = await request.text();
  try {
    const parsed = JSON.parse(body);
    if (!Array.isArray(parsed.items)) throw new Error('items must be an array');
  } catch (err) {
    return jsonResp({ error: 'Invalid JSON: ' + err.message }, 400);
  }

  await env.DB.prepare(CREATE_TABLE).run();
  await env.DB
    .prepare('INSERT OR REPLACE INTO notes (web_project, username, json_text, updated_at) VALUES (?, ?, ?, ?)')
    .bind(PROJECT, user, body, Date.now())
    .run();

  return jsonResp({ ok: true });
}
