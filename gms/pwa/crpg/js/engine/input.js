// ===== Touch / Mouse Input Handler =====
// Joystick-style: velocity set by displacement from touch origin, not delta between events.
// This gives reliable movement regardless of touchmove frequency.

// screenToWorld injected from main.js to avoid circular renderer ↔ input dependency
let _screenToWorld = (sx, sy) => ({ tx: sx / 16, ty: sy / 16 });
export function setScreenToWorld(fn) { _screenToWorld = fn; }
function screenToWorld(sx, sy) { return _screenToWorld(sx, sy); }

const MAX_DRAG_PX = 72;   // pixels of drag that = max movement speed
const MAX_SPEED   = 0.10; // tiles per frame at max drag (≈ 6 tiles/sec at 60fps)
const TAP_MAX_MS  = 220;
const TAP_MAX_PX  = 10;

let touchOriginX = 0, touchOriginY = 0;  // where finger started
let touchCurrX = 0, touchCurrY = 0;      // current finger position
let touchStartTime = 0;
let isTouching = false;
let _velX = 0, _velY = 0;
let _onTap = null;

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
  canvas.addEventListener('mouseleave', onMouseLeave);
}

// ===== Touch handlers =====
function onTouchStart(e) {
  e.preventDefault();
  const t = e.touches[0];
  touchOriginX = t.clientX;
  touchOriginY = t.clientY;
  touchCurrX   = t.clientX;
  touchCurrY   = t.clientY;
  touchStartTime = Date.now();
  isTouching = true;
  _velX = 0;
  _velY = 0;
}

function onTouchMove(e) {
  e.preventDefault();
  if (!isTouching) return;
  const t = e.touches[0];
  touchCurrX = t.clientX;
  touchCurrY = t.clientY;
  _applyJoystick(touchCurrX - touchOriginX, touchCurrY - touchOriginY);
}

function onTouchEnd(e) {
  e.preventDefault();
  const t = e.changedTouches[0];
  const dx = t.clientX - touchOriginX;
  const dy = t.clientY - touchOriginY;
  const dt = Date.now() - touchStartTime;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dt < TAP_MAX_MS && dist < TAP_MAX_PX) {
    // It's a tap — fire interact
    const canvas = document.getElementById('game-canvas');
    const rect = canvas.getBoundingClientRect();
    const sx = t.clientX - rect.left;
    const sy = t.clientY - rect.top;
    const world = screenToWorld(sx, sy);
    if (_onTap) _onTap(world.tx, world.ty, sx, sy);
  }

  isTouching = false;
  _velX = 0;
  _velY = 0;
}

function onTouchCancel() {
  isTouching = false;
  _velX = 0;
  _velY = 0;
}

// ===== Mouse handlers =====
let mouseDown = false;
let mouseOriginX = 0, mouseOriginY = 0;
let mouseStartTime = 0;

function onMouseDown(e) {
  mouseDown = true;
  mouseOriginX = e.clientX;
  mouseOriginY = e.clientY;
  mouseStartTime = Date.now();
  _velX = 0;
  _velY = 0;
}

function onMouseMove(e) {
  if (!mouseDown) return;
  const dx = e.clientX - mouseOriginX;
  const dy = e.clientY - mouseOriginY;
  _applyJoystick(dx, dy);
}

function onMouseUp(e) {
  const dx = e.clientX - mouseOriginX;
  const dy = e.clientY - mouseOriginY;
  const dt = Date.now() - mouseStartTime;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dt < TAP_MAX_MS && dist < TAP_MAX_PX) {
    const canvas = document.getElementById('game-canvas');
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const world = screenToWorld(sx, sy);
    if (_onTap) _onTap(world.tx, world.ty, sx, sy);
  }

  mouseDown = false;
  _velX = 0;
  _velY = 0;
}

function onMouseLeave() {
  mouseDown = false;
  _velX = 0;
  _velY = 0;
}

// ===== Joystick math =====
function _applyJoystick(dx, dy) {
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist < 3) {
    // Dead zone — finger barely moved
    _velX = 0;
    _velY = 0;
    return;
  }
  // Speed scales linearly up to MAX_DRAG_PX, capped at MAX_SPEED
  const speed = Math.min(dist / MAX_DRAG_PX, 1) * MAX_SPEED;
  _velX = (dx / dist) * speed;
  _velY = (dy / dist) * speed;
}

// ===== Frame update =====
export function update() {
  // When not touching, smoothly decelerate (glide stop)
  if (!isTouching && !mouseDown) {
    _velX *= 0.80;
    _velY *= 0.80;
    if (Math.abs(_velX) < 0.0005) _velX = 0;
    if (Math.abs(_velY) < 0.0005) _velY = 0;
  }
}

export function getVelocity() {
  return { vx: _velX, vy: _velY };
}

export function isTouchActive() {
  return isTouching || mouseDown;
}

// Draw joystick ring hint on canvas while touching (optional visual feedback)
export function drawJoystickHint(ctx) {
  if (!isTouching) return;
  const canvas = document.getElementById('game-canvas');
  const rect = canvas.getBoundingClientRect();
  const ox = touchOriginX - rect.left;
  const oy = touchOriginY - rect.top;
  const cx = touchCurrX  - rect.left;
  const cy = touchCurrY  - rect.top;

  // Outer ring
  ctx.beginPath();
  ctx.arc(ox, oy, MAX_DRAG_PX, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Inner dead-zone
  ctx.beginPath();
  ctx.arc(ox, oy, 8, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.2)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Knob at finger position (clamped to ring)
  const dx = cx - ox, dy = cy - oy;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const clampedDist = Math.min(dist, MAX_DRAG_PX);
  const angle = Math.atan2(dy, dx);
  const kx = ox + Math.cos(angle) * clampedDist;
  const ky = oy + Math.sin(angle) * clampedDist;

  ctx.beginPath();
  ctx.arc(kx, ky, 18, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(78,204,163,0.25)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(78,204,163,0.6)';
  ctx.lineWidth = 2;
  ctx.stroke();
}
