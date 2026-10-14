#!/usr/bin/env node
/**
 * Destructive and reset paths, and the review fixes around them (lane GF, 2026-10-15):
 *   node    SaveSync "keep this device" after a conflict found by flush(); checkout/portal
 *           behind an HTML 502; audioSession 'playback' + an 'interrupted' AudioContext resumed
 *   source  ERASE is two-step and absent from the fight's pause panel; NEW GAME and ERASE keep
 *           settings and repaint the theme; spaces type into inputs; a refused fullscreen is
 *           quiet and unsupported fullscreen hides both buttons; backgrounding pauses a campaign
 *           fight and the music; blur drops held keys; another tab's save is adopted; the shop's
 *           ticker stops when it closes; the canvas backing store is capped
 *   home    (a home build against fixtures) a paying player is never parked at boot or while
 *           the answer is unknown; a definitive no parks, a later yes walks back; a failed
 *           purchase probe is retried; outage copy once payments have been seen; ?checkout= stripped
 *
 *   node tools/resetgate.mjs [--only node,source,home]
 *   node tools/resetgate.mjs --falsify     each mutant (a fix reverted in a copy) must go red
 */
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import { CDP } from './cdp.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const GAME = resolve(HERE, '..');
const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const ROOT = resolve(opt('--root') || GAME);
const ONLY = (opt('--only') || 'node,source,home').split(',');
const PORT = +(opt('--port') || 9783);

