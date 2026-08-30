#!/usr/bin/env node
// Gates for D49 — the shot cutscene never stops on its own, and there is one tap that turns it off
// and back on — plus the ordnance fall-back Aaron asked for in the same message.
//
//   "I wouldn't auto stop animation at all! it should just be an easy toggle to turn off/on."
//   "when a bullet type runs out, auto switch to the infinity bullet."
//
// Every gate that could be wrong in a believable direction has a falsification arm beside it. The
// two that carry the weight:
//
//   C2 measures camera travel and shot length. A probe that reports "it played" for a camera that
//      never left the table would pass this build AND the one that stopped at turn 13. So the same
//      probe runs with cinematics off, where the camera provably does not move, and has to come
//      back under a metre and under two seconds.
//   C4 asserts the armed kind falls back to `shell`. A probe that just reads 'shell' — because the
//      HUD was never on 'heavy' — proves nothing, so the falsify arm fires a heavy with a charge
//      still in the locker and the same read has to come back 'heavy'.
//
//   node tools/gates_pace.mjs            # all gates
//   node tools/gates_pace.mjs --headed   # watch it
//   node tools/gates_pace.mjs --mobile --quick   # the HUD at 390x844, nothing fired
//   node tools/gates_pace.mjs --png      # the HUD in both toggle states, into shots/

import { spawn } from 'node:child_process';
import { existsSync, statSync, createReadStream, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// The importmap resolves `three` to ../../lib/three, which is OUTSIDE the game folder — served
// from the game folder the browser asks for /lib/three and gets a 404, the module graph never
// finishes, and window.__waterline simply never appears.
const SITE = resolve(ROOT, '../..');
const PAGE = '/3d/waterline/index.html';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const s = a.replace(/^--/, ''); const i = s.indexOf('=');
  return i < 0 ? [s, true] : [s.slice(0, i), s.slice(i + 1)];
}));
const PORT = 9331 + (process.pid % 200);
const CDP_PORT = 9531 + (process.pid % 200);
const HEADED = !!args.headed;
// Aaron plays on an Android phone in portrait. A 44 px control that clears a 1280-wide desktop HUD
// can still land under the note strip at 390×844, so the hit test is worth running there too.
const MOBILE = !!args.mobile;
const VW = MOBILE ? 390 : 1280, VH = MOBILE ? 844 : 720;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.glb': 'model/gltf-binary', '.webp': 'image/webp', '.bin': 'application/octet-stream' };

const sleep = ms => new Promise(r => setTimeout(r, ms));
let PROC = null, SERVER = null;

function serve() {
  return new Promise(res => {
    const s = http.createServer((req, rp) => {
      let p = join(SITE, decodeURIComponent(req.url.split('?')[0]));
      if (!existsSync(p) || statSync(p).isDirectory()) p = join(p, 'index.html');
      if (!existsSync(p)) { rp.writeHead(404); return rp.end('404'); }
      rp.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' });
      createReadStream(p).pipe(rp);
    });
    s.listen(PORT, () => res(s));
  });
}

