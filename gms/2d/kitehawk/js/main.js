/**
 * Boot, `ctx` assembly and the scene machine (§6).
 *
 * There are no scenes yet. The eight names are registered as no-ops so the
 * machine, the transitions and `input.releaseAll()` on every change are exercised
 * and provable now; P10 fills them in. Nothing here draws placeholder art.
 *
 * `ctx.player` and `ctx.entities` are the seam the harness and the orientation
 * gate drive: set `ctx.player = {x, y, vx, vy}` and push entities, and the real
 * camera, input and `__state` run against them. When P10 lands a play scene it
 * owns those two fields instead.
 */

import { createRenderer, LAYER } from './gfx/renderer.js';
import { createParticles } from './gfx/particles.js';
import { createAssets, makePaper } from './gfx/texture.js';

import { createBus } from './core/events.js';
import { createViewport } from './core/viewport.js';
import { createCamera } from './core/camera.js';
import { createInput } from './core/input.js';
import { createRNG } from './core/rng.js';
import { createLoop, DT } from './core/loop.js';
import { createQuality } from './core/quality.js';
import { createSave } from './core/save.js';
import { createDebug } from './core/debug.js';
import { createAudio } from './core/audio.js';
import { bandIdAt, altitudeFeet } from './core/bands.js';

export const SCENES = ['boot', 'title', 'hangar', 'brief', 'play', 'pause', 'debrief', 'map'];

const noop = () => ({ async enter() {}, update() {}, render() {}, exit() {} });

