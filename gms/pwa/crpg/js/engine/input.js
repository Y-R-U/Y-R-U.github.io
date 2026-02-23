// ===== Input Handler — Tap / Click only =====
// Movement is handled by the pathfinder; this module only detects taps/clicks
// and reports them as world-coordinate interact events.

// screenToWorld injected from main.js to break circular dependency
let _screenToWorld = (sx, sy) => ({ tx: sx / 16, ty: sy / 16 });
export function setScreenToWorld(fn) { _screenToWorld = fn; }

const TAP_MAX_MS = 300;
const TAP_MAX_PX = 12;

let _onTap = null;

export function initInput(onTap) {
  _onTap = onTap;
  const canvas = document.getElementById('game-canvas');

  // Touch
  canvas.addEventListener('touchstart',  onTouchStart,  { passive: true });
  canvas.addEventListener('touchend',    onTouchEnd,    { passive: false });
  canvas.addEventListener('touchcancel', () => { _touch = null; }, { passive: true });

  // Mouse (desktop)
  canvas.addEventListener('mousedown', onMouseDown);
  canvas.addEventListener('mouseup',   onMouseUp);
}

// ===== Touch =====
let _touch = null;

function onTouchStart(e) {
  const t = e.touches[0];
  _touch = { x: t.clientX, y: t.clientY, t: Date.now() };
}

function onTouchEnd(e) {
  if (!_touch) return;
  const t = e.changedTouches[0];
  const dx = t.clientX - _touch.x;
  const dy = t.clientY - _touch.y;
  const dt = Date.now() - _touch.t;
  _touch = null;

  if (dt < TAP_MAX_MS && Math.sqrt(dx * dx + dy * dy) < TAP_MAX_PX) {
    e.preventDefault();
    _fireTap(t.clientX, t.clientY);
  }
}

// ===== Mouse =====
let _mouse = null;

function onMouseDown(e) {
  _mouse = { x: e.clientX, y: e.clientY, t: Date.now() };
}

function onMouseUp(e) {
  if (!_mouse) return;
  const dx = e.clientX - _mouse.x;
  const dy = e.clientY - _mouse.y;
  const dt = Date.now() - _mouse.t;
  _mouse = null;

  if (dt < TAP_MAX_MS && Math.sqrt(dx * dx + dy * dy) < TAP_MAX_PX) {
    _fireTap(e.clientX, e.clientY);
  }
}

// ===== Shared tap logic =====
function _fireTap(clientX, clientY) {
  if (!_onTap) return;
  const canvas = document.getElementById('game-canvas');
  const rect = canvas.getBoundingClientRect();
  const sx = clientX - rect.left;
  const sy = clientY - rect.top;
  const { tx, ty } = _screenToWorld(sx, sy);
  _onTap(tx, ty, sx, sy);
}

// ===== No-op update (kept for API compatibility) =====
export function update() {}

// ===== Unused stubs kept so imports don't break =====
export function getVelocity() { return { vx: 0, vy: 0 }; }
export function setJoystickHintFn() {}
export function drawJoystickHint() {}
