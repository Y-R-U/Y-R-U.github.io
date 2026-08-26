// The only glue. Owns boot, the frame, and the sim -> presentation fan-out.

import { LEVELS } from './data/levels.js';
import { createWorld } from './sim/world.js';
import { makeAutopilot } from './sim/autopilot.js';
import { input, attachInput, pollInput, clearAll, syncKeyAngle } from './core/input.js';
import { makeLoop } from './core/loop.js';
import { save } from './core/save.js';
import { audio } from './core/audio.js';
import { haptics } from './core/haptics.js';
import { goFullscreen, isFullscreen, toggleFullscreen, autoFullscreenDevice, fullscreenSupported } from './core/fullscreen.js';
import { applyCamParams, makeCamPanel } from './core/camtune.js';

const Q = new URLSearchParams(location.search);
const OPT = {
  level: Q.get('level') || 'a1-01',
  seed: Q.has('seed') ? Number(Q.get('seed')) : null,
  auto: Q.get('auto') === '1',
  nofs: Q.get('nofs') === '1' || Q.has('nofs'),
  camtune: Q.get('camtune') === '1',
};
// The whole front end — title, hangar, level select, results, settings — was built and then only
// ever loaded behind `?ui=1`, so a normal player dropped straight into a1-01 and never saw any of
// it. It is the default now. `?level=` still goes straight to that level so every existing
// capture gate keeps working, and `?ui=0` forces the old behaviour.
OPT.ui = Q.get('ui') !== '0' && !OPT.auto;
OPT.lobby = OPT.ui && !Q.has('level') && !OPT.auto && Q.get('lobby') !== '0';

const stage = document.getElementById('stage');
const glCanvas = document.getElementById('gl');
const hudCanvas = document.getElementById('hud');
const tapEl = document.getElementById('tap');
const popEl = document.getElementById('popup');
const popMsg = document.getElementById('popmsg');
const popOk = document.getElementById('popok');

// A dead TAP TO FLY button with the reason only in the console is the worst failure this game
// can have — it looks like the game simply does not work. Surface anything fatal on the page.
addEventListener('error', (e) => noteEl('Error: ' + (e.message || 'unknown') + ' — tap to dismiss'));
addEventListener('unhandledrejection', (e) => noteEl('Error: ' + ((e.reason && e.reason.message) || e.reason || 'unknown')));

/** Surface a problem in the page instead of only in a console nobody has open. */
function noteEl(msg) {
  try {
    let n = document.getElementById('bootnote');
    if (!n) {
      n = document.createElement('div');
      n.id = 'bootnote';
      n.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:99;padding:8px 12px;'
        + 'font:12px/1.4 system-ui,sans-serif;color:#ffd9a0;background:rgba(40,12,8,0.92);text-align:center';
      document.body.appendChild(n);
      n.addEventListener('click', () => n.remove());
    }
    n.textContent = msg;
  } catch { /* nothing left to do */ }
}

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

// Constructing the renderer can throw even when the import succeeded — a machine with WebGL
// disabled or blocked fails here, inside THREE.WebGLRenderer. This used to abort module
// evaluation, which meant the TAP TO FLY listener further down was never attached and the
// button silently did nothing. Fall back to the grey box instead, and tell the player why.
let renderer;
function buildRenderer() {
  return makeRenderer({ gl: usingDebugRenderer ? null : glCanvas, hud: hudCanvas });
}
try {
  renderer = buildRenderer();
} catch (e) {
  console.warn('[main] 3D renderer would not start, falling back to the grey box', e && e.message);
  ({ makeRenderer } = await import('./gfx/debug.js'));
  usingDebugRenderer = true;
  if (glCanvas.parentNode) glCanvas.remove();
  renderer = makeRenderer({ gl: null, hud: hudCanvas });
  // Say what actually happened. "would not start 3D" on a machine that plainly runs 3D is a
  // misdiagnosis, and this catch fires for ANY error out of makeRenderer, not only WebGL ones.
  noteEl((e && e.webglUnavailable
    ? 'This browser would not give the game a WebGL context — running in reduced graphics.'
    : 'Graphics failed to start (' + ((e && e.message) || 'unknown') + ') — running in reduced graphics.')
    + '  Tap to dismiss.');
}

