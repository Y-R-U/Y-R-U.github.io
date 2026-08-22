#!/usr/bin/env node
// Does every 3D game still boot now that `three` is local — and would this script notice if one
// did not?
//
//   node gms/lib/three/verify_boot.mjs                # every game with a local three
//   node gms/lib/three/verify_boot.mjs --only=forge   # one of them
//   node gms/lib/three/verify_boot.mjs --headed
//
// Why it exists. `<script type="importmap">` pointing `three` at a CDN is a latent hang: if that
// one fetch fails the ENTIRE module graph fails to resolve, the game's own error reporting is in a
// module that never evaluated, and `window.onerror` catches nothing. There is no tell — just a
// loading screen forever. Aaron hit it on NEONHAUL after a laptop sleep, and 37 games under
// gms/3d/ had the same importmap.
//
// So the test is not "the page loaded". It is: **with every CDN host blocked and the HTTP cache
// off, does three actually arrive and does the game put something on a canvas.** Blocking is the
// whole point — with the cache on, a CDN block proves nothing, because the file is already local
// and the request never leaves. That mistake passed a null control on this repo once already.
//
// And the falsification: --falsify blocks the LOCAL vendor path too, so three cannot load from
// anywhere. Every game must then FAIL. A run where the falsify arm passes is a broken experiment,
// not a clean bill of health.
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { readFileSync, existsSync, statSync, readdirSync, rmSync } from 'node:fs';
import { join, extname, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const s = a.replace(/^--/, ''), i = s.indexOf('=');
  return i < 0 ? [s, true] : [s.slice(0, i), s.slice(i + 1)];
}));
const HEADED = !!args.headed, FALSIFY = !!args.falsify;
const WAIT = +(args.wait || 12000);

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.glb': 'model/gltf-binary',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.mp4': 'video/mp4',
  '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.bin': 'application/octet-stream' };

const server = createServer((req, rp) => {
  let p = join(SITE, decodeURIComponent(req.url.split('?')[0]));
  if (!existsSync(p) || statSync(p).isDirectory()) p = join(p, 'index.html');
  if (!existsSync(p)) { rp.writeHead(404); return rp.end('404'); }
  rp.writeHead(200, { 'Content-Type': MIME[extname(p)] || 'application/octet-stream',
    'Content-Length': statSync(p).size });
  rp.end(readFileSync(p));
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const PORT = server.address().port;

// ── a minimal CDP client ───────────────────────────────────────────────────
const PROFILE = `/tmp/three-verify-${process.pid}`;
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  HEADED ? '--app=about:blank' : '--headless=new', '--remote-debugging-port=0',
  `--user-data-dir=${PROFILE}`, '--no-first-run', '--no-default-browser-check',
  '--disable-features=Translate', '--window-size=1000,700', 'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'] });

const wsUrl = await new Promise((res, rej) => {
  let buf = '';
  const t = setTimeout(() => rej(new Error('chrome did not report a debug port')), 20000);
  chrome.stderr.on('data', d => {
    buf += d;
    const m = buf.match(/ws:\/\/[^\s]+/);
    if (m) { clearTimeout(t); res(m[0]); }
  });
});

let nextId = 1;
const pending = new Map();
const ws = new WebSocket(wsUrl);
await new Promise(r => ws.addEventListener('open', r));
ws.addEventListener('message', e => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
});
const raw = (method, params, sessionId) => new Promise((res, rej) => {
  const id = nextId++;
  pending.set(id, m => m.error ? rej(new Error(method + ': ' + m.error.message)) : res(m.result));
  ws.send(JSON.stringify({ id, method, params: params || {}, sessionId }));
});