export async function boot(opts = {}) {
  const q = new URLSearchParams(location.search);
  const canvas = document.getElementById('gl');
  const stage = document.getElementById('stage');
  const ui = document.getElementById('ui');

  const bus = createBus();
  const R = await createRenderer(canvas, { preserveDrawingBuffer: q.has('preserve') });
  const P = createParticles(R);
  const view = createViewport(canvas, bus);
  const save = createSave(bus);
  save.load();

  const s = save.data.settings;
  const cam = createCamera(view, {
    bias: s.zoomBias,
    // falsification switches, off by default — see docs/P2_NOTES.md
    slew: q.get('slew') || undefined,
    margin: q.get('margin') || undefined,
    track: q.get('track') || undefined,
    enforce: q.get('enforce') !== '0',
  });
  view.setCamera(cam);

  const input = createInput(canvas, view, bus, { invertPitch: s.invertPitch, holdToFly: s.holdToFly, bug: q.get('inputbug') || '' });
  input.installDefaultZones();

  const quality = createQuality(bus, { low: s.lowDetail || q.get('quality') === 'low' });
  const rng = createRNG(q.get('seed') || 'kitehawk');
  const audio = await createAudio({ audio: { disabled: q.has('noaudio') } });
  audio.setVolume('master', s.volume.master);

  const assets = createAssets(R.gl, '');

  R.setGrain(makePaper(R.gl), 1 / 256, 0.15);
  R.fx.gLoadRebase();

  const scenes = Object.create(null);
  for (const n of SCENES) scenes[n] = noop();
  let current = null, currentName = '';

  const ctx = {
    R, P, input, view, cam, bus, rng, audio, save, quality, assets,
    LAYER, DT,
    dom: { stage, ui },
    debug: q.has('debug'),
    player: null,        // P10's play scene owns this; the harness sets it directly
    entities: [],
    scenes,
    get scene() { return currentName; },
    go,
  };

  async function go(name, params) {
    const next = scenes[name];
    if (!next) { console.warn('[main] no such scene: ' + name); return; }
    if (current && current.exit) current.exit();
    input.releaseAll();          // the one moment a latched bit can outlive its owner
    input.clearZones();
    input.installDefaultZones();
    currentName = name;
    current = next;
    bus.emit('scene:change', { name, params });
    if (next.enter) await next.enter(ctx, params);
  }

  /* --- the flat, JSON-safe snapshot every later gate asserts on (§8.2) --- */
  const state = {
    tick: 0, fps: 0, frameMs: 0,
    drawCalls: 0, sprites: 0, tris: 0, particles: 0, lights: 0,
    scene: '',
    view: { mode: 'portrait', w: 0, h: 0, dpr: 1, worldW: 0, worldH: 0, scale: 1 },
    cam: { x: 0, y: 0, zoom: 1, zoomTarget: 1, reason: '', boxW: 0, boxH: 0, members: 0 },
    input: { axisX: 0, axisY: 0, stickActive: false, stickR: 0, source: 'keyboard' },
    entities: { total: 0, hostile: 0, crates: 0 },
    player: { alive: false, x: 0, y: 0, vx: 0, vy: 0, speed: 0, angle: 0, band: 'mud', altFt: 0 },
    bands: {},
    audio: { ready: false, available: false, voices: 0, oneShots: 0 },
    quality: { low: false },
    errors: [],
  };
  window.__state = state;
  window.__kh = ctx;

  const pushErr = (m) => { if (state.errors.length < 64) state.errors.push(String(m)); };
  window.addEventListener('error', (e) => pushErr(e.message || e));
  window.addEventListener('unhandledrejection', (e) => pushErr((e.reason && e.reason.message) || e.reason));

  function snapshot() {
    state.tick = tick;
    state.fps = loop.fps; state.frameMs = loop.ms;
    state.drawCalls = R.stats.drawCalls; state.sprites = R.stats.sprites;
    state.tris = R.stats.tris; state.lights = R.stats.lights;
    state.particles = P.count;
    state.scene = currentName;
    state.view.mode = view.mode; state.view.w = view.w; state.view.h = view.h; state.view.dpr = view.dpr;
    state.view.worldW = view.worldW; state.view.worldH = view.worldH; state.view.scale = view.scale;
    state.cam.x = cam.x; state.cam.y = cam.y; state.cam.zoom = cam.zoom;
    state.cam.zoomTarget = cam.zoomTarget; state.cam.reason = cam.zoomReason;
    state.cam.boxW = cam.box.w; state.cam.boxH = cam.box.h; state.cam.members = cam.memberCount;
    state.input.axisX = input.axisX; state.input.axisY = input.axisY;
    state.input.stickActive = input.stick.active; state.input.stickR = input.stickRadius();
    state.input.source = input.lastSource;
    const p = ctx.player;
    state.player.alive = !!p;
    if (p) {
      state.player.x = p.x; state.player.y = p.y;
      state.player.vx = p.vx || 0; state.player.vy = p.vy || 0;
      state.player.speed = Math.hypot(p.vx || 0, p.vy || 0);
      state.player.angle = p.angle || 0;
      state.player.band = bandIdAt(p.y);
      state.player.altFt = altitudeFeet(p.y);
    }
    let hostile = 0, crates = 0;
    for (let i = 0; i < ctx.entities.length; i++) {
      const e = ctx.entities[i];
      if (e && e.kind === 'crate') crates++; else if (e && e.hostile) hostile++;
    }
    state.entities.total = ctx.entities.length;
    state.entities.hostile = hostile; state.entities.crates = crates;
    state.audio.ready = !!audio.ready; state.audio.available = !!audio.available;
    const rep = audio.report ? audio.report() : null;
    state.audio.voices = (rep && rep.sources && rep.sources.live) || 0;
    state.audio.oneShots = (rep && rep.oneShotVoices) || 0;
    state.quality.low = quality.low;
  }

  /* --- the loop --------------------------------------------------------- */

  let tick = 0;
  const dbg = createDebug(ctx);

  function update() {
    tick++;
    input.update();
    if (current && current.update) current.update(DT);
    // camera runs AFTER the sim and before render — it is a consumer, never an input
    cam.update(ctx.player, DT);
    // the listener follows the CAMERA, not the player: what you hear is what is
    // in frame, and at zoom 0.78 that is 89 m of sky rather than 69
    audio.setListener(cam.x, cam.y, (view.worldW / cam.zoom) * 0.5);
    audio.update(DT);
  }

  function render(alpha, dtReal) {
    R.tick(dtReal);
    R.begin(cam);
    if (current && current.render) current.render(alpha, dtReal);
    R.end();
    quality.frame(dtReal * 1000, dtReal);
    snapshot();
    dbg.render();
  }

  const loop = createLoop({ update, render });
  ctx.loop = loop;

  R.resize(view.w, view.h, view.dpr, view.worldH);
  bus.on('view:change', () => { R.resize(view.w, view.h, view.dpr, view.worldH); });

  // Auto quality is OFF under a harness run: a preset that flips mid-gate makes
  // two runs incomparable, and every gate passes ?nosave.
  if (!q.has('nosave') && !q.has('quality')) quality.auto(true);

  audio.followCamera(true);
  await go(q.get('scene') || 'boot');
  loop.start();

  return ctx;
}

export default boot;
