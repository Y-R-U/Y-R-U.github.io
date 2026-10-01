// Runs tools/server_apitest.html in headless Chrome against a throwaway local
// server (which also serves the site statically). Usage: node tools/server_apitest.mjs
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const game = join(here, '..');
const site = join(game, '../../..');
const tmp = mkdtempSync(join(tmpdir(), 'swapi-'));
const PORT = 8097, CDP = 9316;
const base = `http://localhost:${PORT}/gms/3d/synthwild`;
const env = { ...process.env, SYNTHWILD_ADDR: `127.0.0.1:${PORT}`, SYNTHWILD_DATA: join(tmp, 'data'),
  SYNTHWILD_STATIC: site, SYNTHWILD_INSECURE_COOKIE: '1', SYNTHWILD_PUBLIC_URL: base };

const bin = join(tmp, 'synthwild');
execFileSync('go', ['build', '-o', bin, '.'], { cwd: join(game, 'server'), env: { ...process.env, CGO_ENABLED: '0' } });
const srv = spawn(bin, [], { env, stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let code = 1;
try {
  for (let i = 0; i < 50; i++) { try { if ((await fetch(base + '/api/health')).ok) break; } catch {} await sleep(200); }
  const link = execFileSync(bin, ['admin-link', 'aaron@br8t.com'], { env }).toString().trim();
  execFileSync(process.env.HOME + '/.claude/bin/cdp', ['start', '--port', String(CDP)], { stdio: 'ignore' });
  await sleep(1000);
  const tabs = await (await fetch(`http://127.0.0.1:${CDP}/json`)).json();
  const page = tabs.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  let id = 0; const pending = new Map();
  ws.addEventListener('message', (m) => { const d = JSON.parse(m.data); if (pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } });
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Page.navigate', { url: link });
  await sleep(1000);
  await send('Page.navigate', { url: `${base}/tools/server_apitest.html` });
  let res;
  for (let i = 0; i < 60; i++) {
    await sleep(500);
    const r = await send('Runtime.evaluate', { expression: 'JSON.stringify(window.__results||null)', returnByValue: true });
    res = JSON.parse(r.result?.result?.value || 'null');
    if (res?.done) break;
  }
  if (!res) console.log('no results');
  else { console.log(res.lines.join('\n')); console.log(`${res.pass} passed, ${res.fail} failed`); code = res.done && res.fail === 0 ? 0 : 1; }
  ws.close();
} finally {
  try { execFileSync(process.env.HOME + '/.claude/bin/cdp', ['stop', String(CDP)], { stdio: 'ignore' }); } catch {}
  srv.kill();
  rmSync(tmp, { recursive: true, force: true });
}
process.exit(code);
