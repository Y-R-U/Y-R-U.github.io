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

const KEYAIM = { ArrowUp: [0, 1], ArrowDown: [0, -1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };

function keyAim(w, h) {
  let kx = 0, ky = 0;
  for (const k of input.keys) { const v = KEYAIM[k]; if (v) { kx += v[0]; ky += v[1]; } }
  const a = input.aim;
  if (!kx && !ky) { if (a.fromKeys) { a.active = false; a.fromKeys = false; } return; }
  const m = Math.hypot(kx, ky) || 1;
  a.fromKeys = true; a.active = true;
  a.ax = w * 0.5; a.ay = h * 0.5;
  a.sx = a.ax + (kx / m) * 80;
  a.sy = a.ay - (ky / m) * 80;     // screen y is down
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
