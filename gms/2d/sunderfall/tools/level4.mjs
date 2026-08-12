#!/usr/bin/env node
/**
 * Movement-four route tests. Raw CDP, real input through `input.setAction`, no
 * puppeteer. A route nobody has walked a headless player down is not a route.
 *
 *   node tools/level4.mjs walk     # 7400 -> arena centre after openGate
 *   node tools/level4.mjs seal     # sealArena vs 20s of jump-spam + hold-back
 *   node tools/level4.mjs tear     # collectArena size + tearArena phases 2,3,4
 *   node tools/level4.mjs shots    # screenshots, both orientations
 *   node tools/level4.mjs all
 *
 * --enable-unsafe-swiftshader --use-gl=angle are the flags that work here, and
 * every URL carries &nosave or the run inherits the last one's progress.
 */

import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = 'http://localhost:8888/gms/2d/sunderfall/game/index.html';
const OUT = 'docs/shots';

class CDP {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); this.handlers = new Map(); }
  static async attach(port) {
    let list;
    for (let i = 0; i < 80; i++) {
      try { list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); } catch { list = null; }
      if (list?.some(t => t.type === 'page')) break;
      await sleep(200);
    }
    const page = list?.find(t => t.type === 'page');
    if (!page) throw new Error('no page target');
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    const c = new CDP(ws);
    ws.onmessage = ev => {
      const m = JSON.parse(ev.data);
      if (m.id && c.pending.has(m.id)) {
        const { res, rej } = c.pending.get(m.id);
        c.pending.delete(m.id);
        m.error ? rej(new Error(m.error.message)) : res(m.result);
      } else if (m.method) (c.handlers.get(m.method) || []).forEach(fn => fn(m.params));
    };
    return c;
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((res, rej) => {
      this.pending.set(id, { res, rej });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  on(method, fn) {
    if (!this.handlers.has(method)) this.handlers.set(method, []);
    this.handlers.get(method).push(fn);
  }
  async ev(expr) {
    const r = await this.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result?.value;
  }
}

const PRELUDE = `
window.__t = {
  get ctx() { return window.__sunderfall; },
  get w() { return window.__sunderfall.world; },
  get p() { return window.__sunderfall.world.player; },
  get scene() { return window.__sunderfall.scenes.current; },
  get marks() { return window.__sunderfall.scenes.current.marks; },
  put(x, y) {
    const p = this.p, w = this.w;
    const gy = w.groundY(x, (y === undefined ? w.groundAt(x) : y) - 900, 3000);
    const fy = (isNaN(gy) ? w.groundAt(x) : gy) - p.h * 0.5 - 4;
    p.x = x; p.px = x; p.y = fy; p.py = fy; p.vx = 0; p.vy = 0;
    w.cam.x = x; w.cam.y = fy - 200;
    return { x: p.x, y: p.y };
  },
  hold(a, on) { this.ctx.input.setAction(a, on); },
  free() { this.ctx.input.releaseAll(); },
  /**
   * SF-ACT's state machine and SF-STORY's runner both take control away at
   * scripted x positions, which is correct in the game and fatal to a route
   * test — the walk would stop dead at the stones cutscene. Stand them down and
   * hand movement back every poll.
   */
  quiet() {
    try { if (this.ctx.act) this.ctx.act.update = () => {}; } catch (e) { /* not landed yet */ }
    const s = this.scene;
    try { if (s && s.story && s.story.playing && s.story.skip) s.story.skip(); } catch (e) { /* ditto */ }
    // Anything modal freezes the sim (main.js gates on ui.blocked). During the
    // boss test the Seam's own beam kills its adds, Rook banks the xp, the spell
    // offer opens and the world stops dead — which reads exactly like a hung
    // level. Dismiss whatever is up and carry on.
    try {
      const ui = this.ctx.ui;
      if (ui && ui.paused) ui.setPaused(false);
      for (const el of document.querySelectorAll('.sf-modal')) el.hidden = true;
      if (ui && ui.onPointerDown) ui.onPointerDown(-9999, -9999);
    } catch (e) { /* ui not up yet */ }
    this.w.playerControl = true;
    this.w.camLock = false;
  },
  snap() {
    const p = this.p, w = this.w;
    return { x: p.x, y: p.y, vx: p.vx, vy: p.vy, ground: !!p.onGround, state: p.data && p.data.state, hp: p.hp };
  },
  /** every 60px across a span: is there ground, and how far below the reference */
  floor(x0, x1, ref) {
    const w = this.w, out = [];
    for (let x = x0; x <= x1; x += 60) {
      const g = w.groundY(x, ref - 1400, 3400);
      out.push(Number.isFinite(g) ? Math.round(g) : null);
    }
    return out;
  },
};
window.__t.ready = new Promise(res => {
  if (window.__sunderfall && window.__sunderfall.world && window.__sunderfall.world.player) return res(1);
  window.__sunderfall.bus.on('sim:ready', () => setTimeout(() => res(1), 200));
});
'ok'`;

async function boot(cdp, url, size = [1440, 900]) {
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: size[0], height: size[1], deviceScaleFactor: 1, mobile: size[0] < 700,
    screenWidth: size[0], screenHeight: size[1],
  });
  await cdp.send('Page.navigate', { url });
  await new Promise(res => {
    const t = globalThis.setTimeout(res, 20000);
    cdp.on('Page.loadEventFired', () => { clearTimeout(t); res(); });
  });
  for (let i = 0; i < 100; i++) {
    const ok = await cdp.ev('!!(window.__sunderfall && window.__sunderfall.world && window.__sunderfall.world.player && window.__sunderfall.scenes && window.__sunderfall.scenes.current && window.__sunderfall.scenes.current.marks)').catch(() => false);
    if (ok) break;
    await sleep(200);
  }
  await cdp.ev(PRELUDE);
  await cdp.ev('__t.quiet(); 1');
  await sleep(400);
  await cdp.ev('__t.quiet(); 1');
}

