// Lane 7: the smoke against production in a FRESH Chrome profile, plus deploy parity and an API round trip.
//   node tools/qa_live.mjs [--url URL] [--only mobile|desktop] [--quick] [--strict] [--no-browser]
//   QA_USER=<existing username> node tools/qa_live.mjs   → also logs in, lists worlds, logs out (never creates anything)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runSmoke, printTable, parseArgs } from './qa_smoke.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GAME = path.resolve(HERE, '..');
const SITE = path.resolve(GAME, '../../..');
const a = parseArgs(process.argv.slice(2));
const noBrowser = process.argv.includes('--no-browser');
const BASE = (a.url || 'https://games.br8t.com/gms/3d/synthwild/').replace(/\/?$/, '/');
const results = [];
const add = (name, status, detail = '') => { results.push({ vp: 'live', name, status, detail: String(detail) }); console.log(`  [live] ${status.padEnd(4)} ${name}${detail ? ' — ' + detail : ''}`); };
const T = (ms) => AbortSignal.timeout(ms);

console.log(`SYNTHWILD live → ${BASE}`);

// ---- API
try {
  const r = await fetch(BASE + 'api/health', { signal: T(10000) });
  const j = await r.json().catch(() => null);
  add('api/health', r.status === 200 && j?.ok === true && j?.name === 'synthwild' ? 'PASS' : 'FAIL', `HTTP ${r.status} ${JSON.stringify(j)}`);
} catch (e) { add('api/health', 'FAIL', e.message); }
try {
  const r = await fetch(BASE + 'api/me', { signal: T(10000) });
  const j = await r.json().catch(() => null);
  const ok = (r.status === 200 && j && j.user === null) || r.status === 401;
  add('api/me anonymous', ok ? 'PASS' : 'FAIL', `HTTP ${r.status} ${JSON.stringify(j)} cache-control=${r.headers.get('cache-control')}`);
} catch (e) { add('api/me anonymous', 'FAIL', e.message); }
try {
  const r = await fetch(BASE + 'api/worlds?scope=mine', { signal: T(10000) });
  add('api/worlds needs a session', r.status === 401 ? 'PASS' : 'FAIL', `anonymous → HTTP ${r.status}`);
} catch (e) { add('api/worlds needs a session', 'FAIL', e.message); }
if (process.env.QA_USER) {
  try {
    const r = await fetch(BASE + 'api/login', { method: 'POST', headers: { 'content-type': 'application/json', origin: new URL(BASE).origin }, body: JSON.stringify({ username: process.env.QA_USER }), signal: T(10000) });
    const cookie = (r.headers.get('set-cookie') || '').split(';')[0];
    const me = await (await fetch(BASE + 'api/me', { headers: { cookie }, signal: T(10000) })).json();
    const w = await fetch(BASE + 'api/worlds?scope=mine', { headers: { cookie }, signal: T(10000) });
    const wj = await w.json().catch(() => null);
    await fetch(BASE + 'api/logout', { method: 'POST', headers: { cookie, origin: new URL(BASE).origin }, signal: T(10000) });
    const after = await (await fetch(BASE + 'api/me', { headers: { cookie }, signal: T(10000) })).json();
    const ok = r.status === 200 && me?.user?.username === process.env.QA_USER && w.status === 200 && Array.isArray(wj?.worlds) && after?.user === null;
    add('api login round trip', ok ? 'PASS' : 'FAIL', `login ${r.status}, me ${me?.user?.username}, worlds ${w.status} (${wj?.worlds?.length}), after logout ${JSON.stringify(after)}`);
  } catch (e) { add('api login round trip', 'FAIL', e.message); }
} else add('api login round trip', 'SKIP', 'set QA_USER=<an existing username> to run it (never creates users on prod)');

