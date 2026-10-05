#!/usr/bin/env node
// Checks every media URL in data/packs/*.json and data/music/*.json (or the named packs). Results are cached in tools/.linkcache.json.
// Usage: node tools/linkcheck.mjs [packId…] [--fresh] [--max-age=HOURS] [--concurrency=8] [--json]
// A URL that has failed on two separate runs is marked "mirror" (tools/mirror.mjs picks those up).
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const TOOLS = dirname(fileURLToPath(import.meta.url));
const ROOT = join(TOOLS, '..');
const CACHE = join(TOOLS, '.linkcache.json');
const argv = process.argv.slice(2);
const opt = k => argv.find(a => a.startsWith(`--${k}=`))?.split('=')[1];
const fresh = argv.includes('--fresh');
const maxAgeH = +(opt('max-age') || 72);
const conc = +(opt('concurrency') || 8);
const UA = 'CluedLinkcheck/1.0 (https://y-r-u.github.io/gms/2d/clued/)';

let ids = argv.filter(a => !a.startsWith('--'));
const where = {};
for (const dir of ['packs', 'music']) { try { for (const f of readdirSync(join(ROOT, 'data', dir))) if (f.endsWith('.json') && !f.startsWith('_')) where[f.replace(/\.json$/, '')] = `data/${dir}/${f}`; } catch {} }
if (!ids.length) ids = Object.keys(where);

const cache = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, 'utf8')) : {};
const urls = new Map(); // url -> [where]
function collect(pack, media, where) {
  for (const kind of ['img', 'audio']) for (const m of media?.[kind] || []) {
    if (!m?.src) continue;
    if (!urls.has(m.src)) urls.set(m.src, []);
    urls.get(m.src).push(`${pack}/${where}`);
  }
}
for (const id of ids) {
  const p = JSON.parse(readFileSync(join(ROOT, where[id] || `data/packs/${id}.json`), 'utf8'));
  for (const it of p.items || []) collect(id, it.media, it.id);
  for (const q of p.questions || []) collect(id, q.media, 'q:' + q.id);
}

async function check(url) {
  if (url.startsWith('media/') || url.startsWith('data/')) {
    return { ok: existsSync(join(ROOT, url)), status: existsSync(join(ROOT, url)) ? 200 : 404, ms: 0 };
  }
  const t0 = Date.now();
  const tryOnce = async method => {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 15000);
    try {
      const r = await fetch(url, { method, redirect: 'follow', signal: ctl.signal, headers: { 'User-Agent': UA, ...(method === 'GET' ? { Range: 'bytes=0-2047' } : {}) } });
      if (method === 'GET') await r.body?.cancel().catch(() => {});
      return { status: r.status, type: r.headers.get('content-type') || '' };
    } finally { clearTimeout(timer); }
  };
  let res;
  try {
    res = await tryOnce('HEAD');
    if (res.status >= 400 || res.status === 0) res = await tryOnce('GET');
  } catch (e) {
    try { res = await tryOnce('GET'); } catch (e2) { return { ok: false, status: 0, err: String(e2.name || e2.message), ms: Date.now() - t0 }; }
  }
  const okType = /^(image|audio|video|application\/ogg|binary\/octet-stream|application\/octet-stream)/.test(res.type);
  return { ok: res.status < 400 && okType, status: res.status, type: res.type.split(';')[0], ms: Date.now() - t0 };
}

const todo = [...urls.keys()].filter(u => fresh || !cache[u] || !cache[u].ok || Date.now() - cache[u].t > maxAgeH * 3600e3);
let done = 0;
const queue = [...todo];
const hostT = {};
async function worker() {
  while (queue.length) {
    const u = queue.shift();
    let r = await check(u);
    // 429 = the host is rate-limiting us, not a dead file: back off, and never count it towards "mirror"
    for (let k = 0; r.status === 429 && k < 4; k++) { await new Promise(res => setTimeout(res, 3000 * 2 ** k)); r = await check(u); }
    const prev = cache[u];
    if (r.status === 429) { cache[u] = { ...(prev || {}), ok: prev?.ok ?? false, throttled: true, status: prev?.status ?? 429, t: prev?.t ?? 0 }; if (++done % 100 === 0) process.stderr.write(`  ${done}/${todo.length}\n`); continue; }
    const fails = r.ok ? 0 : (prev && !prev.ok ? (prev.fails || 1) + 1 : 1);
    cache[u] = { ...r, t: Date.now(), fails, ...(fails >= 2 ? { mirror: true } : {}) };
    const h = /^(media|data)\//.test(u) ? 'local' : new URL(u).host;
    (hostT[h] ||= []).push(r.ms);
    if (++done % 100 === 0) process.stderr.write(`  ${done}/${todo.length}\n`);
  }
}
await Promise.all(Array.from({ length: conc }, worker));
writeFileSync(CACHE, JSON.stringify(cache));

const bad = [...urls.keys()].filter(u => !cache[u].ok);
if (argv.includes('--json')) {
  console.log(JSON.stringify({ checked: todo.length, total: urls.size, failures: bad.map(u => ({ url: u, ...cache[u], where: urls.get(u) })) }, null, 1));
} else {
  console.log(`linkcheck: ${urls.size} URLs in ${ids.length} pack(s); checked ${todo.length} now, ${urls.size - todo.length} from cache`);
  for (const [h, ts] of Object.entries(hostT)) {
    ts.sort((a, b) => a - b);
    const med = ts[Math.floor(ts.length / 2)], p95 = ts[Math.floor(ts.length * 0.95)];
    console.log(`  ${h}: ${ts.length} checked, median ${med} ms, p95 ${p95} ms${med > 3000 ? '  ← SLOW' : ''}`);
  }
  for (const u of bad) console.log(`  FAIL ${cache[u].status || cache[u].err} ${cache[u].type || ''} ${cache[u].mirror ? '[mirror]' : '[1st fail]'} ${u}  (${urls.get(u).slice(0, 3).join(', ')})`);
  console.log(bad.length ? `${bad.length} failing URL(s). Run again to confirm, then: node tools/mirror.mjs` : 'all media OK');
}
process.exit(bad.length ? 1 : 0);
