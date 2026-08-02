// Boot and the frame loop. Everything else is behind flow.js.

import { loadProfile, profile } from './save.js';
import { initRenderer, render, isContextLost, refreshAfterResume } from './render.js';
import { initInput } from './input.js';
import { initAudio } from './audio.js';
import { initHaptics } from './haptics.js';
import { boot, update, present, pauseForBlur } from './flow.js';
import { state } from './state.js';
import { $, clamp } from './utils.js';
import { SPEED_ARG, DEV_MODE, SHOT_MODE, AUTO_MODE, WIPE_ARG } from './config.js';

loadProfile();

// br8t account and cloud save — never fatal: offline or blocked just means the
// local save stands alone. Skipped for the unattended flags, not least because
// a signed-in ?wipe would pull the save straight back down again.
if (!AUTO_MODE && !SHOT_MODE && !WIPE_ARG) {
  import('./cloud.js').catch(() => { /* play on with a purely local save */ });
}

const container = $('game-container');
initRenderer(container);
initInput();
initAudio();
initHaptics();

// The saved control scheme decides whether the on-screen arrows exist.
if (profile.settings.steer === 'buttons') {
  ['pad-left', 'pad-right', 'pad-brake'].forEach((id) => $(id) && $(id).classList.remove('hidden'));
}

boot();

const loading = $('loading');
setTimeout(() => {
  loading.classList.add('gone');
  setTimeout(() => loading.remove(), 500);
}, 260);

// ---------------------------------------------------------------------------
let last = performance.now();
let acc = 0;
const MAX_DT = 1 / 20;          // never simulate a frame longer than this
const scale = SPEED_ARG || 1;

function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.5) dt = 1 / 60;    // tab was hidden: do not teleport everything
  dt = Math.min(dt, 0.1) * scale;

  // Nothing to draw into. Keep the clock ticking over so the first frame after
  // a restore is an ordinary one, but do not simulate or render — issuing GL
  // calls at a dead context is what turns "backgrounded for a minute" into a
  // permanently black screen.
  if (isContextLost()) { acc = 0; return; }
  state.dt = dt;
  state.time += dt;

  // Fixed-ish stepping keeps the contact solver stable at low frame rates;
  // the frame is drawn once regardless of how many steps it took.
  acc += dt;
  let steps = 0;
  while (acc > MAX_DT && steps < 4) {
    update(MAX_DT);
    acc -= MAX_DT;
    steps++;
  }
  if (acc > 0) {
    update(acc);
    acc = 0;
  }
  present(dt);
}
requestAnimationFrame(frame);

// ---------------------------------------------------------------------------
// Coming back from the home screen
// ---------------------------------------------------------------------------
// Three things have to happen, and none of them were happening. The clock has
// to be re-based, or the first frame back carries however long you were away
// (the 0.5s guard above catches the worst of it, but the accumulator can still
// be holding a step); the canvas has to be re-measured, because a phone hands
// it back at a different size once the address bar has been in and out; and a
// race in progress should not have been running while you were not looking.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { pauseForBlur(); return; }
  last = performance.now();
  acc = 0;
  refreshAfterResume();
});
// Safari on iOS does not reliably fire visibilitychange when the app is swiped
// away, but it does fire pagehide. Window `blur` is deliberately NOT used: it
// goes off for devtools, for another window taking focus, and in a headless run
// that never had focus at all, which would silently pause every soak test.
window.addEventListener('pagehide', pauseForBlur);

if (DEV_MODE) {
  window.__game = { state, profile };
  // The highlights reel is the hardest thing in the game to check by eye — it
  // only exists for a few seconds after a race — so dev mode hands the whole
  // module over and a headless run can harvest, replay and measure it.
  import('./highlights.js').then((hl) => { window.__game.highlights = hl; });
  import('./render.js').then((r) => { window.__game.render = r; });
  console.log('[foulplay] dev mode — window.__game available');

  // Telemetry for balance passes: speed, position and heat, sampled 4×/second.
  const tel = { speed: [], pos: [], susp: [], hype: [], top: 0, offTrack: 0, wrecks: 0, why: {}, whyAll: {} };
  window.__game.tel = tel;
  import('./bus.js').then(({ on }) => {
    on('car:wreck', ({ car, reason }) => {
      const bag = car.isPlayer ? tel.why : tel.whyAll;
      bag[reason] = (bag[reason] || 0) + 1;
    });
  });
  setInterval(() => {
    const p = state.player;
    if (!p || state.screen !== 'race' || state.phase !== 'racing') return;
    const kmh = p.forwardSpeed * 3.6;
    tel.speed.push(Math.round(kmh));
    tel.pos.push(p.position);
    tel.susp.push(Math.round(state.suspicion));
    tel.hype.push(Math.round(state.hype));
    tel.top = Math.max(tel.top, kmh);
    if (Math.abs(p.t) > (p.frame.width || 11)) tel.offTrack++;
    if (p.mode === 'wreck') tel.wrecks++;
    if (p.frame.inverted) tel.inverted = (tel.inverted || 0) + 1;
    if (p.h > 0.5) tel.air = (tel.air || 0) + 1;
    tel.maxH = Math.max(tel.maxH || 0, p.h);
  }, 250);
}
if (AUTO_MODE || SHOT_MODE) {
  window.__game = window.__game || {};
  window.__game.state = state;
}
window.__ready = true;
