// Cloudflare Pages Function — /api/notes
// Keeps KV binding server-side so the frontend never touches storage credentials.
//
// GET  /api/notes?user=username  → returns { items: [...] }
// POST /api/notes?user=username  → body: { items: [...] }, returns { ok: true }
// OPTIONS                        → CORS preflight

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// Username must be 2-30 chars: lowercase letters, digits, hyphens, underscores
const USER_RE = /^[a-z0-9_-]{2,30}$/;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

function badUser() {
  return json({ error: 'Invalid or missing user parameter' }, 400);
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function onRequestGet({ request, env }) {
  const user = new URL(request.url).searchParams.get('user');
  if (!user || !USER_RE.test(user)) return badUser();

  const data = await env.FNOTE_DATA.get(`fnote:${user}`);
  // Return stored data or an empty items array on first use
  return new Response(data || '{"items":[]}', {
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
    return json({ error: 'Invalid JSON body: ' + err.message }, 400);
  }

  await env.FNOTE_DATA.put(`fnote:${user}`, body);
  return json({ ok: true });
}
