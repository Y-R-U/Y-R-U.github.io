// The only glue. Owns boot, the frame, and the sim -> presentation fan-out.

import { LEVELS } from './data/levels.js';
import { createWorld } from './sim/world.js';
import { makeAutopilot } from './sim/autopilot.js';
import { input, attachInput, pollInput, clearAll } from './core/input.js';
import { makeLoop } from './core/loop.js';
import { save } from './core/save.js';
import { audio } from './core/audio.js';
import { haptics } from './core/haptics.js';
import { goFullscreen } from './core/fullscreen.js';
import { applyCamParams, makeCamPanel } from './core/camtune.js';

const Q = new URLSearchParams(location.search);
const OPT = {
  level: Q.get('level') || 'a1-01',
  seed: Q.has('seed') ? Number(Q.get('seed')) : null,
  auto: Q.get('auto') === '1',
  nofs: Q.get('nofs') === '1' || Q.has('nofs'),
  ui: Q.get('ui') === '1',
  camtune: Q.get('camtune') === '1',
};

const stage = document.getElementById('stage');
const glCanvas = document.getElementById('gl');
const hudCanvas = document.getElementById('hud');
const tapEl = document.getElementById('tap');
const popEl = document.getElementById('popup');
const popMsg = document.getElementById('popmsg');
const popOk = document.getElementById('popok');

// ---------------------------------------------------------------- renderer
// The seam: makeRenderer({ gl, hud }). gfx/debug.js ignores `gl` and draws the
// grey box into the 2D overlay; the real 3D renderer takes both. One-line swap.
// `?gfx=debug` falls back to the grey box — keep it: it is how you tell a sim bug from an art bug.
const wantDebug = new URLSearchParams(location.search).get('gfx') === 'debug';
let makeRenderer, usingDebugRenderer = true;
if (wantDebug) {
  ({ makeRenderer } = await import('./gfx/debug.js'));
} else {
  try {
    ({ makeRenderer } = await import('./gfx/renderer.js'));
    usingDebugRenderer = false;
  } catch (e) {
    console.warn('[main] gfx/renderer.js failed, falling back to the grey box', e && e.message);
    ({ makeRenderer } = await import('./gfx/debug.js'));
  }
}
// A debug build never paints #gl, and tools/shot.mjs captures document.querySelector('canvas').
// Detaching the empty WebGL canvas is what keeps the screenshot gate honest.
if (usingDebugRenderer && glCanvas.parentNode) glCanvas.remove();

const renderer = makeRenderer({ gl: usingDebugRenderer ? null : glCanvas, hud: hudCanvas });

// The HUD is UI's; if it is not importable yet the grey box draws its own thumb buttons.
let drawHud = null;
try {
  const m = await import('./ui/hud.js');
  if (typeof m.drawHud === 'function') drawHud = m.drawHud;
  // World-anchored HUD marks must go through the renderer's own projection: the camera is a 20
  // degree perspective and the terrain is curved in the vertex shader, so a flat transform is off
  // by ~19 px at the screen edges — enough to detach a 5 px bar from the prop it belongs to.
  // A setter, not a per-frame argument, so a refactor of the frame loop cannot quietly drop it.
  if (typeof m.setProjector === 'function' && !renderer.isDebug) m.setProjector(renderer);
} catch (e) { console.warn('[main] ui/hud.js not available, using the debug HUD', e && e.message); }
if (renderer.isDebug) renderer.ownHud = !drawHud;

// ------------------------------------------------------------------- state
let world = null;
let bot = null;
let paused = false;
let finished = false;
let hudCtx = null;
let camPanel = null;

function popup(msg, onOk) {
  popMsg.textContent = msg;
  popEl.classList.remove('hidden');
  popOk.onclick = () => { popEl.classList.add('hidden'); if (onOk) onOk(); };
}

function levelById(id) { return LEVELS.find((l) => l.id === id) || LEVELS[0]; }

function startLevel(id) {
  save.load();
  const level = levelById(id || OPT.level);
  world = createWorld({ level, seed: OPT.seed ?? level.seed, save: save.data });
  bot = OPT.auto ? makeAutopilot() : null;
  finished = false;
  paused = false;
  applyCamParams(world, Q);
  if (camPanel) camPanel.sync();
  resize();
  audio.music('flight');
  loop.reset();
  if (!loop.running) loop.start();
}

// -------------------------------------------------------------------- size
function resize() {
  renderer.resize();
  const r = hudCanvas.getBoundingClientRect();
  if (world) world.setViewport(Math.max(1, r.width), Math.max(1, r.height));
  hudCtx = null;
}

addEventListener('resize', resize);
addEventListener('orientationchange', () => setTimeout(resize, 120));

// ------------------------------------------------------------------- frame
function update() {
  if (!world || paused) return;
  const r = hudCanvas.getBoundingClientRect();
  pollInput(r.width, r.height);

  if (bot) bot.step(world, 1 / 60);
  else {
    const a = input.aim, s = world.stick;
    s.active = a.active; s.ax = a.ax; s.ay = a.ay; s.sx = a.sx; s.sy = a.sy;
    for (let i = 0; i < 4; i++) world.slots[i] = input.slots[i];
    if (input.takeoff) { world.takeOff(); input.takeoff = false; }
  }

  world.step();
  const events = world.drainEvents();
  fanOut(events);
  pending.push(...events);

  if (world.over && !finished) {
    finished = true;
    const res = world.results;
    save.record(res);
    audio.sfx(res.outcome === 'win' ? 'win' : 'lose');
    haptics.buzz(res.outcome === 'win' ? 'kill' : 'boom');
    if (!OPT.auto) {
      popup(
        res.outcome === 'win'
          ? `MISSION COMPLETE — ${res.stars}★  $${res.money}  ${res.time.toFixed(0)}s`
          : res.outcome === 'bingo' ? 'OUT OF FUEL' : 'YOU WENT DOWN',
        () => startLevel(world.level.id));
    }
  }
}

