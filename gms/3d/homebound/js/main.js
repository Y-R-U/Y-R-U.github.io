// Boot, the frame loop, and the debug handle the headless harness drives.
//
// The loop is deliberately NOT the only way frames advance. `window.__hb.step()`
// runs exactly one update with a supplied dt, because a headless page has its
// rAF throttled to a crawl and screenshots of a game that has not ticked are
// worthless.

import { DEV_MODE, SPEED_ARG, START_ARG, LEVEL_ARG, CHAP_ARG, SEED_ARG, TIER_ARG, TROOPS_ARG, SHOT_ARG } from './config.js';
import { state } from './state.js';
import { loadProfile, P } from './save.js';
import { emit, on } from './bus.js';
import { $, clamp } from './utils.js';

import { initRender, ctx, render, drawCalls, setDrawing } from './render.js';
import { initInput } from './input.js';
import { initWorld } from './world.js';
import { initUnits } from './units.js';
import { initArmy } from './army.js';
import { initSigns } from './signs.js';
import { initGates } from './gates.js';
import { initBarriers } from './barriers.js';
import { initCombat } from './combat.js';
import { initVfx } from './vfx.js';
import { initEnemies } from './enemies.js';
import { initAudio } from './audio.js';
import { initHud } from './hud.js';
import { initMenus, showMain } from './menus.js';
import { initStore } from './store.js';
import { initHouse } from './house.js';
import { initStory } from './story.js';
import { buildLevel, levelSpec } from './levels.js';
import { updateGame, startRun, run } from './game.js';

let last = 0, raf = 0, booted = false;

async function boot() {
  const stage = $('#stage');
  loadProfile();
  initRender(stage);
  initInput(stage);

  // Order matters once: units builds the geometries army and enemies instance.
  initUnits(ctx);
  initSigns();
  initWorld(ctx);
  initArmy(ctx);
  initGates(ctx);
  initBarriers(ctx);
  initEnemies(ctx);
  initCombat(ctx);
  initVfx(ctx);
  initAudio();
  initStory();
  initHud();
  initStore();
  initHouse(ctx);
  initMenus();

  booted = true;
  hideLoader();
  route();

  last = performance.now();
  raf = requestAnimationFrame(loop);
  if (DEV_MODE) startDevOverlay();
}

// Where the game opens. `?start=run&level=3` is how every screenshot and every
// bug report gets reproduced without eleven taps.
function route() {
  const p = P();
  if (START_ARG === 'run' || LEVEL_ARG) {
    const chapter = CHAP_ARG || p.chapter || 1;
    const level = LEVEL_ARG || p.level || 1;
    const spec = levelSpec(chapter, level) || { chapter, level, seed: SEED_ARG || (chapter * 1000 + level) };
    if (SEED_ARG) spec.seed = SEED_ARG;
    const def = buildLevel(spec);
    if (def) {
      startRun(def);
      if (TROOPS_ARG) state.troops = state.peakTroops = TROOPS_ARG;
      if (TIER_ARG) {
        import('./config.js').then(({ TIERS }) => {
          const i = TIERS.findIndex((t) => t.id === TIER_ARG);
          if (i >= 0) { state.tier = i; import('./army.js').then((m) => m.setTier(i)); }
        });
      }
      return;
    }
  }
  showMain();
}

function loop(now) {
  raf = requestAnimationFrame(loop);
  // Clamp: a backgrounded tab returns with a two-second dt and the squad
  // teleports through three gates and a wall.
  const dt = clamp((now - last) / 1000, 0, 0.05) * (SPEED_ARG || 1);
  last = now;
  step(dt);
}

function step(dt) {
  try { updateGame(dt); }
  catch (e) { console.error('[frame]', e); cancelAnimationFrame(raf); throw e; }
}

function hideLoader() {
  const l = $('#loading');
  if (!l) return;
  l.classList.add('gone');
  setTimeout(() => l.classList.add('hidden'), 500);
}

// --------------------------------------------------------------------------
// Debug handle. `ready` is what the harness polls for; `step` is what it drives.
// --------------------------------------------------------------------------
window.__hb = {
  get ready() { return booted; },
  step,
  state, run, ctx,
  bus: { emit, on },
  profile: () => P(),
  drawCalls,
  setDrawing,
  // Fast-forward a run without waiting for real time. Used by the harness to
  // stage a frame deep into a level.
  seek(seconds, dt = 1 / 60) { for (let i = 0; i < seconds / dt; i++) step(dt); },
};

function startDevOverlay() {
  const el = $('#dev-overlay');
  if (!el) return;
  el.classList.remove('hidden');
  let acc = 0, frames = 0, fps = 0;
  setInterval(() => {
    fps = frames; frames = 0;
    el.textContent =
      `${fps} fps  ${drawCalls()} calls\n` +
      `z ${state.z.toFixed(0)}  x ${state.x.toFixed(1)}\n` +
      `troops ${state.troops}  tier ${state.tier}\n` +
      `phase ${state.phase}${run.autoplay ? ' (auto)' : ''}`;
  }, 1000);
  const tick = () => { frames++; requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
}

boot().catch((e) => {
  console.error('[boot]', e);
  const t = $('#load-text');
  if (t) t.textContent = 'BOOT FAILED — ' + e.message;
});
