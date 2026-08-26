// Pointer/keyboard capture. CONTRACTS §3b: relative anchor steering, HUD touches never steer.

import { CTRL } from '../data/tuning.js';

let hitTest = () => null;
try {
  const m = await import('../ui/hitrects.js');
  if (m && typeof m.hitTest === 'function') hitTest = m.hitTest;
} catch { /* UI not present yet — every touch steers */ }

export const input = {
  aim: { active: false, ax: 0, ay: 0, sx: 0, sy: 0 },
  slots: [false, false, false, false],
  takeoff: false,
  pause: false,
  pauseEdge: false,
  keys: new Set(),
};

const held = new Map();          // pointerId -> button id, for non-steering touches
let steerId = null;
let el = null;

function local(ev) {
  const r = el.getBoundingClientRect();
  return { x: ev.clientX - r.left, y: ev.clientY - r.top };
}

function press(id, on) {
  if (id === null) return;
  if (id === 'takeoff') input.takeoff = on;
  else if (id === 'pause') { if (on && !input.pause) input.pauseEdge = true; input.pause = on; }
  else if (id.startsWith('slot')) {
    const i = +id.slice(4);
    if (i >= 0 && i < 4) input.slots[i] = on;
  }
}

function down(ev) {
  const p = local(ev);
  const id = hitTest(p.x, p.y);
  if (id) { held.set(ev.pointerId, id); press(id, true); return; }
  if (steerId !== null) return;
  steerId = ev.pointerId;
  const a = input.aim;
  a.active = true; a.ax = p.x; a.ay = p.y; a.sx = p.x; a.sy = p.y;
}

function move(ev) {
  if (ev.pointerId !== steerId) return;
  const p = local(ev);
  const a = input.aim;
  a.sx = p.x; a.sy = p.y;
  // floating anchor: drag it along so a long sweep cannot run off the screen
  const dx = a.sx - a.ax, dy = a.sy - a.ay;
  const m = Math.hypot(dx, dy);
  if (m > CTRL.maxPx) {
    const k = (m - CTRL.maxPx) / m;
    a.ax += dx * k; a.ay += dy * k;
  }
}

function up(ev) {
  if (held.has(ev.pointerId)) { press(held.get(ev.pointerId), false); held.delete(ev.pointerId); }
  if (ev.pointerId === steerId) { steerId = null; input.aim.active = false; }
}

// Keyboard steering is a RATE control, not a compass: hold Right/D and the nose keeps turning
// clockwise for as long as you hold it, Left/A anticlockwise. Aaron's ruling — pointing the nose
// at a fixed compass direction felt wrong on a keyboard, where there is no finger position to
// read. Touch stays the relative position control of CONTRACTS §3b; only keys differ.
const KEY_CW = new Set(['ArrowRight', 'd', 'D']);
const KEY_CCW = new Set(['ArrowLeft', 'a', 'A']);
const KEYAIM = { ArrowUp: 1, ArrowDown: 1, ArrowLeft: 1, ArrowRight: 1 };

let keyAngle = 0;        // the heading the keys are steering toward, world radians

/** main.js calls this while no steering key is held, so pressing one never snaps the nose. */
export function syncKeyAngle(ang) {
  if (!input.aim.fromKeys) keyAngle = ang;
}

function keyAim(w, h) {
  let dir = 0;
  for (const k of input.keys) {
    if (KEY_CW.has(k)) dir -= 1;
    if (KEY_CCW.has(k)) dir += 1;
  }
  const a = input.aim;
  if (!dir) { if (a.fromKeys) { a.active = false; a.fromKeys = false; } return; }
  keyAngle += dir * (CTRL.kbdRate || 3) * (1 / 60);
  a.fromKeys = true; a.active = true;
  a.ax = w * 0.5; a.ay = h * 0.5;
  a.sx = a.ax + Math.cos(keyAngle) * 80;
  a.sy = a.ay - Math.sin(keyAngle) * 80;     // screen y is down, world y is up
}

function keydown(ev) {
  if (ev.repeat) return;
  input.keys.add(ev.key);
  if (ev.key >= '1' && ev.key <= '4') input.slots[+ev.key - 1] = true;
  if (ev.key === ' ') input.slots[0] = true;
  if (ev.key === 'Enter') input.takeoff = true;
  if (ev.key === 'Escape' || ev.key === 'p') { input.pauseEdge = true; input.pause = true; }
  if (KEYAIM[ev.key]) ev.preventDefault();
}

function keyup(ev) {
  input.keys.delete(ev.key);
  if (ev.key >= '1' && ev.key <= '4') input.slots[+ev.key - 1] = false;
  if (ev.key === ' ') input.slots[0] = false;
  if (ev.key === 'Enter') input.takeoff = false;
  if (ev.key === 'Escape' || ev.key === 'p') input.pause = false;
}

export function attachInput(target) {
  el = target;
  el.addEventListener('pointerdown', down, { passive: true });
  el.addEventListener('pointermove', move, { passive: true });
  el.addEventListener('pointerup', up, { passive: true });
  el.addEventListener('pointercancel', up, { passive: true });
  el.addEventListener('lostpointercapture', up, { passive: true });
  window.addEventListener('blur', clearAll);
  window.addEventListener('keydown', keydown);
  window.addEventListener('keyup', keyup);
  window.addEventListener('contextmenu', (e) => e.preventDefault());
}

export function clearAll() {
  steerId = null;
  input.aim.active = false;
  input.keys.clear();
  held.clear();
  for (let i = 0; i < 4; i++) input.slots[i] = false;
  input.takeoff = false; input.pause = false;
}

/** Called once per frame by main.js before the sim ticks. */
export function pollInput(w, h) {
  if (steerId === null) keyAim(w, h);
  const edge = input.pauseEdge;
  input.pauseEdge = false;
  return edge;
}

export { hitTest };