const pending = [];       // events for the renderer, drained at draw time

const SFX_FOR_WEAPON = { bomb_std: 'drop', bomb_heavy: 'drop', cluster: 'drop', napalm: 'drop', bunker: 'drop', nuke: 'drop', rocket: 'rocket', homing: 'rocket', flak: 'cannon' };

function fanOut(events) {
  for (const ev of events) {
    switch (ev.e) {
      case 'fire': audio.sfx(SFX_FOR_WEAPON[ev.weapon] || 'gun'); break;
      case 'explode': audio.sfx(ev.big ? 'bigboom' : 'boom'); break;
      case 'hit': if (ev.team === 0) { audio.sfx('hurt'); haptics.buzz('hit'); } else audio.sfx('hit'); break;
      case 'pickup': audio.sfx('pickup'); break;
      case 'haptic': haptics.buzz(ev.pattern); break;
      case 'ui': if (ev.what === 'landed') audio.sfx('land'); else if (ev.what === 'objective') audio.sfx('ui'); break;
      default: break;
    }
  }
}

function render(alpha) {
  if (!world) return;
  renderer.draw(world, paused ? 0 : alpha, pending);
  pending.length = 0;
  if (drawHud) {
    if (!hudCtx) hudCtx = hudCanvas.getContext('2d');
    const r = hudCanvas.getBoundingClientRect();
    try { drawHud(hudCtx, world, { w: r.width, h: r.height }); }
    catch (e) { console.warn('[main] drawHud', e && e.message); drawHud = null; if (renderer.isDebug) renderer.ownHud = true; }
  }
  audio.tick(1 / 60);
}

const loop = makeLoop({ update, render });

// -------------------------------------------------------------------- boot
attachInput(stage);
document.addEventListener('visibilitychange', () => { if (document.hidden) clearAll(); });

async function boot() {
  if (!OPT.nofs && !OPT.auto) await goFullscreen(document.documentElement);
  audio.unlock();
  tapEl.classList.add('hidden');
  startLevel(OPT.level);
}

if (OPT.auto) {
  tapEl.classList.add('hidden');
  startLevel(OPT.level);
} else {
  document.getElementById('tapbtn').addEventListener('click', boot);
  tapEl.addEventListener('pointerdown', (e) => { if (e.target.id !== 'tapbtn') boot(); });
}

if (OPT.ui) {
  try {
    const { createUI } = await import('./ui/ui.js');
    const ui = await createUI({
      root: document.getElementById('ui'), save, audio,
      start: (levelId) => { ui.close(); startLevel(levelId); },
      resume: () => { paused = false; },
      quit: () => { paused = true; },
    });
    window.__ui = ui;
  } catch (e) { console.warn('[main] ui unavailable', e && e.message); }
}

if (OPT.camtune) camPanel = makeCamPanel(() => world, document.body);

// ------------------------------------------------------------------- probe
Object.defineProperty(window, '__state', {
  get() {
    if (!world) return { boot: true };
    const p = world.player;
    const s = loop.stats();
    const counts = {};
    for (const e of world.ents) counts[e.kind] = (counts[e.kind] || 0) + 1;
    return {
      fps: s.fps, p50: s.p50, p95: s.p95, p99: s.p99, worst: s.worst, frames: s.frames,
      drawCalls: world.ents.length + world.projs.length,
      level: world.level.id, seed: world.seed, t: world.t, frame: world.frame,
      plane: { x: p.x, y: p.y, ang: p.ang, speed: p.speed, hp: p.hp, hpMax: p.hpMax, fuel: p.fuel, stalling: p.stalling, landed: p.landed, dead: p.dead },
      stick: { active: world.stick.active, ax: world.stick.ax, ay: world.stick.ay, sx: world.stick.sx, sy: world.stick.sy, want: p.want },
      cam: { x: world.cam.x, y: world.cam.y, vw: world.cam.vw, vh: world.cam.vh, zoom: world.cam.scale, shake: world.cam.shakeMag },
      camTune: { ...world.camTune },
      ents: counts, projs: world.projs.length, debris: world.debris.length,
      mission: world.mission.objectives.map((o) => ({ label: o.label, have: Math.round(o.have * 10) / 10, need: o.need, done: o.done })),
      stats: { money: Math.round(world.stats.money), kills: world.stats.kills, shots: world.stats.shots, hits: world.stats.hits },
      over: world.over, results: world.results, paused, auto: OPT.auto,
      renderer: renderer.isDebug ? 'debug' : 'gfx',
    };
  },
});

window.__game = {
  get world() { return world; },
  start: startLevel, renderer, audio, save, input, loop,
  pause: (v) => { paused = v === undefined ? !paused : !!v; return paused; },
  camTune: {
    get: () => (world ? { ...world.camTune } : null),
    set: (o) => { if (world) { Object.assign(world.camTune, o); if (camPanel) camPanel.sync(); } return world && { ...world.camTune }; },
  },
  histogram: () => loop.histogram(),
};