if (args.includes('--falsify')) {
  const M = [
    ['node', 'js/save-sync.js', 'this.remoteRevision = remote?.revision || null;\n        this.conflict', 'this.conflict'],
    ['node', 'js/purchases.js', "'checkout', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ product, game: 'ragdojo', ...analytics }) });\n    // A proxy's HTML error page is not JSON; its parse error is not a message for a player.\n    const data = await res.json().catch(() => ({}));", "'checkout', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ product, game: 'ragdojo', ...analytics }) });\n    const data = await res.json();"],
    ['node', 'js/audio.js', "ctx.state === 'suspended' || ctx.state === 'interrupted'", "ctx.state === 'suspended'"],
    ['node', 'js/audio.js', "if (navigator.audioSession) navigator.audioSession.type = 'playback';", ''],
    ['source', 'js/main.js', "$('btnWipe').classList.toggle('hidden', mode === 'fight');", ''],
    ['source', 'js/main.js', '  if (Date.now() > armWipe) {', '  if (false) {'],
    ['source', 'js/main.js', '  sheetLevel = -1;\n  applySettings();\n  overlay(null);', '  sheetLevel = -1;\n  overlay(null);'],
    ['source', 'js/main.js', 'settings: { ...DEFAULT().settings, ...S.settings }, musicOff', 'musicOff'],
    ['source', 'js/input.js', "t.tagName === 'INPUT' ||", 'false &&'],
    ['source', 'js/main.js', '    p?.catch?.(() => {});\n', ''],
    ['source', 'js/main.js', "for (const id of ['btnFull', 'btnFullBoot']) $(id).classList.toggle('hidden', !canFull);", ''],
    ['source', 'js/main.js', '    audio.suspend?.();\n', ''],
    ['source', 'js/main.js', "!document.querySelector('.panel-screen.show')) openSettings();", "!document.querySelector('.panel-screen.show')) {}"],
    ['source', 'js/input.js', "window.addEventListener('blur', () => { this.keys = {}; });", ''],
    ['source', 'js/main.js', "  if (mode !== 'fight') { applyCloud(); refreshHub(); }\n});", '});'],
    ['source', 'js/main.js', "  for (const s of SCREENS) $(s).classList.toggle('show', s === name);\n  if (name !== 'shop') stopShopTicker();", "  for (const s of SCREENS) $(s).classList.toggle('show', s === name);"],
    ['source', 'js/main.js', "  if (name !== 'shop') stopShopTicker();\n  $('pauseBtn').classList.toggle('hidden', !!name", "  $('pauseBtn').classList.toggle('hidden', !!name"],
    ['source', 'js/main.js', '  dpr = Math.min(dpr, Math.sqrt(MAX_PIXELS / Math.max(1, vw * vh)));', ''],
    ['home', 'js/main.js', '  if (!isPaid(S.theme) || hasPremium() || !entKnown) return;', '  if (!isPaid(S.theme) || hasPremium()) return;'],
    ['home', 'js/main.js', "      else if (unparkPaid() && mode === 'hub') startDemo();\n", ''],
    ['home', 'js/main.js', '  if (paymentsUp === false) await probePayments(false);\n', ''],
    ['home', 'js/main.js', 'return localStorage.getItem(PAY_SEEN) ? DOWN : SOON;', 'return SOON;'],
    ['home', 'js/main.js', "  u.searchParams.delete('checkout');", ''],
  ];
  let red = 0;
  M.forEach(([only, file, from, to], i) => {
    const dir = mkdtempSync(join(tmpdir(), 'resetgate-'));
    try {
      for (const f of ['js', 'css', 'index.html']) cpSync(join(GAME, f), join(dir, f), { recursive: true });
      symlinkSync(join(GAME, 'assets'), join(dir, 'assets'));
      const p = join(dir, file), src = readFileSync(p, 'utf8');
      if (src.split(from).length !== 2) { console.log(`MUTANT ${i + 1} does not apply (${file}): ${from.slice(0, 60)}`); return; }
      writeFileSync(p, src.replace(from, to));
      const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--root', dir, '--only', only], { encoding: 'utf8', timeout: 240000 });
      const first = (r.stdout + r.stderr).split('\n').find((l) => l.startsWith('FAIL')) || '(no FAIL line)';
      if (r.status !== 0) red++;
      console.log(`${r.status !== 0 ? 'RED  ' : 'GREEN'} mutant ${i + 1} [${only}] ${file}: ${from.split('\n')[0].trim().slice(0, 60)}\n      ${first}`);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  console.log(`\n--falsify: ${red}/${M.length} mutants red`);
  process.exit(red === M.length ? 0 : 1);
}

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { c ? pass++ : fail++; console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`); };
const mod = (rel) => import(pathToFileURL(join(ROOT, rel)).href + '?t=' + Date.now());

// ── node ────────────────────────────────────────────────────────────────────
if (ONLY.includes('node')) {
  const { SaveSync } = await mod('js/save-sync.js');
  let server = { revision: 'r0', save: { level: 3, wins: 3 } };
  const write = async (uid, data, expected) => { if ((server?.revision ?? null) !== expected) throw new Error('CAS'); server = structuredClone(data); };
  let local = { revision: 'r0', owner: 'u', save: { level: 3, wins: 3 } };
  const s = new SaveSync({ local: () => local, empty: () => ({}), read: async () => structuredClone(server), write,
    adopt: (d) => { local = d; }, status: () => {}, conflict: () => {} });
  await s.connect('u');
  local = { revision: 'rA', owner: 'u', save: { level: 4, wins: 4 } }; s.changed();
  server = { revision: 'rB', owner: 'u', save: { level: 9, wins: 9 } };
  await s.flush();
  ok('flush() finds the other device\'s save', !!s.conflict);
  await s.choose('local');
  ok('KEEP THIS DEVICE then writes this device\'s save', !s.conflict && server.revision === 'rA', `server ${server.revision}`);

  const { Purchases } = await mod('js/purchases.js');
  const auth = { signedIn: true, user: { uid: 'u' }, getIdToken: async () => 'tok' };
  const html502 = async () => new Response('<html><body>502 Bad Gateway</body></html>', { status: 502, headers: { 'content-type': 'text/html' } });
  const p = new Purchases(auth, html502);
  for (const fn of ['checkout', 'portal']) {
    const msg = await p[fn]('ragdojo_supporter').then(() => 'resolved', (e) => e.message);
    ok(`${fn}() behind an HTML 502 says something a player can read`, !/JSON|token|Unexpected/i.test(msg), JSON.stringify(msg));
  }

  let resumed = 0;
  class FakeNode { connect() {} }
  class FakeAC {
    constructor() { this.state = 'interrupted'; this.sampleRate = 8000; this.currentTime = 0; this.destination = {}; }
    createGain() { return Object.assign(new FakeNode(), { gain: { value: 1 } }); }
    createBuffer(c, n) { return { getChannelData: () => new Float32Array(n) }; }
    resume() { resumed++; this.state = 'running'; return Promise.resolve(); }
  }
  const session = { type: 'auto' };
  globalThis.window = { AudioContext: FakeAC };
  Object.defineProperty(globalThis, 'navigator', { value: { audioSession: session }, configurable: true });
  const audio = await mod('js/audio.js');
  audio.init();
  ok('iOS audio session is set to playback (silent switch)', session.type === 'playback', session.type);
  audio.resume();
  ok("an 'interrupted' AudioContext is resumed", resumed === 1, `resume calls ${resumed}`);
}

// ── a server for the browser groups ─────────────────────────────────────────
const PREFIX = '/gms/2d/ragdojo/';
const fx = { owned: true, apiDown: false, hits: { offer: 0, entitlement: 0 }, saves: new Map() };
const MIME = { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.mp3': 'audio/mpeg', '.json': 'application/json', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.png': 'image/png', '.webp': 'image/webp' };
const authModule = `const listeners=new Set();let uid=localStorage.getItem('fixture_uid');export const auth={get user(){return uid?{uid,anon:false}:null},get signedIn(){return !!uid},ready:async()=>auth.user,getIdToken:async()=>uid,onChange(fn){listeners.add(fn);fn(auth.user);return()=>listeners.delete(fn)}};`;
const cloudModule = `export const cloud={game(){return {async loadForUser(uid){const r=await fetch('/fixture/save?uid='+uid);if(!r.ok)throw Error('offline');return r.json()},async saveForUser(uid,data,revision){const r=await fetch('/fixture/save?uid='+uid,{method:'POST',body:JSON.stringify({data,revision})});if(!r.ok)throw Error('conflict')}}}}`;
const uiModule = `export function mountAccount(){};export function matchCompleted(){}`;
async function serveGame(homeOut) {
  const srv = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    const json = (st, d) => { res.writeHead(st, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(d)); };
    if (url.pathname === '/fixture/save') {
      const uid = url.searchParams.get('uid');
      if (req.method === 'POST') { let b = ''; for await (const c of req) b += c; const { data, revision } = JSON.parse(b); if ((fx.saves.get(uid)?.revision || null) !== revision) return json(409, {}); fx.saves.set(uid, data); return json(200, {}); }
      return json(200, fx.saves.get(uid) || null);
    }
    if (url.pathname === '/api/br8t/offer') { fx.hits.offer++; return fx.apiDown ? json(503, { error: 'down' }) : json(200, { testMode: true, items: [{ key: 'ragdojo_supporter', currency: 'aud', amount: 199 }] }); }
    if (url.pathname === '/api/br8t/entitlement') {
      fx.hits.entitlement++;
      if (fx.apiDown) return json(503, { error: 'down' });
      const alice = req.headers.authorization === 'Bearer alice';
      return json(200, { testMode: true, entitlements: { ragdojo_supporter: alice && fx.owned, br8t_pass: false }, pass: null });
    }
    const mods = { '/lib/auth/auth.js': authModule, '/lib/auth/cloud.js': cloudModule, '/lib/auth/ui.js': uiModule };
    if (mods[url.pathname]) { res.writeHead(200, { 'content-type': 'text/javascript', 'cache-control': 'no-store' }); res.end(mods[url.pathname]); return; }
    if (!url.pathname.startsWith(PREFIX)) { res.writeHead(404); res.end(); return; }
    const rel = url.pathname.slice(PREFIX.length) || 'index.html';
    const f = homeOut && rel.startsWith('js/') ? join(homeOut, rel) : join(ROOT, rel);
    const st = await stat(f).catch(() => null);
    if (!st?.isFile()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': MIME[extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(await readFile(f));
  });
  await new Promise((r) => srv.listen(PORT, '127.0.0.1', r));
  return { base: `http://127.0.0.1:${PORT}${PREFIX}`, close: () => srv.close() };
}
async function browser() {
  const c = await CDP.launch();
  await c.send('Network.setCacheDisabled', { cacheDisabled: true });
  await c.viewport(900, 460, 1, true);
  return c;
}
const LS = (o) => `localStorage.setItem('ragdojo.save.v2', ${JSON.stringify(JSON.stringify(o))})`;
const saved = (c) => c.eval(`JSON.parse(localStorage.getItem('ragdojo.save.v2') || 'null')`);
const shown = (id) => `(e => !!e && !e.classList.contains('hidden') && e.offsetParent !== null)(document.getElementById('${id}'))`;
const appHas = (cls) => `document.getElementById('app').classList.contains('${cls}')`;

// ── source (DEV) ────────────────────────────────────────────────────────────
if (ONLY.includes('source')) {
  const srv = await serveGame(null);
  const c = await browser();
  try {
    await c.send('Page.addScriptToEvaluateOnNewDocument', { source: `
      window.__media = new Set(); const op = HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play = function () { __media.add(this); return op.call(this); };
      window.__cb = 0; const raf = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = (cb) => raf((t) => { window.__cb++; cb(t); });` });
    const DARK = { theme: 'dark', everWon: true, darkUnlocked: true, completed: true, level: 30, ink: 9000,
      settings: { music: false, sfx: true, shake: false, haptics: true, hand: 'left', gore: false }, musicOff: { dfight2: true },
      stash: { light: { level: 44, completed: true } } };
    const boot = async (q = '') => {
      await c.goto(srv.base + 'index.html?dpr=1');
      await c.eval(`localStorage.clear(); ${LS(DARK)}`);
      await c.goto(srv.base + 'index.html?dpr=1&auto=1' + q);
      return c.waitFor(`window.__ragdojo && document.querySelector('#hub.show')`, 20000);
    };

    // ERASE
    ok('boots to the hub in DARK', await boot() && await c.eval(appHas('dark')));
    await c.eval(`document.getElementById('btnSettings').click()`);
    ok('ERASE is offered from the hub settings', await c.eval(shown('btnWipe')));
    await c.eval(`document.getElementById('btnWipe').click()`);
    ok('one tap on ERASE erases nothing', (await saved(c)).level === 30 && (await c.eval(`document.getElementById('btnWipe').textContent`)).startsWith('SURE'));
    await c.eval(`document.getElementById('btnWipe').click()`);
    await c.frames(4);
    let s = await saved(c);
    ok('the second tap erases', s.level === 0 && s.ink === 0 && s.theme === 'light' && !s.darkUnlocked);
    ok('ERASE keeps settings and muted tracks', s.settings.hand === 'left' && s.settings.music === false && s.musicOff.dfight2 === true, JSON.stringify(s.settings));
    ok('ERASE repaints the page in LIGHT', !(await c.eval(appHas('dark'))) && !(await c.eval(appHas('night'))) && !(await c.eval(`document.body.classList.contains('dark')`)));
    await c.eval(`__ragdojo.startFight(3)`);
    await c.frames(5);
    await c.eval(`document.getElementById('btnPause').click()`);
    await c.frames(3);
    ok('the fight\'s pause panel has QUIT and no ERASE', await c.eval(shown('btnQuit')) && !(await c.eval(shown('btnWipe'))));
    await c.eval(`document.getElementById('btnQuit').click()`);

    // NEW GAME
    await boot();
    await c.eval(`document.getElementById('btnTrophy').click()`);
    ok('NEW GAME copy says what it wipes', /ink/i.test(await c.eval(`document.getElementById('vicFine').textContent`)));
    await c.eval(`document.getElementById('btnAgain').click(); document.getElementById('btnAgain').click()`);
    await c.frames(4);
    s = await saved(c);
    ok('NEW GAME keeps settings and muted tracks', s.settings.hand === 'left' && s.settings.shake === false && s.settings.gore === false && s.musicOff.dfight2 === true, JSON.stringify(s.settings));
    ok('NEW GAME repaints the page in LIGHT', !(await c.eval(appHas('dark'))) && !(await c.eval(`document.body.classList.contains('dark')`)));
    ok('NEW GAME keeps the stick on the chosen side', await c.eval(`__input.hand`) === 'left');

    // typing, keys, storage
    await c.eval(`document.getElementById('btnSettings').click()`);
    if (await c.eval(`!!document.getElementById('giftCode')`)) {
      await c.eval(`document.getElementById('giftCode').focus()`);
      for (const ch of 'AB CD') {
        const code = ch === ' ' ? 'Space' : 'Key' + ch;
        await c.send('Input.dispatchKeyEvent', { type: 'keyDown', key: ch, text: ch, code, windowsVirtualKeyCode: ch.charCodeAt(0) });
        await c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: ch, code, windowsVirtualKeyCode: ch.charCodeAt(0) });
      }
      ok('a space types into the Pass code box', await c.eval(`document.getElementById('giftCode').value`) === 'AB CD');
    } else ok('the Pass code box exists', false);
    await c.eval(`document.getElementById('btnSetClose').click(); document.activeElement && document.activeElement.blur()`);
    await c.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'd', code: 'KeyD', windowsVirtualKeyCode: 68 });
    const held = await c.eval(`!!__input.keys.d`);
    await c.eval(`window.dispatchEvent(new Event('blur'))`);
    ok('a held key is dropped when the window loses focus', held && !(await c.eval(`!!__input.keys.d`)));
    await c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'd', code: 'KeyD', windowsVirtualKeyCode: 68 });
    await c.eval(`(() => { const s = JSON.parse(localStorage.getItem('ragdojo.save.v2')); s.level = 7; s.ink = 4321; const v = JSON.stringify(s);
      localStorage.setItem('ragdojo.save.v2', v); dispatchEvent(new StorageEvent('storage', { key: 'ragdojo.save.v2', newValue: v })); })()`);
    await c.frames(2);
    ok('another tab\'s newer save is adopted, not overwritten', await c.eval(`__ragdojo.save.level === 7 && __ragdojo.save.ink === 4321`));

    // the shop's ticker
    const perSec = async () => { const a = await c.eval('__cb'); await sleep(1500); return ((await c.eval('__cb')) - a) / 1.5; };
    const base = await perSec();
    await c.eval(`document.getElementById('btnShop').click()`); await sleep(400);
    await c.eval(`document.getElementById('btnShopClose').click()`);
    const after = await perSec();
    ok('the shop\'s animation stops when the shop closes', after < base * 1.4, `rAF/s ${base.toFixed(0)} -> ${after.toFixed(0)}`);
    await c.eval(`document.getElementById('btnShop').click()`); await sleep(400);
    await c.eval(`__ragdojo.startFight(2)`);
    const fight = await perSec();
    ok('and when a fight replaces it', fight < base * 1.4, `rAF/s ${base.toFixed(0)} -> ${fight.toFixed(0)}`);
    await c.eval(`document.getElementById('btnPause').click(); document.getElementById('btnQuit').click()`);

    // backgrounded mid-fight
    await c.eval(`__ragdojo.startFight(5)`);
    await sleep(800);
    const vis = (hidden) => c.eval(`(() => { Object.defineProperty(document, 'hidden', { get: () => ${hidden}, configurable: true });
      Object.defineProperty(document, 'visibilityState', { get: () => '${hidden ? 'hidden' : 'visible'}', configurable: true });
      document.dispatchEvent(new Event('visibilitychange')); })()`);
    await c.eval(`(async () => { const m = await import('./js/audio.js'); m.setMusic(true); m.play('fight1', true); })()`);
    await sleep(600);
    const playing = () => c.eval(`[...__media].filter(a => !a.paused).length`);
    const before = await playing();
    await vis(true);
    await c.frames(2);
    ok('backgrounding a campaign fight opens the pause panel', await c.eval(`document.getElementById('settings').classList.contains('show')`));
    ok('backgrounding stops the music', before > 0 && (await playing()) === 0, `playing ${before} -> ${await playing()}`);
    await vis(false);
    await sleep(500);
    ok('coming back resumes the music', (await playing()) > 0);
    await c.eval(`document.getElementById('btnQuit').click()`);

    // fullscreen refused
    await c.eval(`Element.prototype.requestFullscreen = function () { return Promise.reject(new TypeError('Permissions check failed')); }`);
    await c.eval(`document.getElementById('btnFull').click()`);
    await sleep(400);
    ok('a refused fullscreen is not a boot failure', await c.eval(`document.getElementById('bootfail').classList.contains('hidden')`));

    // backing store cap
    await c.viewport(1366, 1024, 2, true);
    await c.goto(srv.base + 'index.html?auto=1');
    await c.waitFor(`document.querySelector('#hub.show')`, 20000);
    const px = await c.eval(`document.getElementById('game').width * document.getElementById('game').height`);
    ok('the canvas backing store is capped at 3.5 MP', px <= 3.5e6 + 4000, `${(px / 1e6).toFixed(2)} MP`);
    await c.viewport(900, 460, 1, true);

    // no fullscreen at all (iPhone)
    const { identifier } = await c.send('Page.addScriptToEvaluateOnNewDocument', { source: `for (const k of ['fullscreenEnabled', 'webkitFullscreenEnabled']) Object.defineProperty(Document.prototype, k, { get: () => false, configurable: true });` });
    await c.goto(srv.base + 'index.html?dpr=1');
    await c.waitFor(`!document.getElementById('startBtn').classList.contains('hidden')`, 20000);
    ok('no fullscreen support: both ⛶ buttons are hidden', await c.eval(`document.getElementById('btnFull').classList.contains('hidden') && document.getElementById('btnFullBoot').classList.contains('hidden')`));
    await c.send('Page.removeScriptToEvaluateOnNewDocument', { identifier });

    ok('no console errors (source)', c.errors.length === 0, c.errors.slice(0, 3).join(' | '));
  } finally { c.close(); srv.close(); }
}

