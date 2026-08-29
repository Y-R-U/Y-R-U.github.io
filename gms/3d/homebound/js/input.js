// One thumb. A drag anywhere on the stage moves the squad's target x by the
// drag delta — relative, not absolute, because an absolute mapping means the
// squad teleports the instant you put your thumb down.
//
// SCREEN_X is -1 and that is not a typo. The camera looks along +Z, so three's
// lookAt yaws it 180 degrees and world +X lands on the LEFT of the screen. Drag
// deltas are in screen space and have to be flipped before they touch world x,
// or the squad walks away from your thumb.

import { RUN, ROAD, AUTO_MODE, IS_TOUCH } from './config.js';
import { state } from './state.js';
import { clamp } from './utils.js';

const SCREEN_X = -1;
let dragging = false, lastX = 0, held = false;
let autoT = 0, autoTarget = 0;

export function initInput(el) {
  const down = (x) => { dragging = true; held = true; lastX = x; };
  const move = (x) => {
    if (!dragging) return;
    const d = (x - lastX) * RUN.dragScale * SCREEN_X;
    lastX = x;
    state.targetX = clamp(state.targetX + d, -ROAD.halfW, ROAD.halfW);
  };
  const up = () => { dragging = false; held = false; };

  el.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button, .no-drag')) return;
    el.setPointerCapture?.(e.pointerId);
    down(e.clientX);
  }, { passive: true });
  el.addEventListener('pointermove', (e) => move(e.clientX), { passive: true });
  el.addEventListener('pointerup', up, { passive: true });
  el.addEventListener('pointercancel', up, { passive: true });
  el.addEventListener('lostpointercapture', up, { passive: true });

  // Keyboard is for the desk, and for the headless harness driving a level.
  const keys = new Set();
  window.addEventListener('keydown', (e) => { keys.add(e.key); });
  window.addEventListener('keyup', (e) => keys.delete(e.key));
  keyState = keys;
}
let keyState = new Set();

export const isHeld = () => held;

export function updateInput(dt) {
  const step = RUN.steerRate * dt * SCREEN_X;
  if (keyState.has('ArrowLeft') || keyState.has('a')) state.targetX = clamp(state.targetX - step, -ROAD.halfW, ROAD.halfW);
  if (keyState.has('ArrowRight') || keyState.has('d')) state.targetX = clamp(state.targetX + step, -ROAD.halfW, ROAD.halfW);
}

// The AI thumb. It runs the main screen's autoplay backdrop and `?auto`. It
// steers toward whatever `pickTarget` says is worth the most, which is also a
// cheap sanity check on level design: if the AI cannot find a good line
// through a level, the level has no good line in it.
export function updateAutoThumb(dt, pickTarget) {
  autoT -= dt;
  if (autoT <= 0) {
    autoT = 0.28;
    const t = pickTarget?.();
    if (t != null) autoTarget = clamp(t, -ROAD.halfW, ROAD.halfW);
  }
  const d = autoTarget - state.targetX;
  const step = RUN.steerRate * 0.72 * dt;
  state.targetX = clamp(state.targetX + clamp(d, -step, step), -ROAD.halfW, ROAD.halfW);
}

export const AUTO = AUTO_MODE;
export const TOUCH = IS_TOUCH;