// The HUD is UI's; if it is not importable yet the grey box draws its own thumb buttons.
let drawHud = null;
let hudProjector = null;   // re-applied when the GL context is rebuilt
try {
  const m = await import('./ui/hud.js');
  if (typeof m.drawHud === 'function') drawHud = m.drawHud;
  // World-anchored HUD marks must go through the renderer's own projection: the camera is a 20
  // degree perspective and the terrain is curved in the vertex shader, so a flat transform is off
  // by ~19 px at the screen edges — enough to detach a 5 px bar from the prop it belongs to.
  // A setter, not a per-frame argument, so a refactor of the frame loop cannot quietly drop it.
  if (typeof m.setProjector === 'function' && !renderer.isDebug) { hudProjector = m.setProjector; hudProjector(renderer); }
} catch (e) { console.warn('[main] ui/hud.js not available, using the debug HUD', e && e.message); }

// The tutorial overlay is optional and lives behind its own module so a missing or broken one
// can never cost us the game. It draws onto the same 2D overlay, after the HUD.
let makeTutorial = null;
try {
  const m = await import('./ui/tutorial.js');
  if (typeof m.makeTutorial === 'function') makeTutorial = m.makeTutorial;
} catch { /* not written yet — fine */ }
if (renderer.isDebug) renderer.ownHud = !drawHud;

// ------------------------------------------------------------------- state
let world = null;
let bot = null;
let paused = false;
let uiRef = null;
let tutorial = null;
let currentMode = 'story';
let flownOnce = false;
let prefsRef = null;   // the live prefs object, once the UI layer has bound it

function setPaused(v) { paused = !!v; return paused; }

function togglePause() {
  setPaused(!paused);
  // Leaving fullscreen on mobile (a swipe, the system UI, a notification) previously stranded
  // the player — nothing re-requested it and only a reload got it back. Resuming is a real
  // user gesture, so it is a legitimate moment to ask again.
  if (!paused && !isFullscreen()) tryFullscreen();
  try {
    if (paused && uiRef && uiRef.go) {
      uiRef.go('pause', {
        levelId: world && world.level && world.level.id, mode: currentMode,
        stats: world ? { t: world.t, kills: world.stats.kills, money: world.stats.money } : {},
      });
    }
    else if (!paused && uiRef && uiRef.close) uiRef.close();
  } catch { /* the pause screen is optional; the sim state is what matters */ }
}
let finished = false;
let hudCtx = null;
let camPanel = null;

// ------------------------------------------------------------- music intensity
// Drives the march -> heavy drop. Deliberately smoothed and slow: the audio layer has its own
// hysteresis, but feeding it a value that spikes on every flak burst would fight it.
let intensity = 0;
function setIntensity(v) {
  intensity = Math.max(0, Math.min(1, v));
  if (typeof audio.setIntensity === 'function') audio.setIntensity(intensity);
}

function combatHeat(w) {
  const p = w && w.player;
  if (!p || p.dead) return 0;
  let air = 0, boss = 0;
  for (const e of w.ents) {
    if (e.dead || e.team === 0) continue;
    if (Math.abs(e.x - p.x) > 1600) continue;
    if (e.kind === 'boss') boss = 1;
    else if (e.kind === 'fighter') air += 1;
    else air += 0.2;                       // flak and ground guns count, but not as much
  }
  const hurt = 1 - (p.hpMax ? Math.max(0, p.hp / p.hpMax) : 1);
  return boss ? 1 : Math.min(1, air * 0.24 + hurt * 0.45);
}

function popup(msg, onOk) {
  popMsg.textContent = msg;
  popEl.classList.remove('hidden');
  popOk.onclick = () => { popEl.classList.add('hidden'); if (onOk) onOk(); };
}

function levelById(id) { return LEVELS.find((l) => l.id === id) || LEVELS[0]; }

function startLevel(id, mode) {
  save.load();
  const level = levelById(id || OPT.level);
  currentMode = mode || 'story';
  // `mode` is passed through to the sim, which consults sim/modes.js for the rule table. Story
  // is the no-op case, so a world built without a mode behaves exactly as it always has.
  world = createWorld({ level, seed: OPT.seed ?? level.seed, save: save.data, mode: currentMode });
  bot = OPT.auto ? makeAutopilot() : null;
  finished = false;
  paused = false;
  applyCamParams(world, Q);
  if (camPanel) camPanel.sync();
  resize();
  tutorial = makeTutorial ? (() => { try { return makeTutorial(world); } catch (e) { console.warn('[main] tutorial', e && e.message); return null; } })() : null;
  audio.music(level.boss ? 'boss' : 'battle', { act: level.act || 1 });
  setIntensity(0);
  if (uiRef && uiRef.close) uiRef.close();
  loop.reset();
  if (!loop.running) loop.start();
  if (!flownOnce) { flownOnce = true; if (!autoFullscreenDevice()) offerFullscreen(); }
}