async function chrome() {
  const flags = [
    `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=/tmp/waterline-pace-${process.pid}`,
    `--window-size=${VW},${VH}`, '--no-first-run', '--no-default-browser-check', '--disable-extensions',
    '--enable-unsafe-webgpu', '--ignore-gpu-blocklist',
  ];
  if (HEADED) flags.push('--window-position=2400,80');
  else flags.push('--headless=new', '--use-angle=metal', '--use-gl=angle');
  const proc = spawn(CHROME, flags, { stdio: 'ignore' });
  for (let i = 0; i < 80; i++) {
    try { const r = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`); return { proc, ws: (await r.json()).webSocketDebuggerUrl }; }
    catch { await sleep(150); }
  }
  throw new Error('chrome did not come up');
}

class CDP {
  constructor(url) { this.id = 0; this.pending = new Map(); this.url = url; }
  connect() {
    return new Promise((res, rej) => {
      this.ws = new WebSocket(this.url);
      this.ws.onopen = () => res();
      this.ws.onerror = rej;
      this.ws.onmessage = e => {
        const m = JSON.parse(e.data);
        if (m.id && this.pending.has(m.id)) {
          const { res: r, rej: j } = this.pending.get(m.id);
          this.pending.delete(m.id);
          m.error ? j(new Error(m.error.message)) : r(m.result);
        }
      };
    });
  }
  // Every call gets a deadline. A CDP reply that never arrives used to hang the whole harness with
  // no output at all, which is indistinguishable from "still working" — the worst failure mode a
  // test harness can have.
  send(method, params = {}, sessionId, ms = 30000) {
    const id = ++this.id;
    return new Promise((res, rej) => {
      const t = setTimeout(() => {
        this.pending.delete(id);
        rej(new Error(`${method} did not answer in ${ms} ms`));
      }, ms);
      const done = f => v => { clearTimeout(t); f(v); };
      this.pending.set(id, { res: done(res), rej: done(rej) });
      this.ws.send(JSON.stringify({ id, method, params, sessionId }));
    });
  }
}

const results = [];
function gate(name, ok, detail) {
  results.push({ name, ok: !!ok, detail });
  console.log(`  ${ok ? '✔' : '✘'} ${name}${detail ? '  — ' + detail : ''}`);
}

async function main() {
  SERVER = await serve();
  const { proc, ws } = await chrome();
  PROC = proc;
  const cdp = new CDP(ws);
  await cdp.connect();
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  const S = (m, p, _s, ms) => cdp.send(m, p, sessionId, ms);
  await S('Page.enable'); await S('Runtime.enable');
  await S('Emulation.setDeviceMetricsOverride', { width: VW, height: VH, deviceScaleFactor: 2, mobile: MOBILE });
  if (MOBILE) {
    await S('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await S('Emulation.setEmitTouchEventsForMouse', { enabled: true, configuration: 'mobile' });
    await S('Network.setUserAgentOverride', {
      userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) '
        + 'Chrome/126.0.0.0 Mobile Safari/537.36',
    });
  }
  console.log(`\n${MOBILE ? 'PORTRAIT' : 'LANDSCAPE'} ${VW}×${VH}`);

  const thrown = [];
  cdp.ws.addEventListener('message', e => {
    const m = JSON.parse(e.data);
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails;
      thrown.push(d.exception?.description || d.text);
    }
  });

  // `awaitPromise` on the evaluation itself. A JSON.stringify of a pending promise is `{}`, and
  // that has already been mistaken for a passing result once in this workspace.
  const ev = async expr => {
    // Stringify INSIDE the promise, not around it: JSON.stringify of a pending promise is `{}`,
    // and awaitPromise on an already-stringified value awaits nothing. This exact mistake has been
    // reported as a passing gate in this workspace before.
    const r = await S('Runtime.evaluate', {
      expression: `Promise.resolve(${expr}).then(v => JSON.stringify(v))`,
      returnByValue: true, awaitPromise: true,
    });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value === undefined ? undefined : JSON.parse(r.result.value);
  };

  await S('Page.navigate', { url: `http://127.0.0.1:${PORT}${PAGE}` });
  let up = false;
  for (let i = 0; i < 200; i++) {
    if (await ev(`!!(window.__waterline && window.__waterline.flow && window.__waterline.app)`)) { up = true; break; }
    await sleep(150);
  }
  // Falling through this loop and carrying on is how a harness reports "0 failures" for a page that
  // never booted. It is a hard stop.
  if (!up) throw new Error('the game never booted — ' + (thrown[0] || 'no exception either'));

  // ── the in-page driver ─────────────────────────────────────────────────────────────────────
  await S('Runtime.evaluate', { expression: DRIVER });

  console.log('\n=== C1 — nothing in the pacing table keys off the turn count ===');
  const table = await ev(`__G.paceTable()`);
  const keyed = Object.entries(table).filter(([, c]) => c && typeof c === 'object' && 'fromTurn' in c);
  gate('C1  no tier carries a `fromTurn`', keyed.length === 0,
    keyed.length ? keyed.map(k => k[0]).join(',') : Object.keys(table).join(', '));
  gate('C1  two tiers and a fast-forward, nothing between them',
    JSON.stringify(Object.keys(table)) === JSON.stringify(['full', 'instant', 'fastForward']),
    Object.keys(table).join(', '));

  const reintroduced = await ev(`__G.withAutoDegrade(() => __G.paceTable())`);
  const reKeyed = Object.entries(reintroduced).filter(([, c]) => c && typeof c === 'object' && 'fromTurn' in c);
  gate('C1-falsify  putting a `fromTurn` back turns the same probe red', reKeyed.length > 0,
    reKeyed.map(k => k[0]).join(','));
  const putBack = await ev(`__G.paceTable()`);
  gate('C1-falsify  and the table is put back',
    Object.values(putBack).every(c => !(c && typeof c === 'object' && 'fromTurn' in c)), 'clean');

  // --quick runs the layout and toggle gates without firing anything. The shot gates take a real
  // 7 s cutscene each and are what make a full run slow; this is for checking the HUD at a second
  // viewport, where the button either clears the other controls or it does not.
  if (args.quick) {
    await ev(`__G.start()`);
    await toggleGates(S, ev, gate);
    return finish();
  }

  console.log('\n=== C2 — the shot plays the same on turn 40 as on turn 1 ===');
  await ev(`__G.start()`);
  // The first shot of a session compiles the tracer and impact shaders and runs 2-3x long in
  // headless. Measuring it and comparing it to a later one measures the shader cache, not the pace.
  const warm = await ev(`__G.shot({ cine: 'on', turns: 1, kind: 'shell', r: 0, c: 0 })`);
  console.log(`  (warm-up shot ${Math.round(warm.ms)} ms — not measured)`);

  const t1 = await ev(`__G.shot({ cine: 'on', turns: 1, kind: 'shell', r: 1, c: 1 })`);
  gate('C2  turn 1 leaves the bridge', t1.moved > 50,
    `${t1.moved.toFixed(0)} m of camera travel, present() ${Math.round(t1.ms)} ms`);

  const t40 = await ev(`__G.shot({ cine: 'on', turns: 40, kind: 'shell', r: 3, c: 3 })`);
  gate('C2  turn 40 leaves the bridge too', t40.moved > 50,
    `${t40.moved.toFixed(0)} m of camera travel, present() ${Math.round(t40.ms)} ms`);
  // The two shots are of different cells so the flight is not identical, but the beat structure is,
  // and that is what a degrade would change: it took whole beats out, not milliseconds off them.
  const drift = Math.abs(t40.ms - t1.ms) / Math.max(t1.ms, t40.ms);
  gate('C2  and takes the same time doing it — within 25%', drift < 0.25,
    `${Math.round(t1.ms)} ms vs ${Math.round(t40.ms)} ms (${(drift * 100).toFixed(0)}%)`);

  console.log('\n=== C2-falsify — the same probe, cinematics off ===');
  const off = await ev(`__G.shot({ cine: 'off', turns: 40, kind: 'shell', r: 5, c: 3 })`);
  gate('C2-falsify  reports a still camera', off.moved < 1,
    `${off.moved.toFixed(2)} m — the probe can tell a shot from no shot`);
  gate('C2-falsify  and a short beat', off.ms < 2000 && t1.ms > 4000,
    `${Math.round(off.ms)} ms off vs ${Math.round(t1.ms)} ms on`);

  await toggleGates(S, ev, gate);

  console.log('\n=== C4 — a spent kind falls back to the shell ===');
  const spent = await ev(`__G.lastCharge({ kind: 'heavy', leave: 1, r: 5, c: 5 })`);
  gate('C4  firing the last heavy re-arms the shell', spent.after === 'shell',
    `armed ${spent.before} → ${spent.after}, charges ${spent.chargesBefore} → ${spent.chargesAfter}`);
  gate('C4  the aim ghost follows it down to one cell', spent.ghost === 1, `${spent.ghost} cells`);

  const keeps = await ev(`__G.lastCharge({ kind: 'heavy', leave: 2, r: 1, c: 5 })`);
  gate('C4-falsify  with a charge left the same read stays on heavy', keeps.after === 'heavy',
    `armed ${keeps.before} → ${keeps.after}, charges ${keeps.chargesBefore} → ${keeps.chargesAfter}`);

  gate('X   no exception thrown in the whole run', thrown.length === 0, thrown.slice(0, 2).join(' | ') || 'clean');

  return finish();
}

function finish() {
  const pass = results.filter(r => r.ok).length;
  console.log(`\n${pass}/${results.length} gates${pass === results.length ? ' green' : ' — ' + (results.length - pass) + ' RED'}`);
  cleanup();
  process.exit(pass === results.length ? 0 : 1);
}

async function toggleGates(S, ev, gate) {
  console.log('\n=== C3 — the toggle is one tap in the HUD, and it sticks ===');
    // Start from a known state. The step before this one left cinematics OFF, so a tap here turns
    // them ON — and reading that as "the first tap did nothing" is exactly the wrong conclusion the
    // harness handed back the first time it ran.
    const armed = await ev(`__G.setCine('on')`);
    gate('C3  starts from a known on-state', armed.saved === 'on' && armed.hud === true,
      `save ${armed.saved}, button ${armed.hud}`);
    const box = await ev(`__G.rect('[data-cine]')`);
    gate('C3  the button is on screen and big enough to hit',
      !!box && box.w >= 40 && box.h >= 28 && box.top >= 0, box ? `${Math.round(box.w)}×${Math.round(box.h)} px` : 'not found');
    const top = await ev(`__G.topAt('[data-cine]')`);
    gate('C3  and it is what a tap at its own centre hits', top.found && top.mine,
      `hit ${top.hit}, pointer-events ${top.pointer}, bar opacity ${top.opacity}`);

    const off1 = await tap(S, ev, box);
    const afterOff = await ev(`__G.cineState()`);
    gate('C3  one tap turns it off, in the HUD and in the save',
      off1 && afterOff.saved === 'off' && afterOff.hud === false && afterOff.pace === 'instant',
      `save ${afterOff.saved}, button ${afterOff.hud}, pace ${afterOff.pace}`);

    if (args.png) {
      mkdirSync(resolve(ROOT, 'shots'), { recursive: true });
      await grab(S, resolve(ROOT, 'shots', `hud_cine_off${MOBILE ? '_m' : ''}.png`));
    }

    const on1 = await tap(S, ev, box);
    const afterOn = await ev(`__G.cineState()`);
    if (args.png) await grab(S, resolve(ROOT, 'shots', `hud_cine_on${MOBILE ? '_m' : ''}.png`));
    gate('C3  and the next tap turns it back on',
      on1 && afterOn.saved === 'on' && afterOn.hud === true && afterOn.pace === 'full',
      `save ${afterOn.saved}, button ${afterOn.hud}, pace ${afterOn.pace}`);

    const legacy = await ev(`__G.legacyAuto()`);
    gate('C3  a save written before D49 (cine: "auto") plays the shot',
      legacy.pace === 'full' && legacy.hud === true, `pace ${legacy.pace}, button ${legacy.hud}`);
}


const DRIVER = String.raw`
window.__G = (() => {
  const w = () => window.__waterline;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const until = async (fn, ms = 60000) => {
    const t0 = performance.now();
    while (performance.now() - t0 < ms) { if (fn()) return true; await sleep(60); }
    throw new Error('timed out waiting');
  };
  const cfg = () => import('./js/config.js');
  const SET = c => ({ cine: c, place: 'auto', sound: false, flyout: 'off', hideFleet: false });

  return {
    async paceTable() { const m = await cfg(); return JSON.parse(JSON.stringify(m.PACE)); },

    // Put auto-degrade back the way it was before D49 and run the probe against it. The module
    // object is live, so this is the real table the game reads, not a copy of it.
    async withAutoDegrade(fn) {
      const m = await cfg();
      m.PACE.full.fromTurn = 1; m.PACE.instant.fromTurn = 13;
      try { return await fn(); }
      finally { delete m.PACE.full.fromTurn; delete m.PACE.instant.fromTurn; }
    },

    // What the compositor would hand the tap. A control that answers .click() but is under an
    // overlay is a control the player cannot reach.
    topAt(sel) {
      const el = document.querySelector(sel);
      if (!el) return { found: false };
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return {
        found: true,
        mine: !!(hit && (hit === el || el.contains(hit))),
        hit: hit ? (hit.tagName.toLowerCase() + '.' + (hit.className || '').toString().split(' ')[0]) : 'nothing',
        pointer: getComputedStyle(el).pointerEvents,
        opacity: getComputedStyle(el.closest('.hud-top') || el).opacity,
      };
    },

    rect(sel) {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return null;
      return { x: r.x, y: r.y, w: r.width, h: r.height, top: r.top };
    },

    cineState() {
      const g = w();
      return {
        saved: g.save.get('settings', {}).cine,
        hud: g.ui.hud.cine,
        pace: g.flow.pace(),
      };
    },

    setCine(v) {
      const g = w();
      g.save.set('settings', SET(v));
      g.ui.hud.setCine(v !== 'off');
      return this.cineState();
    },

    async start() {
      const g = w();
      g.save.set('settings', SET('on'));
      g.flow.quick(false);
      await until(() => g.flow.screen() === 'play' && g.flow.game && g.flow.game.phase === 'AIM');
      await until(() => !g.flow.flow.busy && g.flow.game.sideToMove === 0);
      return true;
    },

    // One shot, with the camera sampled every frame for the whole of present().
    async shot({ cine, turns, kind = 'shell', r = 1, c = 1 }) {
      const g = w();
      await until(() => !g.flow.flow.busy && g.flow.game.sideToMove === 0);
      g.flow.game.turns = turns;
      g.save.set('settings', SET(cine));
      g.ui.hud.setCine(cine !== 'off');

      const cam = g.app.camera;
      const home = cam.position.clone();
      let moved = 0, raf = 0, ms = 0, seen = null, t0 = 0, sampling = true;
      const tick = () => {
        if (!sampling) return;
        moved = Math.max(moved, cam.position.distanceTo(home));
        raf = requestAnimationFrame(tick);
      };

      // Instrument exactly ONE present() and stop with it. beat() starts the ENEMY's beat
      // synchronously inside nextTurn(), before the await on fire() resolves — so a patch that
      // stays installed until fire() returns times the enemy's shot instead of yours, and the
      // camera samples run on into it. Both readings stay believable while measuring the wrong
      // shot, which is the failure mode hardest to spot.
      const orig = g.cine.present;
      let taken = false;
      g.cine.present = async (events, opts) => {
        if (taken) return orig.call(g.cine, events, opts);
        taken = true;
        seen = opts && opts.pace;
        t0 = performance.now();
        try { return await orig.call(g.cine, events, opts); }
        finally { ms = performance.now() - t0; t0 = 0; sampling = false; cancelAnimationFrame(raf); }
      };
      raf = requestAnimationFrame(tick);
      try {
        g.flow.aimAt(r, c, kind);
        await g.flow.fire();
      } finally {
        sampling = false;
        cancelAnimationFrame(raf);
        g.cine.present = orig;
      }
      await until(() => !g.flow.flow.busy && g.flow.game.sideToMove === 0).catch(() => {});
      return { moved, ended: cam.position.distanceTo(home), ms, pace: seen };
    },

    // Split so the harness can capture frames WHILE the shot runs. --png only.
    async begin(opts) { this._p = this.shot(opts); this._p.catch(() => {}); return true; },
    async end() { return await this._p; },
    async quiet() { const g = w(); await until(() => !g.flow.flow.busy && g.flow.game.sideToMove === 0); return true; },

    // A save written before D49 held cine: 'auto'. Anything that is not 'off' plays the shot.
    async legacyAuto() {
      const g = w();
      g.save.set('settings', SET('auto'));
      g.ui.hud.setCine(g.save.get('settings', {}).cine !== 'off');
      const st = this.cineState();
      g.save.set('settings', SET('on'));
      g.ui.hud.setCine(true);
      return st;
    },

    // Fire a charged kind with N charges in the locker and report what stays armed.
    async lastCharge({ kind, leave, r, c }) {
      const g = w();
      await until(() => !g.flow.flow.busy && g.flow.game.sideToMove === 0);
      g.save.set('settings', SET('off'));
      g.sim.game().players[0].charges[kind] = leave;
      g.ui.hud.arm(kind);
      const before = g.ui.hud.kind;
      const chargesBefore = g.sim.game().players[0].charges[kind];
      g.flow.aimAt(r, c, kind);
      await g.flow.fire();
      await until(() => !g.flow.flow.busy && g.flow.game.sideToMove === 0).catch(() => {});
      // What the NEXT tap actually puts on the table — read off the HUD's own readout, which is
      // written from the cells the aim module painted, not from the kind we hoped it kept.
      g.flow.aimAt(r + 1, c, null);
      const read = (document.querySelector('[data-target]') || {}).textContent || '';
      const ghost = +(read.match(/(\d+)\s+cell/) || [0, 0])[1];
      return {
        before, after: g.ui.hud.kind, ghost,
        chargesBefore, chargesAfter: g.sim.game().players[0].charges[kind],
      };
    },
  };
})();
`;

// Page.captureScreenshot can sit forever in headless when the compositor is mid-cutscene — it hung
// this harness twice. A diagnostic is not allowed to stop the gates: it gets a deadline and a skip.
async function grab(S, path) {
  const shot = await S('Page.captureScreenshot', { format: 'png' }, undefined, 8000).catch(() => null);
  if (!shot) { console.log(`  (screenshot timed out — ${path} skipped)`); return false; }
  writeFileSync(path, Buffer.from(shot.data, 'base64'));
  return true;
}

// A real pointer at the button's own coordinates. `element.click()` fires the handler even when the
// control is under an overlay, which is exactly the bug a HUD gate exists to catch.
async function tap(S, ev, box) {
  if (!box) return false;
  const was = (await ev(`__G.cineState()`)).saved;
  const x = Math.round(box.x + box.w / 2), y = Math.round(box.y + box.h / 2);
  if (MOBILE) {
    // A real finger. With setEmitTouchEventsForMouse on, Input.dispatchMouseEvent goes through a
    // translation layer that swallowed the call outright — the harness sat there for ten minutes.
    await S('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    await S('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } else {
    // Hover first. Without a mouseMoved at the point, Chrome's very first synthetic press of a
    // session has no hover target and is dropped — which reads exactly like a dead button.
    await S('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none' });
    for (const type of ['mousePressed', 'mouseReleased']) {
      await S('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
    }
  }
  // Poll for the change rather than sleeping a guessed interval. A fixed sleep that is too short
  // reads the state BEFORE the handler ran and reports the tap as a no-op; one that is too long
  // hides a tap that never landed.
  for (let i = 0; i < 25; i++) {
    if ((await ev(`__G.cineState()`)).saved !== was) return true;
    await sleep(60);
  }
  return false;
}

function cleanup() { try { PROC?.kill(); } catch {} try { SERVER?.close(); } catch {} }
process.on('exit', cleanup);
main().catch(e => { console.error('\nharness failed:', e.message); cleanup(); process.exit(2); });