// ---- deploy parity: every local client file (what deploy.sh ships) + every vendored three file it imports
const localFiles = [];
(function walk(dir, rel = '') {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const r = rel + e.name;
    if (e.name.startsWith('.') || /^(docs|server|tools)$/.test(r) || /\.md$/.test(e.name)) continue;
    if (e.isDirectory()) walk(path.join(dir, e.name), r + '/'); else localFiles.push(r);
  }
})(GAME);
const libFiles = new Set();
for (const f of localFiles.filter((f) => /\.(js|html)$/.test(f))) {
  const src = fs.readFileSync(path.join(GAME, f), 'utf8');
  for (const m of src.matchAll(/["'`]((?:\.\.\/)+lib\/[^"'`]+?\.(?:js|mjs))["'`]/g)) {
    const abs = path.resolve(path.dirname(path.join(GAME, f)), m[1]);
    if (abs.startsWith(SITE)) libFiles.add(path.relative(SITE, abs));
  }
  for (const m of src.matchAll(/["']three\/addons\/([^"']+)["']/g)) libFiles.add('gms/lib/three/0.180.0/addons/' + m[1]);
}
// addons import each other relatively; follow them one level at a time
const seen = new Set();
const queue = [...libFiles];
while (queue.length) {
  const f = queue.pop();
  if (seen.has(f)) continue;
  seen.add(f);
  const abs = path.join(SITE, f);
  if (!fs.existsSync(abs)) continue;
  for (const m of fs.readFileSync(abs, 'utf8').matchAll(/from\s+["'](\.{1,2}\/[^"']+)["']/g)) {
    const dep = path.relative(SITE, path.resolve(path.dirname(abs), m[1]));
    if (!seen.has(dep)) { libFiles.add(dep); queue.push(dep); }
  }
}
const origin = new URL(BASE).origin;
const urls = [...localFiles.map((f) => [f, BASE + f]), ...[...libFiles].map((f) => [f, origin + '/' + f])];
const missing = [], missingLocal = [...libFiles].filter((f) => !fs.existsSync(path.join(SITE, f)));
let i = 0;
await Promise.all(Array.from({ length: 8 }, async () => {
  while (i < urls.length) {
    const [f, u] = urls[i++];
    try { const r = await fetch(u, { method: 'HEAD', signal: T(15000) }); if (r.status >= 400) missing.push(`${r.status} ${f}`); } catch (e) { missing.push(`ERR ${f}`); }
  }
}));
add('deploy parity', missing.length || missingLocal.length ? 'FAIL' : 'PASS',
  `${localFiles.length} client + ${libFiles.size} lib files checked` + (missing.length ? `; NOT DEPLOYED (${missing.length}): ${missing.slice(0, 12).join(', ')}` : '') +
  (missingLocal.length ? `; imported but missing even locally: ${missingLocal.join(', ')}` : ''));

// ---- the browser smoke, fresh profile (cdp start wipes /tmp/cdp-<port>)
let smoke = [];
if (!noBrowser) {
  const liveIndex = await fetch(BASE + 'index.html', { method: 'HEAD', signal: T(10000) }).then((r) => r.status).catch(() => 0);
  const localIndex = fs.existsSync(path.join(GAME, 'index.html'));
  if (liveIndex === 404 && !localIndex && !a.strict) add('browser smoke', 'SKIP', 'no index.html locally or live yet');
  else {
    if (liveIndex !== 200) add('live index.html', 'FAIL', `HTTP ${liveIndex}${localIndex ? ' but it exists locally: client not deployed (run server/deploy.sh)' : ''}`);
    smoke = await runSmoke({ ...a, url: BASE, port: a.port || 9318, outDir: path.join(HERE, 'qa_out', 'live'), expectBad: [], missingOk: false });
  }
}

const all = [...results, ...smoke];
const fails = printTable(all, 'SYNTHWILD live');
fs.mkdirSync(path.join(HERE, 'qa_out', 'live'), { recursive: true });
fs.writeFileSync(path.join(HERE, 'qa_out', 'live', 'results.json'), JSON.stringify({ url: BASE, at: new Date().toISOString(), results: all }, null, 1));
process.exit(fails ? 1 : 0);