/** Drop the world when the player goes back to a menu, so a frozen mission is not left behind. */
function leaveLevel() {
  world = null; bot = null; tutorial = null; finished = false;
  loop.stop && loop.stop();
  audio.music('title');
  setIntensity(0);
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
  if (!world) return;
  // pollInput must run even while paused, or the only way out of the pause screen would be the
  // DOM overlay — the HUD's own pause button and the Escape key would both be dead. The edge it
  // returns used to be discarded here, which is why the pause button did nothing at all.
  const r = hudCanvas.getBoundingClientRect();
  // keep the keyboard's heading glued to the plane while no key is held, so the first press
  // turns from where the nose actually is rather than snapping to a remembered angle
  if (world.player) syncKeyAngle(world.player.ang);
  const pauseEdge = pollInput(r.width, r.height);
  if (pauseEdge) togglePause();
  if (paused) return;

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
  if (tutorial) { try { tutorial.step(world, 1 / 60); } catch (e) { console.warn('[main] tutorial.step', e && e.message); tutorial = null; } }

  if ((world.frame & 15) === 0) setIntensity(intensity + (combatHeat(world) - intensity) * 0.5);

  if (world.over && !finished) {
    finished = true;
    const res = world.results;
    save.record(res);
    audio.sfx(res.outcome === 'win' ? 'win' : 'lose');
    haptics.buzz(res.outcome === 'win' ? 'kill' : 'boom');
    audio.music(res.outcome === 'win' ? 'victory' : 'defeat');
    setIntensity(0);
    if (OPT.auto) { /* the harness reads window.__state; no screen */ }
    else if (uiRef && uiRef.go) {
      // save.record() above has already banked the money and the stars, so the results screen
      // must not do it again — record:false and moneyAlreadyBanked:true are what stop a win
      // paying out twice.
      setPaused(true);
      uiRef.go('results', {
        levelId: world.level.id, mode: currentMode, record: false, moneyAlreadyBanked: true,
        result: { win: res.outcome === 'win', time: res.time, stars: res.stars, money: res.money, outcome: res.outcome },
      });
    } else {
      popup(
        res.outcome === 'win'
          ? `MISSION COMPLETE — ${res.stars}★  $${res.money}  ${res.time.toFixed(0)}s`
          : res.outcome === 'bingo' ? 'OUT OF FUEL' : 'YOU WENT DOWN',
        () => startLevel(world.level.id, currentMode));
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
    if (tutorial && tutorial.draw) {
      try { tutorial.draw(hudCtx, world, { w: r.width, h: r.height }); }
      catch (e) { console.warn('[main] tutorial.draw', e && e.message); tutorial = null; }
    }
  }
  audio.tick(1 / 60);
}

const loop = makeLoop({ update, render });

// ------------------------------------------------------- webgl context loss
// Mobile browsers throw away the WebGL context when the tab is backgrounded, the screen locks,
// or memory gets tight. Without this the player comes back to a permanently black canvas and
// the game looks broken. preventDefault() on the loss event is REQUIRED — without it the
// browser never fires 'restored' at all and there is nothing to recover from.
let contextLost = false;

if (!usingDebugRenderer) {
  glCanvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    contextLost = true;
    setPaused(true);
    noteEl('Graphics paused while the app was in the background — restoring…');
  }, false);

  glCanvas.addEventListener('webglcontextrestored', () => {
    try {
      if (renderer && typeof renderer.dispose === 'function') renderer.dispose();
      renderer = buildRenderer();
      if (hudProjector) hudProjector(renderer);
      renderer.resize();
      contextLost = false;
      const n = document.getElementById('bootnote'); if (n) n.remove();
      setPaused(false);
    } catch (err) {
      console.warn('[main] context restore failed', err && err.message);
      noteEl('Graphics could not be restored — reload the page.');
    }
  }, false);

  // Coming back from the background does not always fire the events above, so check directly.
  const recheck = () => {
    if (document.hidden || usingDebugRenderer) return;
    const gl = glCanvas.getContext('webgl2') || glCanvas.getContext('webgl');
    if (gl && gl.isContextLost && gl.isContextLost() && !contextLost) {
      contextLost = true;
      setPaused(true);
      noteEl('Graphics were dropped while away — tap to reload.');
      const n = document.getElementById('bootnote');
      if (n) n.addEventListener('click', () => location.reload());
    } else if (!contextLost) {
      renderer.resize();      // orientation or window size may have changed while hidden
    }
  };
  document.addEventListener('visibilitychange', () => { if (!document.hidden) setTimeout(recheck, 60); });
  addEventListener('pageshow', () => setTimeout(recheck, 60));
  addEventListener('focus', () => setTimeout(recheck, 60));
}