const URL_PLAIN = `${BASE}?nointro&nosave&autostart&scene=play&noenemies&dpr=1`;
const URL_FIGHT = `${BASE}?nointro&nosave&autostart&scene=play&dpr=1`;

/* ------------------------------------------------------------------ */

async function testWalk(cdp) {
  await boot(cdp, URL_PLAIN);
  await cdp.ev(`__t.put(7400); __t.w.openGate(); 1`);
  await sleep(600);

  const samples = [];
  let wallFrames = 0, stalled = 0, lastX = 7400, minY = 1e9, maxY = -1e9;
  await cdp.ev(`__t.hold('right', true); 1`);
  const t0 = Date.now();
  while (Date.now() - t0 < 70000) {
    const s = await cdp.ev(`__t.quiet(); __t.p.invuln = 9; __t.snap()`);
    samples.push(s);
    if (s.state === 'wall') wallFrames++;
    minY = Math.min(minY, s.y); maxY = Math.max(maxY, s.y);
    if (s.x - lastX < 6) stalled++; else stalled = 0;
    lastX = s.x;
    if (s.x >= 10300) break;
    if (stalled > 24) break;          // 6 seconds of going nowhere
    await sleep(250);
  }
  await cdp.ev(`__t.free(); 1`);
  const last = samples[samples.length - 1];
  const pitY = await cdp.ev('__t.w.pitY');

  const pass = last.x >= 10300 && wallFrames === 0 && maxY < pitY;
  console.log(`[walk] end x=${last.x.toFixed(0)} y=${last.y.toFixed(0)}  wall-frames=${wallFrames}  maxY=${maxY.toFixed(0)} (pit ${pitY})  stalledSamples=${stalled}`);
  if (!pass) {
    console.log('       trail:', samples.filter((_, i) => i % 4 === 0).map(s => `${s.x | 0}/${s.y | 0}`).join(' '));
  }
  return pass;
}

async function testSeal(cdp) {
  await boot(cdp, URL_PLAIN);
  const info = await cdp.ev(`__t.put(9700); __t.w.sealArena(); JSON.stringify({x: __t.p.x, seal: __t.marks.seal.x})`);
  await sleep(500);
  console.log('[seal] ' + info);

  // The exploit input: hold back into the wall and hammer jump.
  await cdp.ev(`__t.hold('left', true); 1`);
  let minX = 1e9, minY = 1e9, escaped = false;
  const t0 = Date.now();
  let n = 0;
  while (Date.now() - t0 < 20000) {
    await cdp.ev(`__t.quiet(); __t.hold('jump', ${n % 2 === 0}); __t.p.invuln = 9; 1`);
    n++;
    const s = await cdp.ev('__t.snap()');
    minX = Math.min(minX, s.x); minY = Math.min(minY, s.y);
    if (s.x < 9560) { escaped = true; break; }
    await sleep(90);
  }
  await cdp.ev(`__t.free(); 1`);
  const end = await cdp.ev('__t.snap()');
  console.log(`[seal] after 20s: x=${end.x.toFixed(0)} y=${end.y.toFixed(0)}  minX=${minX.toFixed(0)} highest y=${minY.toFixed(0)}  escaped=${escaped}`);

  /**
   * Stage two: the only other way out is along the brow's underside to its east
   * face at 10260 and over the top. A wall jump is above its launch height for
   * ~0.6s and covers ~350px in that time; the brow is 720px deep, so this
   * should never get high enough at the far end to catch it.
   */
  await cdp.ev(`__t.hold('left', false); __t.hold('right', true); 1`);
  let overBrow = 0;
  const t1 = Date.now();
  while (Date.now() - t1 < 12000) {
    await cdp.ev(`__t.quiet(); __t.hold('jump', ${n % 2 === 0}); __t.p.invuln = 9; 1`);
    n++;
    const s = await cdp.ev('__t.snap()');
    if (s.y < -1360) overBrow = Math.max(overBrow, s.x);
    await sleep(90);
  }
  await cdp.ev(`__t.free(); 1`);
  const end2 = await cdp.ev('__t.snap()');
  console.log(`[seal] ceiling run: furthest east while above the brow line = ${overBrow.toFixed(0)} (face is at 10260)  end x=${end2.x.toFixed(0)}`);
  return !escaped && end.x > 9560 && end2.x > 9560 && overBrow < 10200;
}

