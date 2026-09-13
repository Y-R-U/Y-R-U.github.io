// NINE STRINGS - host. The only file allowed to import from both sim and gfx.
//
// Every subsystem is loaded through `optional()`: during the build most of them
// are stubs, and a half-written renderer must never take the whole page down
// with it. What it must not do is fail SILENTLY - `window.__ns.missing` lists
// anything that did not load, and the boot gate asserts that list is empty.

import { makeViewport } from './core/viewport.js';
import { makeInput } from './core/input.js';
import { makeLoop, STEP } from './core/loop.js';
import { makeRng } from './core/rng.js';
import { makeEmitter } from './core/events.js';
import { loadSave, writeSave } from './core/save.js';
import { createWorld } from './sim/world.js';

export const VERSION = '0.1.0';

const Q = new URLSearchParams(location.search);
const flag = (k) => Q.has(k);
const num = (k, d) => (Q.has(k) ? +Q.get(k) : d);

const missing = [];
async function optional(path, pick) {
  try {
    const m = await import(path);
    const v = pick ? pick(m) : m;
    if (typeof v !== 'function' && (v === undefined || v === null)) throw new Error('no export');
    return v;
  } catch (e) {
    missing.push(path.split('/').pop() + ': ' + (e.message || e));
    return null;
  }
}

function callout(msg, ms = 2600) {
  const el = document.getElementById('callout');
  if (!el) return;
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(callout._t);
  if (ms) callout._t = setTimeout(() => { el.hidden = true; }, ms);
}

