// Input. The whole game is two buttons and a thumb:
//   • drag anywhere on the left of the screen  → steer (horizontal)
//                                              → brake / drift (drag down)
//   • BOOST button  → spend a stored nitro
//   • ATTACK button → fire loadout slot 1, exactly what the button says
//   • two AUTO buttons above it → slots 2 and 3, which fire themselves
// Tilt and on-screen arrows are alternatives, chosen in settings. Desktop gets
// keys for everything.

import { profile } from './save.js';
import { clamp, clamp01, damp, $ } from './utils.js';
import { emit } from './bus.js';

export const input = {
  steer: 0,          // -1 (left) .. 1 (right), smoothed
  steerRaw: 0,
  throttle: 1,       // auto-throttle; drag-down or a key cuts it
  brake: 0,
  drifting: false,
  boostEdge: false,
  attackEdge: false,
  slotEdge: 0,       // an auto slot tapped to fire early (1 or 2)
  lookBack: false,
  active: false,     // a steering pointer is down
};

let steerPointer = null;
let originX = 0, originY = 0;
let keys = new Set();
let tiltZero = null;
let tiltValue = 0;
let tiltEnabled = false;
let padLeft = 0, padRight = 0;   // on-screen arrow buttons

const DRAG_FULL = 78;            // px of horizontal travel for full lock
const DRAG_BRAKE = 34;           // px of downward travel before braking starts
const DRAG_BRAKE_FULL = 120;

export function initInput() {
  const dom = document;
  dom.addEventListener('pointerdown', onDown, { passive: false });
  dom.addEventListener('pointermove', onMove, { passive: false });
  dom.addEventListener('pointerup', onUp, { passive: true });
  dom.addEventListener('pointercancel', onUp, { passive: true });

  window.addEventListener('keydown', onKey, false);
  window.addEventListener('keyup', onKeyUp, false);
  window.addEventListener('blur', () => { keys.clear(); resetSteer(); });

  // Action buttons. They swallow their own pointers so a thumb on BOOST never
  // yanks the steering.
  bindButton('btn-boost', () => { input.boostEdge = true; emit('input:boost'); });
  bindButton('btn-attack', () => { input.attackEdge = true; emit('input:attack'); });
  // The auto slots fire themselves, but a tap brings one forward — you can see
  // the gap opening before the condition does.
  bindButton('btn-auto-1', () => { input.slotEdge = 1; });
  bindButton('btn-auto-2', () => { input.slotEdge = 2; });
  bindHold('btn-look', (v) => { input.lookBack = v; });

  // On-screen arrows (settings: steer = 'buttons')
  bindHold('pad-left', (v) => { padLeft = v ? 1 : 0; });
  bindHold('pad-right', (v) => { padRight = v ? 1 : 0; });
  bindHold('pad-brake', (v) => { input.brake = v ? 1 : 0; });
}

function bindButton(id, fn) {
  const b = $(id);
  if (!b) return;
  const go = (e) => {
    e.preventDefault();
    e.stopPropagation();
    fn();
  };
  b.addEventListener('pointerdown', go, { passive: false });
}

function bindHold(id, fn) {
  const b = $(id);
  if (!b) return;
  const down = (e) => { e.preventDefault(); e.stopPropagation(); fn(true); };
  const up = (e) => { if (e) e.stopPropagation(); fn(false); };
  b.addEventListener('pointerdown', down, { passive: false });
  b.addEventListener('pointerup', up, { passive: true });
  b.addEventListener('pointerleave', up, { passive: true });
  b.addEventListener('pointercancel', up, { passive: true });
  // A touch that slides off the button never fires pointerup on it, and a held
  // hold-button that never releases is the worst kind of stuck input.
  window.addEventListener('pointerup', () => fn(false), { passive: true });
  window.addEventListener('pointercancel', () => fn(false), { passive: true });
}

// A pointer that lands on any UI chrome is not a steering pointer.
function isUI(target) {
  return !!(target && target.closest && target.closest('button, .screen, .popup, #cine, .no-steer'));
}

function onDown(e) {
  if (steerPointer !== null || isUI(e.target)) return;
  if (profile.settings.steer === 'buttons') return;
  steerPointer = e.pointerId;
  originX = e.clientX;
  originY = e.clientY;
  input.active = true;
  if (e.cancelable) e.preventDefault();
}

