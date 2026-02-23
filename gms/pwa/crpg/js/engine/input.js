// ===== Touch / Input Handler =====
import { screenToWorld } from './renderer.js';

let touchStartX = 0, touchStartY = 0;
let touchStartTime = 0;
let isTouching = false;
let _velX = 0, _velY = 0;
let _onTap = null;

const TAP_MAX_MS  = 200;
const TAP_MAX_PX  = 8;
const MOVE_SCALE  = 0.05; // speed multiplier for drag

export function initInput(onTap) {
  _onTap = onTap;
  const canvas = document.getElementById('game-canvas');

  canvas.addEventListener('touchstart',  onTouchStart,  { passive: false });
  canvas.addEventListener('touchmove',   onTouchMove,   { passive: false });
  canvas.addEventListener('touchend',    onTouchEnd,    { passive: false });
  canvas.addEventListener('touchcancel', onTouchCancel, { passive: false });

  // Mouse fallback for desktop testing
  canvas.addEventListener('mousedown',  onMouseDown);
  canvas.addEventListener('mousemove',  onMouseMove);
  canvas.addEventListener('mouseup',    onMouseUp);
}

function onTouchStart(e) {
  e.preventDefault();
  const t = e.touches[0];
  touchStartX = t.clientX;
  touchStartY = t.clientY;
  touchStartTime = Date.now();
  isTouching = true;
  _velX = 0; _velY = 0;
}

function onTouchMove(e) {
  e.preventDefault();
  if (!isTouching) return;
  const t = e.touches[0];
  const dx = t.clientX - touchStartX;
  const dy = t.clientY - touchStartY;
  // Drag → velocity
  _velX = -dx * MOVE_SCALE;
  _velY = -dy * MOVE_SCALE;
  touchStartX = t.clientX;
  touchStartY = t.clientY;
}

function onTouchEnd(e) {
  e.preventDefault();
  const dt = Date.now() - touchStartTime;
  const t = e.changedTouches[0];
  const dx = Math.abs(t.clientX - touchStartX);
  const dy = Math.abs(t.clientY - touchStartY);

  if (dt < TAP_MAX_MS && dx < TAP_MAX_PX && dy < TAP_MAX_PX) {
    // Tap
    const canvas = document.getElementById('game-canvas');
    const rect = canvas.getBoundingClientRect();
    const sx = t.clientX - rect.left;
    const sy = t.clientY - rect.top;
    const world = screenToWorld(sx, sy);
    if (_onTap) _onTap(world.tx, world.ty, sx, sy);
  }

  isTouching = false;
  _velX = 0; _velY = 0;
}

function onTouchCancel() {
  isTouching = false;
  _velX = 0; _velY = 0;
}

// Mouse fallback
let mouseDown = false, lastMX = 0, lastMY = 0, mouseStartX = 0, mouseStartY = 0, mouseStartTime = 0;
function onMouseDown(e) {
  mouseDown = true;
  lastMX = e.clientX; lastMY = e.clientY;
  mouseStartX = e.clientX; mouseStartY = e.clientY;
  mouseStartTime = Date.now();
  _velX = 0; _velY = 0;
}
function onMouseMove(e) {
  if (!mouseDown) return;
  const dx = e.clientX - lastMX;
  const dy = e.clientY - lastMY;
  _velX = -dx * MOVE_SCALE;
  _velY = -dy * MOVE_SCALE;
  lastMX = e.clientX; lastMY = e.clientY;
}
function onMouseUp(e) {
  const dt = Date.now() - mouseStartTime;
  const dx = Math.abs(e.clientX - mouseStartX);
  const dy = Math.abs(e.clientY - mouseStartY);
  if (dt < TAP_MAX_MS && dx < 5 && dy < 5) {
    const canvas = document.getElementById('game-canvas');
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const world = screenToWorld(sx, sy);
    if (_onTap) _onTap(world.tx, world.ty, sx, sy);
  }
  mouseDown = false;
  _velX = 0; _velY = 0;
}

export function update() {
  // Called each frame — velocity is consumed by player.js
  // Dampen velocity
  _velX *= 0.3;
  _velY *= 0.3;
  if (Math.abs(_velX) < 0.001) _velX = 0;
  if (Math.abs(_velY) < 0.001) _velY = 0;
}

export function getVelocity() {
  return { vx: _velX, vy: _velY };
}