// -------------------------------------------------------------------- boot
attachInput(stage);
document.addEventListener('visibilitychange', () => { if (document.hidden) clearAll(); });

let booted = false;
function boot() {
  if (booted) return;                       // pointerdown and click can both land
  booted = true;
  // Start FIRST, then ask for fullscreen. The old order awaited requestFullscreen, and a request
  // that neither resolves nor rejects — which happens when the browser will not honour the
  // gesture — left the whole boot stalled with the title still up and no error anywhere.
  // Nothing about entering fullscreen may be able to stop the game starting.
  audio.unlock();
  tapEl.classList.add('hidden');
  if (OPT.lobby && uiRef) { uiRef.go('title'); audio.music('title'); }
  else startLevel(OPT.level);
  tryFullscreen();
}

/**
 * Fullscreen is a preference and a best effort; nothing may depend on it succeeding.
 *
 * AARON'S RULING: desktop never takes fullscreen by itself. There it is a window you can already
 * resize and grabbing it is rude; on a phone the browser chrome eats a third of a landscape
 * screen and there is no alternative. So auto-request on coarse-pointer devices only, and give
 * desktop a button instead — the chip below on the first flight, and the pause screen after that.
 */
function tryFullscreen() {
  if (OPT.nofs || OPT.auto) return;
  if (prefsRef && prefsRef.fullscreen === false) return;
  // Desktop gets nothing here. The chip is offered from startLevel() on the FIRST FLIGHT, not on
  // the menu — on the title screen it collides with the hangar and settings icons, and offering
  // fullscreen for a menu you are about to leave is pointless.
  if (!autoFullscreenDevice()) return;
  try { Promise.resolve(goFullscreen(document.documentElement)).catch(() => {}); } catch { /* ignore */ }
}

// ------------------------------------------------------- desktop fullscreen chip
const chipEl = document.getElementById('fschip');
const chipBtn = document.getElementById('fsbtn');
let chipShown = false, chipTimer = 0;

function hideChip() {
  clearTimeout(chipTimer);
  if (chipEl) chipEl.classList.add('hidden');
}

/** Show it once per session, briefly, on the first flight. Pressing it IS the gesture. */
function offerFullscreen() {
  if (chipShown || !chipEl || !chipBtn) return;
  if (isFullscreen() || !fullscreenSupported()) return;
  if (prefsRef && prefsRef.fullscreen === false) return;
  chipShown = true;
  chipEl.classList.remove('hidden');
  chipTimer = setTimeout(hideChip, 7000);
}

if (chipBtn) {
  chipBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    await toggleFullscreen(document.documentElement);
    hideChip();
  });
  chipBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
}

// Built BEFORE the tap button is armed: boot() hands straight to the title screen, and a uiRef
// that is still null at that moment would silently drop the player into a level instead.
if (OPT.ui) {
  try {
    const { createUI } = await import('./ui/ui.js');
    const ui = await createUI({
      root: document.getElementById('ui'), save, audio,
      start: (levelId, mode) => { ui.close(); setPaused(false); startLevel(levelId, mode); },
      // Unpausing has to take the pause SCREEN down too. Flipping only the sim flag left the
      // menu sitting over a game that was already running again.
      resume: () => { setPaused(false); ui.close(); },
      quit: () => { setPaused(true); leaveLevel(); },
    });
    window.__ui = ui;
    uiRef = ui;
    try { prefsRef = (await import('./ui/prefs.js')).prefs; } catch { /* prefs optional */ }
  } catch (e) { console.warn('[main] ui unavailable', e && e.message); }
}

if (OPT.auto) {
  tapEl.classList.add('hidden');
  startLevel(OPT.level);
} else {
  const tapBtn = document.getElementById('tapbtn');
  tapBtn.addEventListener('click', boot);
  tapEl.addEventListener('pointerdown', (e) => { if (e.target.id !== 'tapbtn') boot(); });
  // Arm it only now. Everything above this line can throw, and a button that looks ready while
  // its handler does not exist yet is indistinguishable from a broken game.
  tapBtn.disabled = false;
  tapBtn.classList.remove('loading');
  tapBtn.textContent = OPT.lobby ? 'TAP TO START' : 'TAP TO FLY';
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
  pause: (v) => { if (v === undefined) togglePause(); else setPaused(v); return paused; },
  camTune: {
    get: () => (world ? { ...world.camTune } : null),
    set: (o) => { if (world) { Object.assign(world.camTune, o); if (camPanel) camPanel.sync(); } return world && { ...world.camTune }; },
  },
  histogram: () => loop.histogram(),
};
