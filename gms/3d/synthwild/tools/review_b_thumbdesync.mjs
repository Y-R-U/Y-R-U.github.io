// R2 reviewer repro: a failed thumbnail upload after a successful blob save leaves the client's version stale,
// so the next save of the same world is a self-inflicted 409 "changed somewhere else".
// Runs the real js/net/api.js in node against a throwaway local server (never production).
//   node tools/review_b_thumbdesync.mjs
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'swb-'));
const bin = path.join(tmp, 'sw');
execFileSync('go', ['build', '-o', bin, '.'], { cwd: path.join(here, '../server'), env: { ...process.env, CGO_ENABLED: '0' } });
const PORT = 8133, ORIGIN = `http://127.0.0.1:${PORT}`;
const env = { ...process.env, SYNTHWILD_ADDR: `127.0.0.1:${PORT}`, SYNTHWILD_DATA: tmp + '/data', SYNTHWILD_INSECURE_COOKIE: '1', SYNTHWILD_PUBLIC_URL: ORIGIN + '/gms/3d/synthwild' };
const srv = spawn(bin, [], { env, stdio: 'ignore' });
try {
  for (let i = 0; i < 50; i++) { try { if ((await fetch(ORIGIN + '/api/health')).ok) break; } catch {} await new Promise((r) => setTimeout(r, 100)); }
  // cookie-jar fetch that maps api.js's file:// BASE onto the local server
  let cookie = '';
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts = {}) => {
    let u = String(url);
    const i = u.indexOf('/gms/3d/synthwild/api/');
    if (i >= 0) u = ORIGIN + u.slice(i); else if (u.startsWith('file:')) u = ORIGIN + '/gms/3d/synthwild/api/' + u.split('/api/')[1];
    const headers = { ...(opts.headers || {}), ...(cookie ? { Cookie: cookie } : {}) };
    const r = await realFetch(u, { ...opts, headers, redirect: 'manual' });
    const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    return r;
  };
  const link = execFileSync(bin, ['admin-link', 'aaron@br8t.com'], { env, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  await fetch(link);
  const { api } = await import(path.join(here, '../js/net/api.js'));
  let meta = await api.worlds.create({ name: 'Desync', seed: 'x' });
  meta = await api.worlds.save(meta.id, { n: 1 }, meta.version);
  console.log('saved v' + meta.version);
  // 2nd save carries a thumbnail the server rejects (any thumb failure: 507 quota, 401, network drop, non-JPEG)
  let err;
  try { await api.worlds.save(meta.id, { n: 2 }, meta.version, { thumb: 'data:image/png;base64,iVBORw0KGgo=' }); } catch (e) { err = e; }
  const server = (await api.worlds.get(meta.id)).meta.version;
  console.log(`save #2 threw ${err?.status} ${err?.code}; client still holds v${meta.version}; server is at v${server} with the new blob`);
  try { await api.worlds.save(meta.id, { n: 3 }, meta.version); console.log('save #3 ok'); }
  catch (e) { console.log(`save #3 (same tab, no other device) -> ${e.status} ${e.code}: "${e.message}"  => the "changed somewhere else" popup`); }
} finally { srv.kill(); fs.rmSync(tmp, { recursive: true, force: true }); }