function onMove(e) {
  if (e.pointerId !== steerPointer) return;
  const dx = e.clientX - originX;
  const dy = e.clientY - originY;

  input.steerRaw = clamp(dx / DRAG_FULL, -1, 1);

  // Rubber-band the origin so a long drag can still return to centre without
  // lifting — the thumb never runs out of screen.
  if (Math.abs(dx) > DRAG_FULL) originX = e.clientX - Math.sign(dx) * DRAG_FULL;

  input.brake = clamp01((dy - DRAG_BRAKE) / (DRAG_BRAKE_FULL - DRAG_BRAKE));
  if (e.cancelable) e.preventDefault();
}

function onUp(e) {
  if (e.pointerId !== steerPointer) return;
  resetSteer();
}

function resetSteer() {
  steerPointer = null;
  input.steerRaw = 0;
  input.brake = 0;
  input.active = false;
}

function onKey(e) {
  if (e.repeat) return;
  const k = e.key.toLowerCase();
  keys.add(k);
  if (k === ' ' || k === 'shift') { input.boostEdge = true; emit('input:boost'); }
  if (k === 'f' || k === 'e' || k === 'control') { input.attackEdge = true; emit('input:attack'); }
  if (k === 'escape') emit('input:pause');
  if (k === 'p') emit('input:pause');
  if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
}

function onKeyUp(e) {
  keys.delete(e.key.toLowerCase());
}

const keyDown = (...ks) => ks.some((k) => keys.has(k));

// ---------------------------------------------------------------------------
// Tilt
// ---------------------------------------------------------------------------
export function enableTilt() {
  if (tiltEnabled) return Promise.resolve(true);
  const start = () => {
    window.addEventListener('deviceorientation', onTilt, true);
    tiltEnabled = true;
    tiltZero = null;
    return true;
  };
  const D = window.DeviceOrientationEvent;
  if (D && typeof D.requestPermission === 'function') {
    return D.requestPermission().then((r) => (r === 'granted' ? start() : false)).catch(() => false);
  }
  return Promise.resolve(start());
}

export function recentreTilt() { tiltZero = null; }

function onTilt(e) {
  // gamma is left/right lean in landscape-neutral terms; in portrait we want
  // beta instead. Use whichever axis the screen orientation makes horizontal.
  const angle = (screen.orientation && screen.orientation.angle) || window.orientation || 0;
  let v;
  if (angle === 90) v = -(e.beta || 0);
  else if (angle === -90 || angle === 270) v = (e.beta || 0);
  else v = (e.gamma || 0);
  if (tiltZero == null) tiltZero = v;
  tiltValue = v - tiltZero;
}

// ---------------------------------------------------------------------------
// Per-frame
// ---------------------------------------------------------------------------
export function updateInput(dt) {
  const s = profile.settings;
  let target = 0;

  if (s.steer === 'tilt' && tiltEnabled) {
    const span = 26 / clamp(s.tiltSens, 0.4, 2.2);
    target = clamp(tiltValue / span, -1, 1);
    if (s.invert) target = -target;
  } else if (s.steer === 'buttons') {
    target = padRight - padLeft;
  } else {
    target = input.steerRaw;
  }

  // Keyboard always overrides, so ?auto and desktop testing work regardless of
  // the saved control scheme.
  if (keyDown('arrowleft', 'a')) target = -1;
  if (keyDown('arrowright', 'd')) target = 1;

  input.steer += (target - input.steer) * damp(18, dt);
  if (Math.abs(input.steer) < 0.002) input.steer = 0;

  let brake = input.brake;
  if (keyDown('arrowdown', 's')) brake = 1;
  input.brake = brake;
  input.throttle = keyDown('arrowup', 'w') || !keyDown('arrowdown', 's') ? 1 : 0;
  input.drifting = brake > 0.45;
  // Never latch: the button's own handler owns the touch state, the key adds
  // to it for this frame only.
  if (keyDown('c')) input.lookBack = true;
}

export function consumeBoost() {
  const v = input.boostEdge;
  input.boostEdge = false;
  return v;
}

export function consumeAttack() {
  const v = input.attackEdge;
  input.attackEdge = false;
  return v;
}

export function consumeSlot() {
  const v = input.slotEdge;
  input.slotEdge = 0;
  return v;
}

export function clearInput() {
  keys.clear();
  resetSteer();
  input.steer = 0;
  input.boostEdge = false;
  input.attackEdge = false;
  input.slotEdge = 0;
  padLeft = padRight = 0;
}