async function testTear(cdp) {
  await boot(cdp, URL_FIGHT);
  const setup = await cdp.ev(`
    (() => {
      const w = __t.w, m = __t.marks, s = __t.scene;
      s.director.clear(); s.director.setIntensity(0);
      __t.put(10300);
      const b = s.director.spawnBoss(m.arena.bossX, m.arena.bossY, m.arena);
      b.team = 0;
      w.__boss = b;
      return JSON.stringify({ props: b.data.arenaProps.length, arena: m.arena.x + '/' + m.arena.y + ' ' + m.arena.w + 'x' + m.arena.h, bossY: Math.round(m.arena.bossY) });
    })()`);
  console.log('[tear] ' + setup);
  const collected = JSON.parse(setup).props;

  // The Seam kills the test subject in about eight seconds otherwise, and every
  // measurement after that is taken on a rebuilt world with a corpse in it.
  const alive = `(() => {
    __t.quiet();
    const b = __t.w.__boss;
    // Flip the Seam onto the player's team: it still shifts phase on hp, still
    // tears the arena and still chews the floor, but it cannot kill the test
    // subject. Left hostile it kills him inside ten seconds and every reading
    // after that is taken on a corpse in a rebuilt world.
    if (b) b.team = 0;
    __t.scene.director.clear();
    const p = __t.p; p.invuln = 99; p.hp = p.maxHp; p.killed = false; p.dead = false;
    if (p.data && p.data.state === 'dead') p.data.state = 'idle';
    return JSON.stringify({ boss: !!(b && b.alive), pAlive: !!p.alive, phase: b ? b.data.bossPhase : -1, hpf: b ? +(b.hp / b.maxHp).toFixed(2) : -1, px: Math.round(p.x) });
  })()`;

  const ref = await cdp.ev('__t.w.groundAt(10300)');
  const baseF = JSON.parse(await cdp.ev(`JSON.stringify(__t.floor(9640, 11120, ${ref}))`));

  const results = [];
  let seenDown = 0;
  for (const [phase, frac] of [[2, 0.70], [3, 0.42], [4, 0.15]]) {
    await cdp.ev(`(() => { const b = __t.w.__boss; b.hp = b.maxHp * ${frac}; return 1; })()`);
    // 16s: the shift is 2.4s, the collapse delays run to ~0.15+n*0.13, and a
    // prop that is off camera holds its timer for up to 8s before it goes.
    let last = '';
    for (let i = 0; i < 64; i++) { last = await cdp.ev(alive); await sleep(250); }
    const state = await cdp.ev(`
      (() => {
        const d = __t.w.__boss.data;
        let live = 0, down = 0;
        for (const p of d.arenaProps) {
          if (!p) continue;
          if (p.state === 'settled' || p.state === 'gone' || p.state === 'falling' || p.state === 'shattering' || p.collapseIn >= 0) down++;
          else live++;
        }
        return JSON.stringify({ phase: d.bossPhase, live, down });
      })()`);
    const f = JSON.parse(await cdp.ev(`JSON.stringify(__t.floor(9640, 11120, ${ref}))`));
    let gaps = 0, worst = 0;
    for (let i = 0; i < f.length; i++) {
      if (f[i] === null) { gaps++; continue; }
      worst = Math.max(worst, Math.abs(f[i] - baseF[i]));
    }
    // Walk it, do not just measure it: 5s of holding right from the west end of
    // the floor has to still cross the arena.
    // Right, with a jump pulse: by phase four the floor is craters and settled
    // rubble and that is the point — "walkable" has to mean a player can cross
    // it, not that it is still flat.
    await cdp.ev(`__t.quiet(); __t.put(9660, __t.w.groundAt(9660) + 60); 1`);
    for (let i = 0; i < 26; i++) {
      await cdp.ev(`${alive}; __t.hold('right', true); __t.hold('jump', ${i % 3 === 0}); 1`);
      await sleep(300);
    }
    const moved = await cdp.ev(`__t.free(); __t.snap()`);
    const r = { phase, ...JSON.parse(state), gaps, worst, walkedTo: Math.round(moved.x), y: Math.round(moved.y), boss: last };
    results.push(r);
    console.log(`[tear] ${JSON.stringify(r)}`);
    seenDown = r.down;
    await cdp.ev(`__t.put(10300); 1`);
  }

  const walkable = results.every(r => r.gaps === 0 && r.walkedTo > 10600);
  const staged = results[0].down > 6 && results[1].down > results[0].down && results[2].down > results[1].down;
  const phases = results.every((r, i) => r.phase === i + 2);
  console.log(`[tear] collected=${collected} (need >=30)  walkable=${walkable}  phasesReached=${phases}  fourStages=${staged}`);
  void seenDown;
  return collected >= 30 && walkable && staged && phases;
}