const { targetId } = await raw('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await raw('Target.attachToTarget', { targetId, flatten: true });
const S = (m, p) => raw(m, p, sessionId);
await S('Page.enable'); await S('Runtime.enable'); await S('Network.enable');

// Every CDN any game in this repo reaches for. Blocking the vendor path as well is the falsify arm.
const CDNS = ['*jsdelivr.net*', '*unpkg.com*', '*cdnjs.cloudflare.com*', '*esm.sh*', '*skypack.dev*'];
// The falsify list must cover EVERY shape the VENDOR regex accepts, or a game whose vendor lives
// somewhere else sails through the control and the control quietly stops being one. That is not
// hypothetical: the first run of this arm passed NEONHAUL, whose three is under its own
// `vendor/three/` and was never blocked.
const BLOCK = FALSIFY
  ? [...CDNS, '*/lib/three/*', '*/lib/cannon-es/*', '*/vendor/three/*', '*/vendor/cannon-es/*']
  : CDNS;

// Three things are recorded per navigation. `foreign` is context, not a verdict — a game may
// legitimately reach Firebase or Google Fonts and still be fine. The verdict comes from the other
// two: did the VENDORED library actually arrive, and did anything fail to resolve as a module.
const foreign = [], vend = [], modErr = [];
// NEONHAUL vendors into its OWN folder rather than gms/lib/, so both shapes count.
const VENDOR = /\/(lib|vendor)\/(three|cannon-es)\//;
ws.addEventListener('message', e => {
  const m = JSON.parse(e.data);
  if (m.method === 'Network.requestWillBeSent') {
    const u = m.params.request.url;
    if (/^https?:/.test(u) && !u.startsWith(`http://127.0.0.1:${PORT}`)) foreign.push(u);
  }
  if (m.method === 'Network.responseReceived' && VENDOR.test(m.params.response.url)) {
    vend.push({ url: m.params.response.url, status: m.params.response.status });
  }
  if (m.method === 'Network.loadingFailed' && m.params.type === 'Script') {
    modErr.push('loadingFailed ' + (m.params.errorText || ''));
  }
  if (m.method === 'Runtime.exceptionThrown') {
    const t = m.params.exceptionDetails?.exception?.description
           || m.params.exceptionDetails?.text || '';
    if (/resolve module|dynamically imported module|Failed to fetch|import|Cannot find/i.test(t)) {
      modErr.push(t.split('\n')[0]);
    }
  }
});

const sleep = ms => new Promise(r => setTimeout(r, ms));
const evalJSON = async expr => {
  const r = await S('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  return r.result?.value;
};

// A canvas with real pixels was the first readiness signal and it is NOT usable as the verdict: a
// menu-first game never sizes one unattended, and prismbreak fails it identically on its committed
// CDN build — i.e. that arm was reporting the probe's limitation as a defect in the game. It is
// still collected, because where a game DOES paint it is the strongest evidence there is.
//
// The verdict is the narrower question this change is actually about: **did the vendored library
// arrive, and did the module graph resolve.** That is exactly what breaks when a dependency is
// unreachable, and it is answerable for every game whatever its front end does.
const PROBE = `(() => {
  const cs = [...document.querySelectorAll('canvas')];
  const big = cs.filter(c => c.width > 4 && c.height > 4);
  return { canvases: cs.length, live: big.length,
           w: big[0] ? big[0].width : 0, h: big[0] ? big[0].height : 0,
           three: typeof THREE !== 'undefined' };
})()`;

const games = (args.only ? [args.only] : readdirSync(join(SITE, 'gms/3d')))
  .filter(d => existsSync(join(SITE, 'gms/3d', d, 'index.html')))
  // --only names a game explicitly, so test it whatever its importmap says; the filter is only
  // there to skip games that were never repointed when sweeping the whole directory.
  .filter(d => !!args.only
            || /lib\/three\//.test(readFileSync(join(SITE, 'gms/3d', d, 'index.html'), 'utf8'))
            || d === 'neonhaul');

const rows = [];
for (const g of games) {
  foreign.length = 0; vend.length = 0; modErr.length = 0;
  await S('Page.navigate', { url: 'about:blank' }); await sleep(80);
  await S('Network.setCacheDisabled', { cacheDisabled: true });
  await S('Network.setBlockedURLs', { urls: BLOCK });
  await S('Page.navigate', { url: `http://127.0.0.1:${PORT}/gms/3d/${g}/` });

  let p = null;
  const t0 = Date.now();
  while (Date.now() - t0 < WAIT) {
    p = await evalJSON(PROBE).catch(() => null);
    if (p && p.live > 0 && vend.length) break;
    await sleep(300);
  }
  const bad = vend.filter(v => v.status !== 200);
  const ok = vend.length > 0 && bad.length === 0 && modErr.length === 0;
  const painted = !!(p && p.live > 0);
  rows.push({ g, ok, painted, vend: vend.length, foreign: foreign.length });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${g.padEnd(26)} vendored ${String(vend.length).padStart(2)} `
    + `${bad.length ? `BAD ${bad.map(b => b.status + ' ' + b.url.replace(/^.*\/lib\//, 'lib/')).join(', ')} ` : ''}`
    + `· canvas ${painted ? `${p.w}x${p.h}` : '(not painted unattended)'} · foreign ${foreign.length}`
    + `${modErr.length ? '\n      module error: ' + modErr[0].slice(0, 140) : ''}`);
}

await S('Browser.close').catch(() => {});
try { chrome.kill('SIGKILL'); } catch {}
try { rmSync(PROFILE, { recursive: true, force: true }); } catch {}
server.close();

const bad = rows.filter(r => !r.ok);
const anyForeign = rows.filter(r => r.foreign > 0);
console.log(`\n${rows.length - bad.length}/${rows.length} resolved their vendored libraries with every CDN`
  + ` blocked and the cache off${bad.length ? '  FAILED: ' + bad.map(r => r.g).join(', ') : ''}`);
const painted = rows.filter(r => r.painted).length;
console.log(`${painted}/${rows.length} also painted a canvas unattended`
  + (painted < rows.length ? ' — the rest are menu-first, which is not a defect' : ''));
if (anyForeign.length) console.log(`still reach a foreign origin (fonts/Firebase, not three):`
  + ` ${anyForeign.map(r => r.g).join(', ')}`);

if (FALSIFY) {
  console.log(bad.length === rows.length
    ? '\nFALSIFY OK — with the vendor path blocked, every game fails. The check can see a broken dependency.'
    : `\nFALSIFY BROKEN — ${rows.length - bad.length} game(s) still passed with the vendor path blocked. `
      + 'This script is not measuring what it claims.');
  process.exit(bad.length === rows.length ? 0 : 1);
}
process.exit(bad.length ? 1 : 0);
