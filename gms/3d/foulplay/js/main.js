// Boot and the frame loop. Everything else is behind flow.js.

import { loadProfile, profile } from './save.js';
import { initRenderer, render } from './render.js';
import { initInput } from './input.js';
import { initAudio } from './audio.js';
import { initHaptics } from './haptics.js';
import { boot, update, present } from './flow.js';
import { state } from './state.js';
import { $, clamp } from './utils.js';
import { SPEED_ARG, DEV_MODE, SHOT_MODE, AUTO_MODE } from './config.js';

loadProfile();

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
if (DEV_MODE) {
  window.__game = { state, profile };
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