// ── home build against fixtures ─────────────────────────────────────────────
if (ONLY.includes('home')) {
  const out = mkdtempSync(join(tmpdir(), 'resetgate-home-'));
  const { build } = await import(pathToFileURL(join(GAME, 'node_modules/esbuild/lib/main.js')).href);
  await build({ entryPoints: { 'js/main': join(ROOT, 'js/main.js') }, outdir: out, splitting: true, chunkNames: 'js/chunks/[name]-[hash]',
    bundle: true, format: 'esm', target: ['es2022'], external: ['/lib/auth/*'], define: { __RAGDOJO_EDITION__: '"home"' }, logLevel: 'error' });
  const srv = await serveGame(out);
  const c = await browser();
  const CYBER = { theme: 'cyborg', everWon: true, completed: true, darkUnlocked: true, thugWon: true, level: 12, wins: 12,
    stash: { dark: { level: 44, wins: 40 }, light: { level: 44, wins: 44 } } };
  const start = async (q = '') => {
    await c.goto(srv.base + q);
    if (!await c.waitFor(`!document.getElementById('startBtn').classList.contains('hidden')`, 20000)) return false;
    await c.eval(`document.getElementById('startBtn').click()`);
    return c.waitFor(`document.querySelector('#hub.show')`, 8000);
  };
  const focus = () => c.eval(`dispatchEvent(new Event('focus'))`);
  const always = async (expr, ms) => { const until = Date.now() + ms; while (Date.now() < until) { if (!await c.eval(expr)) return false; await sleep(100); } return true; };
  try {
    await c.goto(srv.base);
    await c.eval(`localStorage.clear(); localStorage.setItem('fixture_uid', 'alice'); ${LS(CYBER)}`);
    fx.owned = true; fx.apiDown = false;
    ok('home build boots signed in', await start());
    ok('a paying player is never parked out of CYBER at boot', await always(appHas('cyborg'), 3500));
    ok('the entitlement was actually checked', fx.hits.entitlement >= 1, `${fx.hits.entitlement} checks`);
    ok('and the save still says CYBER', (await saved(c)).theme === 'cyborg');

    fx.owned = false;
    await focus();
    ok('a definitive "not entitled" parks CYBER at the hub', await c.waitFor(`${appHas('dark')} && !${appHas('cyborg')}`, 8000));
    ok('the park remembers where it came from', (await saved(c))?.parkedFrom === 'cyborg');
    fx.owned = true;
    await focus();
    ok('a later yes walks back into CYBER', await c.waitFor(appHas('cyborg'), 8000));
    ok('and forgets the park', !(await saved(c))?.parkedFrom);

    await c.goto(srv.base + '?checkout=cancel');
    await c.waitFor(`!document.getElementById('startBtn').classList.contains('hidden')`, 20000);
    await sleep(800);
    ok('?checkout= is stripped once handled', !(await c.eval('location.search')).includes('checkout'), await c.eval('location.search'));

    fx.apiDown = true;
    const e0 = fx.hits.entitlement;
    ok('boots with the purchase API down', await start());
    ok('an unknown answer parks nothing', await always(appHas('cyborg'), 3000));
    await c.eval(`document.getElementById('btnUpgrade').click()`);
    ok('an outage after payments were seen says "temporarily unavailable"', await c.waitFor(`/temporarily unavailable/i.test(document.getElementById('purchaseStatus').textContent)`, 6000),
      await c.eval(`document.getElementById('purchaseStatus').textContent`));
    await c.eval(`document.getElementById('btnPremiumClose').click()`);
    ok('no entitlement requests while the API is down', fx.hits.entitlement === e0);
    fx.apiDown = false;
    await sleep(21000);
    await focus();
    ok('a failed probe is retried later, and ownership is checked', await (async () => { for (let i = 0; i < 40; i++) { if (fx.hits.entitlement > e0) return true; await sleep(150); } return false; })(), `${fx.hits.entitlement - e0} checks`);
    ok('no console errors (home)', c.errors.length === 0, c.errors.slice(0, 3).join(' | '));
  } finally { c.close(); srv.close(); rmSync(out, { recursive: true, force: true }); }
}

console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