async function boot() {
  const canvas = document.getElementById('game');
  const uiRoot = document.getElementById('ui');
  const viewport = makeViewport(canvas, { dpr: num('dpr', 0) });
  const input = makeInput(document.getElementById('stage'));
  const emitter = makeEmitter();
  const save = loadSave();
  if (flag('quality')) save.settings.quality = num('quality', 2);

  const createRenderer = await optional('./gfx/renderer.js', (m) => m.createRenderer);
  const makeCamera     = await optional('./gfx/camera.js',   (m) => m.makeCamera);
  const makeSceneFx    = await optional('./gfx/scenefx.js',  (m) => m.makeSceneFx);
  const makeParticles  = await optional('./gfx/particles.js',(m) => m.makeParticles);
  const makeHud        = await optional('./gfx/hud.js',      (m) => m.makeHud);
  const makeScreens    = await optional('./ui/screens.js',   (m) => m.makeScreens);
  const makeAudio      = await optional('./audio/audio.js',  (m) => m.makeAudio);
  const STAGES         = await optional('./data/stages.js',  (m) => m.STAGES);
  const CHARACTERS     = await optional('./data/characters.js', (m) => m.CHARACTERS);

  const renderer  = createRenderer ? createRenderer(canvas, viewport) : placeholderRenderer(canvas, viewport);
  const camera    = makeCamera ? makeCamera() : { x: 0, y: 0, zoom: 1, update() {}, shake() {}, follow() {} };
  const particles = makeParticles ? makeParticles(4000) : null;
  const audio     = makeAudio ? makeAudio() : null;
  const hud       = makeHud ? makeHud(renderer, viewport) : null;

  const ns = {
    version: VERSION, missing, viewport, input, renderer, camera, particles,
    audio, save, emitter, world: null, screens: null,
    real: !!createRenderer,          // is this the real renderer or the placeholder
    ready: false, paused: false,
    callout,
    quality: save.settings.quality,
  };
  // A DATA property, not an accessor: the falsify arm of the boot gate has to
  // be able to poke it, and an accessor silently swallows the poke and turns
  // the whole gate green when it should be red.
  Object.defineProperty(window, '__ns', { value: ns, writable: true, configurable: true });

  const startRun = (opts = {}) => {
    const stageId = opts.stage || Q.get('stage') || 'bellfield';
    const stage = (STAGES && STAGES[stageId]) || null;
    const character = (CHARACTERS && CHARACTERS[opts.character || 'wick']) || null;
    const seed = opts.seed || num('seed', (Date.now() & 0x7fffffff));
    const world = createWorld({
      rng: makeRng(seed), seed, stage, character,
      sanctum: save.sanctum, relics: opts.relics || [], curse: opts.curse || 0,
      tutorial: !save.stats.runs && !flag('nostory'),
    });
    ns.world = world;
    if (scenefx && scenefx.setStage) scenefx.setStage(stage);
    ns.run = { stageId, seed, startedAt: Date.now() };
    emitter.emit('runstart', ns.run);
    return world;
  };
  ns.startRun = startRun;

  const scenefx = makeSceneFx ? makeSceneFx({ renderer, particles, camera, audio, viewport }) : null;
  ns.scenefx = scenefx;
  // postfx reads ONE persistent opts object, mutated in place by scenefx. The
  // renderer owns the post pass, so hand it the reference rather than passing a
  // literal down the render path every frame.
  if (scenefx && renderer) renderer.postOpts = scenefx.POST;

  const screens = makeScreens ? makeScreens(uiRoot, { save, audio, emitter, ns }) : null;
  ns.screens = screens;

  // ---- the loop -------------------------------------------------------
  const step = () => {
    const w = ns.world;
    if (!w || ns.paused || w.over || w.pendingLevels > 0) return;
    input.update();
    if (ns.bot) ns.bot(w, input);
    w.px = input.moveX; w.py = input.moveY;
    w.step();
    if (scenefx) scenefx.consume(w.events);
    w.events.length = 0;
  };

  const render = (alpha, dt) => {
    const w = ns.world;
    if (camera.update) camera.update(dt, w);
    if (scenefx) scenefx.step(dt);
    renderer.begin(camera.x, camera.y, viewport.zoom * (camera.zoom || 1));
    if (w && renderer.drawWorld) renderer.drawWorld(w, alpha);
    if (particles) { particles.step(dt); particles.draw(renderer); }
    if (scenefx) { scenefx.drawWeaponFx(); scenefx.drawNumbers(); }
    if (hud && w) hud.draw(w, ns);
    renderer.end(dt);
  };

  const loop = makeLoop(step, render);
  ns.loop = loop;
  loop.start();

  viewport.onresize(() => { if (renderer.resize) renderer.resize(); });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { ns.paused = true; writeSave(save); }
  });

  // ?auto - the bot drives the same two input numbers a thumb does, so the
  // gates exercise the real input path rather than a side door.
  if (flag('auto')) {
    let t = 0;
    ns.bot = (w, inp) => {
      t += STEP;
      inp.inject(Math.cos(t * 0.7), Math.sin(t * 0.53));
    };
    if (!ns.world) startRun();
  }

  if (missing.length && flag('strict')) callout('Not loaded: ' + missing.join(' | '), 0);
  ns.ready = true;
  if (screens) screens.show(flag('auto') ? 'none' : 'boot');
  return ns;
}

// A deliberately ugly Canvas2D stand-in so the page is never blank while the
// real renderer is being built. boot.mjs FAILS if this is what is running,
// unless --allow-placeholder is passed: a syntax error in renderer.js must not
// produce a green gate over a game that looks nothing like the shipped one.
function placeholderRenderer(canvas, viewport) {
  const ctx = canvas.getContext('2d');
  return {
    placeholder: true,
    begin() { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#05060a'; ctx.fillRect(0, 0, canvas.width, canvas.height); },
    sprite() {}, quad() {}, line() {}, curve() {}, layer() {}, text() {},
    end() {}, setQuality() {}, resize() {},
    stats: { draws: 0, sprites: 0, ms: 0 },
  };
}

boot().catch((e) => {
  callout('Boot failed: ' + (e && e.message ? e.message : e), 0);
  console.error(e);
});
