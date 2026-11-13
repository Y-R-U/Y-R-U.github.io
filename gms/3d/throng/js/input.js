import { CONFIG } from './config.js';

// Screen (sx right, sy down) → world XZ for a camera with the given yaw (0 = camera looking toward -Z).
export function screenToWorld(sx, sy, yaw, out) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  out.x = sx * c + sy * s;
  out.z = -sx * s + sy * c;
  return out;
}

// Mouse users can steer by pointing (setMouseMode('follow')): the crowd heads for the ground under the cursor, no
// button held. Needs getLeader() → the local crowd's sim state and groundPoint(clientX, clientY, out). Touch and pen
// always use the floating joystick; keys override both while held.
export function createInput({ el, getYaw = () => 0, onActivity = () => {}, getLeader = () => null, groundPoint = () => null }) {
  const cfg = CONFIG.INPUT;
  const keys = new Set();
  const joy = document.createElement('div');
  joy.className = 'joy hidden';
  joy.innerHTML = '<div class="joy-base"></div><div class="joy-knob"></div>';
  document.body.appendChild(joy);
  const knob = joy.querySelector('.joy-knob');

  let pid = null, ox = 0, oy = 0, sx = 0, sy = 0;
  let lastX = 0, lastZ = 0;             // last world direction (kept on release)
  let enabled = true;
  let keep = cfg.keepMovingOnRelease;
  const keepMoving = () => keep;
  const tmp = { x: 0, z: 0 }, gp = { x: 0, z: 0 };
  let mouseMode = 'follow', mx = 0, my = 0, mouseIn = false, mouseSeen = false, fx = 0, fz = 0, fAt = 0;
  const follow = () => mouseMode === 'follow' && mouseSeen;
  window.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    mx = e.clientX; my = e.clientY; mouseIn = mouseSeen = true;
  }, { passive: true });
  document.documentElement.addEventListener('mouseleave', () => { mouseIn = false; });
  window.addEventListener('blur', () => { mouseIn = false; });

  function place() {
    joy.style.transform = `translate3d(${ox}px, ${oy}px, 0)`;
    knob.style.transform = `translate3d(${sx * cfg.joyRadius}px, ${sy * cfg.joyRadius}px, 0)`;
  }

  function down(e) {
    if (!enabled || pid !== null) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (e.pointerType === 'mouse' && mouseMode === 'follow') { mx = e.clientX; my = e.clientY; mouseIn = mouseSeen = true; onActivity(); e.preventDefault(); return; }
    pid = e.pointerId;
    ox = e.clientX; oy = e.clientY; sx = sy = 0;
    try { el.setPointerCapture(pid); } catch {}
    joy.classList.remove('hidden');
    place();
    onActivity();
    e.preventDefault();
  }
  function move(e) {
    if (e.pointerId !== pid) return;
    let dx = e.clientX - ox, dy = e.clientY - oy;
    const R = cfg.joyRadius, d = Math.hypot(dx, dy);
    if (d > R) {
      // Floating base: drag past the rim and the base follows the thumb.
      ox += dx * (1 - R / d); oy += dy * (1 - R / d);
      dx = e.clientX - ox; dy = e.clientY - oy;
    }
    sx = dx / R; sy = dy / R;
    place();
    e.preventDefault();
  }
  function up(e) {
    if (e.pointerId !== pid) return;
    pid = null;
    joy.classList.add('hidden');
    if (!keepMoving()) { lastX = lastZ = 0; }
    sx = sy = 0;
  }
  el.addEventListener('pointerdown', down);
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
  el.addEventListener('lostpointercapture', up);
  el.addEventListener('contextmenu', (e) => e.preventDefault());

  const KEYMAP = { KeyW: 'u', ArrowUp: 'u', KeyS: 'd', ArrowDown: 'd', KeyA: 'l', ArrowLeft: 'l', KeyD: 'r', ArrowRight: 'r' };
  const kd = (e) => {
    const k = KEYMAP[e.code];
    if (!k || !enabled) return;
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    keys.add(k); onActivity(); e.preventDefault();
  };
  const ku = (e) => {
    const k = KEYMAP[e.code];
    if (!k) return;
    keys.delete(k);
    if (!keys.size && !keepMoving() && pid === null) lastX = lastZ = 0;
  };
  window.addEventListener('keydown', kd);
  window.addEventListener('keyup', ku);
  window.addEventListener('blur', () => keys.clear());

  // World-space move vector, length 0..1.
  function vector(out = { x: 0, z: 0 }) {
    let vx = 0, vy = 0;
    if (keys.size) {
      vx = (keys.has('r') ? 1 : 0) - (keys.has('l') ? 1 : 0);
      vy = (keys.has('d') ? 1 : 0) - (keys.has('u') ? 1 : 0);
      const l = Math.hypot(vx, vy);
      if (l) { vx /= l; vy /= l; }
    } else if (pid !== null) {
      const l = Math.hypot(sx, sy);
      if (l > cfg.deadZone) { const m = Math.min(1, l); vx = sx / l * m; vy = sy / l * m; }
    }
    if (!vx && !vy && pid === null && follow()) return followVector(out);
    if (vx || vy) {
      screenToWorld(vx, vy, getYaw(), tmp);
      const l = Math.hypot(tmp.x, tmp.z);
      // Partial deflection still steers at full speed once past the dead zone: io-games feel sluggish otherwise.
      lastX = tmp.x / l; lastZ = tmp.z / l;
      out.x = lastX; out.z = lastZ;
      return out;
    }
    if (pid !== null) { out.x = lastX; out.z = lastZ; return out; }
    out.x = keepMoving() ? lastX : 0; out.z = keepMoving() ? lastZ : 0;
    return out;
  }

  // Steer from the leader's SIM position (not the drawn, look-ahead camera) to the cursor's ground point, so the
  // camera moving under a resting cursor cannot feed back into the heading; a short low-pass absorbs punch zooms.
  function followVector(out) {
    const C = cfg, now = performance.now();
    const dt = Math.min(0.25, Math.max(0, (now - (fAt || now)) / 1000));
    fAt = now;
    let tx = fx, tz = fz;
    if (mouseIn) {
      const L = getLeader();
      const g = L && groundPoint(mx, my, gp);
      if (g) {
        const dx = g.x - L.x, dz = g.z - L.z, d = Math.hypot(dx, dz);
        const m = Math.max(0, Math.min(1, (d - C.followDead) / (C.followFull - C.followDead)));
        tx = d > 1e-6 ? dx / d * m : 0; tz = d > 1e-6 ? dz / d * m : 0;
      }
    } else if (!keepMoving()) { tx = tz = 0; }
    const k = 1 - Math.exp(-dt / C.followTau);
    fx += (tx - fx) * k; fz += (tz - fz) * k;
    const l = Math.hypot(fx, fz);
    if (l > 1) { fx /= l; fz /= l; }
    if (l > 0.05) { lastX = fx / Math.max(l, 1e-6); lastZ = fz / Math.max(l, 1e-6); }
    out.x = fx; out.z = fz;
    return out;
  }

  function reset() { pid = null; keys.clear(); lastX = lastZ = 0; sx = sy = 0; fx = fz = 0; fAt = 0; joy.classList.add('hidden'); }
  function setEnabled(v) { enabled = v; if (!v) reset(); }

  return {
    vector, reset, setEnabled, setKeepMoving(v) { keep = !!v; },
    setMouseMode(m) { mouseMode = m === 'drag' ? 'drag' : 'follow'; },
    get mouseMode() { return mouseMode; },
    get following() { return follow() && pid === null && !keys.size; },
    get dragging() { return pid !== null || (follow() && mouseIn); }, get enabled() { return enabled; },
  };
}