async function shot(cdp, size, name, setup) {
  await boot(cdp, URL_PLAIN, size);
  await cdp.ev('__t.quiet(); ' + setup);
  await sleep(700);
  await cdp.ev('__t.quiet(); 1');
  await sleep(900);
  const url = await cdp.ev(`new Promise(res => requestAnimationFrame(() => requestAnimationFrame(() => {
    const c = document.querySelector('canvas'); res(c ? c.toDataURL('image/png') : null);
  })))`);
  if (!url) { console.log('[shot] no canvas'); return; }
  mkdirSync(OUT, { recursive: true });
  const file = `${OUT}/${name}_${size[0]}x${size[1]}.png`;
  writeFileSync(file, Buffer.from(url.slice(url.indexOf(',') + 1), 'base64'));
  console.log('[shot] ' + file);
}

async function testShots(cdp) {
  const spots = [
    ['m4-approach', `__t.w.openGate(); __t.put(8180); 1`],
    ['m4-glade', `__t.put(8790); 1`],
    ['m4-arena', `__t.put(10300); 1`],
    ['m4-seal', `__t.put(9760); __t.w.sealArena(); 1`],
  ];
  for (const size of [[1440, 900], [390, 844]]) {
    for (const [name, js] of spots) await shot(cdp, size, name, js);
  }
  return true;
}

/* ------------------------------------------------------------------ */

const which = process.argv[2] || 'all';
const port = 9300 + Math.floor(Math.random() * 500);
const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${port}`, '--hide-scrollbars', '--mute-audio',
  '--no-first-run', '--disable-gpu-vsync', '--enable-unsafe-swiftshader', '--use-gl=angle',
  '--user-data-dir=/tmp/sf-l4-' + port, 'about:blank',
], { stdio: 'ignore' });

let ok = true;
try {
  const cdp = await CDP.attach(port);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `(() => {
      const orig = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (t, a) {
        if (t === 'webgl' || t === 'webgl2') a = Object.assign({}, a, { preserveDrawingBuffer: true });
        return orig.call(this, t, a);
      };
    })()`,
  });
  const errs = [];
  cdp.on('Runtime.exceptionThrown', p => errs.push(p.exceptionDetails?.exception?.description || p.exceptionDetails?.text));
  cdp.on('Runtime.consoleAPICalled', p => {
    if (p.type === 'error') errs.push('[console] ' + p.args.map(a => a.value ?? a.description).join(' '));
  });

  const runs = which === 'all' ? ['walk', 'seal', 'tear', 'shots'] : [which];
  const table = {};
  for (const r of runs) {
    const fn = { walk: testWalk, seal: testSeal, tear: testTear, shots: testShots }[r];
    if (!fn) { console.log('unknown test ' + r); continue; }
    table[r] = await fn(cdp);
    if (!table[r]) ok = false;
  }
  console.log('\n=== ' + Object.entries(table).map(([k, v]) => `${k}:${v ? 'PASS' : 'FAIL'}`).join('  ') + ' ===');
  if (errs.length) {
    console.log(`--- ${errs.length} page error(s) ---`);
    for (const e of [...new Set(errs)].slice(0, 12)) console.log(e);
    ok = false;
  }
} finally {
  chrome.kill('SIGKILL');
}
process.exit(ok ? 0 : 1);
